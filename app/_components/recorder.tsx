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

const pillBase =
  'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#F7941D]';
const pillPrimary =
  pillBase +
  ' bg-[#F7941D] text-white hover:bg-[#e98310] disabled:opacity-60 disabled:cursor-not-allowed';
const pillSecondary =
  pillBase +
  ' bg-[#3B3E44] text-white hover:bg-[#2c2f33] disabled:opacity-60 disabled:cursor-not-allowed';

export default function Recorder({ jobId, onUploaded }: Props) {
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCam, setSelectedCam] = useState<string | undefined>();
  const [selectedMic, setSelectedMic] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const [recorded, setRecorded] = useState<{
    blob: Blob;
    url: string;
    width: number;
    height: number;
    mime: string;
  } | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recorded?.url) URL.revokeObjectURL(recorded.url);
      stopStream();
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorded?.url]);

  // Discover devices
  useEffect(() => {
    if (!navigator?.mediaDevices?.enumerateDevices) {
      setError('Media devices not supported in this browser');
      return;
    }

    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        setDevices(list);
        setSelectedCam(list.find((d) => d.kind === 'videoinput')?.deviceId);
        setSelectedMic(list.find((d) => d.kind === 'audioinput')?.deviceId);
      })
      .catch((e) => setError(e?.message || 'Could not access devices'));
  }, []);

  // Camera on
  async function enableCamera() {
    try {
      stopStream();

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
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = s;
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to enable camera/mic');
    }
  }

  // Camera off
  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setStream(null);
  }

  function getBestMime(): string {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/mp4;codecs=h264,aac',
      'video/webm',
    ];
    for (const t of candidates) if (MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }

  function startRecording() {
    if (!stream) return;

    // New recording replaces old one
    if (recorded) {
      URL.revokeObjectURL(recorded.url);
      setRecorded(null);
    }

    const mime = getBestMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRecorderRef.current = mr;
    chunksRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mr.mimeType || 'video/webm',
      });
      const width = liveVideoRef.current?.videoWidth || 0;
      const height = liveVideoRef.current?.videoHeight || 0;

      const url = URL.createObjectURL(blob);
      setRecorded({ blob, url, width, height, mime: blob.type });
      setIsRecording(false);
    };

    mr.start(150);
    setIsRecording(true);
  }

  function stopRecording() {
    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  function deleteRecording() {
    if (recorded?.url) URL.revokeObjectURL(recorded.url);
    setRecorded(null);
  }

  async function uploadRecorded() {
    if (!recorded) return;
    setIsUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append(
        'file',
        recorded.blob,
        `recording.${recorded.mime.includes('mp4') ? 'mp4' : 'webm'}`,
      );
      body.append('mime', recorded.mime);
      body.append('jobId', jobId);

      const res = await fetch('/api/upload-video', { method: 'POST', body });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Upload failed${txt ? ` - ${txt}` : ''}`);
      }

      const { publicId, playbackMp4, downloadMp4 } = (await res.json()) as {
        publicId: string;
        playbackMp4: string;
        downloadMp4: string;
      };

      onUploaded({
        publicId,
        playbackMp4,
        downloadMp4,
        mime: recorded.mime,
        width: recorded.width,
        height: recorded.height,
      });
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Device selectors */}
      <div className="flex flex-wrap gap-3">
        <select
          className="border rounded px-2 py-1 flex-1 min-w-[160px] text-sm"
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
          className="border rounded px-2 py-1 flex-1 min-w-[160px] text-sm"
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

      {/* Live camera with recording overlaid on top when present */}
      <div className="relative rounded-lg overflow-hidden bg-black">
        {/* live camera underneath */}
        <video
          ref={liveVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-auto"
        />

        {/* recording overlay on top */}
        {recorded && (
          <video
            key="playback"
            src={recorded.url}
            controls
            playsInline
            className="absolute inset-0 w-full h-full object-contain bg-black"
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          className={pillSecondary}
          onClick={stream ? stopStream : enableCamera}
          disabled={isUploading}
        >
          {stream ? 'Disable camera' : 'Enable camera'}
        </button>

        <button
          className={pillPrimary}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!stream || isUploading}
        >
          {isRecording ? 'Stop' : 'Record'}
        </button>

        <button
          className={pillSecondary}
          onClick={deleteRecording}
          disabled={!recorded || isUploading}
        >
          Delete
        </button>

        <button
          className={`${pillPrimary} ml-auto`}
          onClick={uploadRecorded}
          disabled={!recorded || isUploading}
        >
          Upload
        </button>

        {isUploading && (
          <span className="text-xs opacity-80 ml-1">Uploading…</span>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
