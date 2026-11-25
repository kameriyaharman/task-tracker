import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

/** Mic recorder — records straight from the microphone (no file picker). */
export function useRecorder() {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [blob, setBlob] = useState<File | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t)) ?? '';
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = r.mimeType || type || 'audio/webm';
        setBlob(new File(chunks, `voice-note.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime.split(';')[0] }));
        window.clearInterval(timer.current);
        setRec(null);
      };
      r.start();
      setSecs(0); setBlob(null); setRec(r);
      timer.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      setErr('Microphone not allowed — allow mic access in the browser and try again');
    }
  };
  useEffect(() => () => window.clearInterval(timer.current), []);
  return { recording: !!rec, blob, secs, err, start, stop: () => rec?.stop(), clear: () => { setBlob(null); setSecs(0); } };
}
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Record / play / remove a voice note in one row — used for reasons (approve, reject, return). */
export function VoiceNote({ rec, label = 'Record voice' }: { rec: ReturnType<typeof useRecorder>; label?: string }) {
  return (
    <div className="voice-row" style={{ margin: '0 0 10px' }}>
      <button type="button" className={`btn sm ${rec.recording ? 'danger' : 'ghost'}`} onClick={() => (rec.recording ? rec.stop() : rec.start())}>
        <Icon name="mic" size={13} /> {rec.recording ? `Stop ${mmss(rec.secs)}` : rec.blob ? 'Record again' : label}
      </button>
      {rec.blob && <><audio controls src={URL.createObjectURL(rec.blob)} /><button type="button" className="link" onClick={rec.clear}>Remove</button></>}
      {rec.err && <small className="field-err">{rec.err}</small>}
    </div>
  );
}
