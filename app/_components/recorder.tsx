'use client';

import React, { useEffect, useRef, useState } from 'react';

type UploadedPayload = {
  publicId: string;
  playbackMp4: string;
  downloadMp4: string;
  mime: string;
  width: number;
  height: number;
};

type Props = {
  jobId: string;
  onUploaded: (payload: UploadedPayload) => void;
};

type Mask = 'None' | 'Circle';

export default function Recorder({ jobId, onUploaded }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCam, setSelectedCam] = useState<string | undefined>();
  const [selectedMic, setSelectedMic] = useState<string | undefined>();

  const [mask, setMask] = useState<Mask>('Circle');

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  // Helpers
  const cams = devices.filter((d) => d.kind === 'videoinput');
  const mics = devices.filter((d) => d.kind === 'audioinput');

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        setDevices(list);
        // sensible defaults
        const firstCam = list.find((d) => d.kind === 'videoinput');
        const firstMic = list.find((d) => d.kind === 'audioinput');
        setSelectedCam((c) => c ?? firstCam?.deviceId);
        setSelectedMic((m) => m ?? firstMic?.deviceId);
      })
      .catch(() => {});
  }, []);

  // Start camera with current selections
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: selectedCam ? { deviceId: { exact: selectedCam } } : true,
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Turn off camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  // Restart camera if device selection changes
  useEffect(() => {
    if (stream) {
      stopCamera();
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCam, selectedMic]);

  // Recording handlers
  const handleStartStop = async () => {
    // If not recording, start
    if (!isRecording) {
      if (!stream) await startCamera();

      chunksRef.current = [];
      const mr = new MediaRecorder((videoRef.current?.srcObject as MediaStream) ?? stream!, {
        mimeType:
          MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm',
      });

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedBlob(blob);
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      return;
    }

    // If recording, stop
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleUpload = async () => {
    if (!recordedBlob) return;
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('file', recordedBlob, 'recording.webm');
      form.append('jobId', jobId);

      const res = await fetch('/api/upload-video', {
        method: 'POST',
        body: form,
      });

      if (!res.ok) throw new Error('Upload failed');

      const payload = (await res.json()) as UploadedPayload;
      onUploaded(payload);
      // Optionally clear the local blob after successful upload
      setRecordedBlob(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Controls row 1 */}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm">Mask</label>
        <select
          value={mask}
          onChange={(e) => setMask(e.target.value as Mask)}
          className="border rounded px-2 py-1"
        >
          <option>None</option>
          <option>Circle</option>
        </select>

        <select
          value={selectedCam}
          onChange={(e) => setSelectedCam(e.target.value)}
          className="border rounded px-2 py-1"
          style={{ minWidth: 220, maxWidth: 360, flex: '1 1 260px' }}
        >
          {cams.map((c) => (
            <option key={c.deviceId} value={c.deviceId}>
              {c.label || 'Camera'}
            </option>
          ))}
        </select>

        {/* Mic dropdown: slightly reduced so it never overflows */}
        <select
          value={selectedMic}
          onChange={(e) => setSelectedMic(e.target.value)}
          className="border rounded px-2 py-1"
          style={{ minWidth: 200, maxWidth: 300, flex: '1 1 220px' }}
          title="Microphone"
        >
          {mics.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label || 'Microphone'}
            </option>
          ))}
        </select>
      </div>

      {/* Video */}
      <div
        className="bg-black rounded overflow-hidden"
        style={{ width: '100%', maxWidth: 920, aspectRatio: '16 / 9' }}
      >
        <video
          ref={videoRef}
          playsInline
          muted={false}
          autoPlay
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            // Masking
            WebkitMaskImage: mask === 'Circle' ? 'radial-gradient(circle, #000 70%, transparent 71%)' : undefined,
            maskImage: mask === 'Circle' ? 'radial-gradient(circle, #000 70%, transparent 71%)' : undefined,
          }}
        />
      </div>

      {/* Controls row 2 */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleStartStop}
            className={
              isRecording
                ? 'px-3 py-2 rounded bg-red-600 text-white'
                : 'px-3 py-2 rounded bg-blue-600 text-white'
            }
          >
            {isRecording ? 'Stop' : 'Start recording'}
          </button>

          <button
            type="button"
            onClick={stopCamera}
            className="px-3 py-2 rounded border"
          >
            Turn off camera
          </button>
        </div>

        {/* Upload at far right, only when a recording exists and we're not currently recording */}
        {recordedBlob && !isRecording && (
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading}
            className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
          >
            {isUploading ? 'Uploading…' : 'Upload'}
          </button>
        )}
      </div>
    </div>
  );
}
