'use client'
import React, { useEffect, useRef, useState } from "react";

type Props = { onUploaded: (videoUrl: string, meta: { mime: string; width: number; height: number }) => void };

export default function Recorder({ onUploaded }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [chunks, setChunks] = useState<BlobPart[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCam, setSelectedCam] = useState<string | undefined>();
  const [selectedMic, setSelectedMic] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then(list => {
        setDevices(list);
        setSelectedCam(list.find(d => d.kind === "videoinput")?.deviceId);
        setSelectedMic(list.find(d => d.kind === "audioinput")?.deviceId);
      })
      .catch(e => setError(e.message));
  }, []);

  async function getStream() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: selectedCam ? { exact: selectedCam } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { deviceId: selectedMic ? { exact: selectedMic } : undefined, echoCancellation: true, noiseSuppression: true }
      });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (e: any) { setError(e.message); }
  }

  function startRecording() {
    if (!stream) return;
    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/mp4;codecs=h264,aac",
      "video/webm"
    ].find(t => MediaRecorder.isTypeSupported(t)) || "";
    const mr = new MediaRecorder(stream, { mimeType: mime });
    mediaRecorderRef.current = mr;
    setChunks([]);
    mr.ondataavailable = e => { if (e.data.size > 0) setChunks(p => [...p, e.data]); };
    mr.onstop = async () => {
      const blob = new Blob(chunks, { type: mr.mimeType || "video/webm" });
      const width = videoRef.current?.videoWidth || 0;
      const height = videoRef.current?.videoHeight || 0;

      const body = new FormData();
      body.append("file", blob, `recording.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      body.append("mime", blob.type);

      const res = await fetch("/api/upload-video", { method: "POST", body });
      if (!res.ok) { setError("Upload failed"); return; }
      const { url } = await res.json();
      onUploaded(url, { mime: blob.type, width, height });
    };
    mr.start(150);
    setIsRecording(true);
  }

  function stopRecording() { mediaRecorderRef.current?.stop(); setIsRecording(false); }
  function stopStream() { stream?.getTracks().forEach(t => t.stop()); setStream(null); }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select value={selectedCam} onChange={e => setSelectedCam(e.target.value)}>
          {devices.filter(d => d.kind === "videoinput").map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera"}</option>)}
        </select>
        <select value={selectedMic} onChange={e => setSelectedMic(e.target.value)}>
          {devices.filter(d => d.kind === "audioinput").map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}
        </select>
      </div>

      <div className="rounded-lg overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto" />
      </div>

      <div className="flex gap-2">
        {!stream && <button onClick={getStream}>Enable camera</button>}
        {stream && !isRecording && <button onClick={startRecording}>Start recording</button>}
        {isRecording && <button onClick={stopRecording}>Stop</button>}
        {stream && !isRecording && <button onClick={stopStream}>Turn off camera</button>}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
