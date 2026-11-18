import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import type { UploadFile } from '../lib/api';

/** Open the camera (front camera for selfies). Returns an upload-ready file or null. */
export async function takePhoto(front = false): Promise<UploadFile | null> {
  const p = await ImagePicker.requestCameraPermissionsAsync();
  if (!p.granted) { Alert.alert('Camera permission is needed'); return null; }
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'], quality: 0.6, allowsEditing: false,
    cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg' };
}

export async function pickFile(): Promise<UploadFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' };
}

/** Hold-to-record / tap-to-toggle voice notes (m4a). */
export function useVoiceNote() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [file, setFile] = useState<UploadFile | null>(null);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    const p = await requestRecordingPermissionsAsync();
    if (!p.granted) { Alert.alert('Microphone permission is needed'); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    started.current = Date.now();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => setSeconds(Math.round((Date.now() - started.current) / 1000)), 500);
  };

  const stop = async (): Promise<UploadFile | null> => {
    if (timer.current) clearInterval(timer.current);
    await recorder.stop();
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false });
    if (!recorder.uri) return null;
    const f = { uri: recorder.uri, name: `voice-${Date.now()}.m4a`, type: 'audio/mp4' };
    setFile(f);
    return f;
  };

  return { recording, seconds, file, start, stop, clear: () => setFile(null) };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
