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
  const [error, setError] = useState<string | null>(null);

  // Discover devices on mount
  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        setDevices(list);
        setSelectedCam(list.find((d) => d.kind === 'videoinput')?.deviceId);
        setSelectedMic(list.find((d) => d.kind === 'audioinput')?.deviceId);
      })
      .catch((e) => setError(e?.message || 'Could not access devices'));
  }, []);

  // Open camera/mic
  async function getStream() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedCam ? { exact: selectedCam } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          deviceId: selectedMic ? { exact: selectedMic } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to enable camera/mic');
    }
  }

  function getBestMime(): string {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/mp4;codecs=h264,aac',
      'video/webm',
    ];
    for (const t of candidates) if (MediaRecorder.isTypeSupported(t)) return t;
    return ''; // let browser choose
  }

  function startRecording() {
    if (!stream) return;
    const mime = getBestMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRecorderRef.current = mr;
    chunksRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'video/webm' });
      const width = videoRef.current?.videoWidth || 0;
      const height = videoRef.current?.videoHeight || 0;

      setIsUploading(true);
      setError(null);
      try {
        const body = new FormData();
        body.append('file', blob, `recording.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
        body.append('mime', blob.type);
        body.append('jobId', jobId);

        const res = await fetch('/api/upload-video', { method: 'POST', body });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`Upload failed${txt ? ` - ${txt}` : ''}`);
        }

        // Use the playback and download URLs returned by the server
        const {
          publicId,
          playbackMp4,
          downloadMp4,
        } = (await res.json()) as {
          publicId: string;
          playbackMp4: string;
          downloadMp4: string;
        };

        onUploaded({ publicId, playbackMp4, downloadMp4, mime: blob.type, width, height });
      } catch (e: any) {
        setError(e?.message || 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    };

    mr.start(150); // collect data every 150ms
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }

  return (
    <div className="space-y-3">
      {/* Device selectors */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="border rounded px-2 py-1"
          value={selectedCam}
          onChange={(e) => setSelectedCam(e.target.value)}
        >
          {devices
            .filter((d) => d.kind === 'videoinput')
            .map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Camera'}
              </option>
            ))}
        </select>

        <select
          className="border rounded px-2 py-1"
          value={selectedMic}
          onChange={(e) => setSelectedMic(e.target.value)}
        >
          {devices
            .filter((d) => d.kind === 'audioinput')
            .map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Microphone'}
              </option>
            ))}
        </select>
      </div>

      {/* Preview */}
      <div className="rounded-lg overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto" />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        {!stream && (
          <button className="border rounded px-3 py-1" onClick={getStream}>
            Enable camera
          </button>
        )}
        {stream && !isRecording && (
          <button className="border rounded px-3 py-1" onClick={startRecording}>
            Start recording
          </button>
        )}
        {isRecording && (
          <button className="border rounded px-3 py-1" onClick={stopRecording}>
            Stop
          </button>
        )}
        {stream && !isRecording && (
          <button className="border rounded px-3 py-1" onClick={stopStream}>
            Turn off camera
          </button>
        )}
        {isUploading && <span className="text-sm opacity-80">Uploading…</span>}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
