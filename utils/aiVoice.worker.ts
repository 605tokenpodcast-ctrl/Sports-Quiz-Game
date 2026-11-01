// Runs the AI voice model off the main thread, so generating speech never freezes the game.
import {KokoroTTS} from 'kokoro-js';

let tts: KokoroTTS | null = null;
const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'load') {
    try {
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p: any) => {
          if (p?.status === 'progress' && p.file) post({type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0});
        },
      });
      post({type: 'ready'});
    } catch (err: any) {
      post({type: 'error', error: String(err?.message || err)});
    }
  } else if (m.type === 'gen') {
    try {
      if (!tts) throw new Error('not loaded');
      const a = await tts.generate(m.text, {voice: m.voice, speed: m.speed});
      const audio = a.audio as Float32Array;
      post({type: 'audio', id: m.id, audio, rate: a.sampling_rate}, [audio.buffer]);
    } catch (err: any) {
      post({type: 'audio', id: m.id, error: String(err?.message || err)});
    }
  }
};
