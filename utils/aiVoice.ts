// The AI voice: Kokoro, a small open-source neural voice (Apache-2.0) that runs inside the
// browser. It sounds far more human than the built-in voices. The model (about 90 MB) is
// downloaded from Hugging Face the first time it's turned on and then kept by the browser,
// so later games start right away. Until it's ready, the device voice reads instead.

export const AI_VOICES: {id: string; label: string}[] = [
  {id: 'af_heart', label: 'Heart (best)'},
  {id: 'af_bella', label: 'Bella'},
  {id: 'am_michael', label: 'Michael'},
  {id: 'am_fenrir', label: 'Fenrir'},
  {id: 'am_puck', label: 'Puck'},
  {id: 'bf_emma', label: 'Emma (British)'},
  {id: 'bm_george', label: 'George (British)'},
];
export const DEFAULT_AI_VOICE = 'af_heart';
export const isAiVoice = (id: unknown): id is string => AI_VOICES.some((v) => v.id === id);

export type AiState = {status: 'off' | 'loading' | 'ready' | 'error'; progress: number; error?: string};

type Tts = {generate(text: string, o: {voice: string; speed: number}): Promise<{audio: Float32Array; sampling_rate: number}>};

let state: AiState = {status: 'off', progress: 0};
let tts: Tts | null = null;
let loading: Promise<Tts | null> | null = null;
const listeners = new Set<(s: AiState) => void>();
const setState = (s: AiState) => {
  state = s;
  listeners.forEach((fn) => fn(s));
};
export const aiState = () => state;
export function onAiState(fn: (s: AiState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Starts downloading the model if it isn't already, in a background worker so the game never
 * freezes while it loads or speaks. Resolves when it's ready (or failed).
 */
export function loadAiVoice(): Promise<Tts | null> {
  if (tts) return Promise.resolve(tts);
  if (loading) return loading;
  if (typeof Worker === 'undefined') {
    setState({status: 'error', progress: 0, error: 'no workers'});
    return Promise.resolve(null);
  }
  setState({status: 'loading', progress: 0});
  // Bytes per file, so progress covers all of them.
  const files = new Map<string, {loaded: number; total: number}>();
  const worker = new Worker(new URL('./aiVoice.worker.ts', import.meta.url), {type: 'module'});
  const waiting = new Map<number, (a: {audio: Float32Array; sampling_rate: number} | null) => void>();
  let nextId = 1;
  loading = new Promise<Tts | null>((resolve) => {
    const fail = (error: string) => {
      console.warn('AI voice failed to load', error);
      worker.terminate();
      loading = null;
      waiting.forEach((done) => done(null));
      waiting.clear();
      setState({status: 'error', progress: 0, error});
      resolve(null);
    };
    worker.onerror = (e) => fail(e.message || 'worker error');
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'progress') {
        files.set(m.file, {loaded: m.loaded, total: m.total});
        let loaded = 0;
        let total = 0;
        files.forEach((f) => ((loaded += f.loaded), (total += f.total)));
        if (total) setState({status: 'loading', progress: Math.min(99, Math.round((loaded / total) * 100))});
      } else if (m.type === 'ready') {
        tts = {
          generate: (text, o) =>
            new Promise((done, reject) => {
              const id = nextId++;
              waiting.set(id, (a) => (a ? done(a) : reject(new Error('generate failed'))));
              worker.postMessage({type: 'gen', id, text, voice: o.voice, speed: o.speed});
            }),
        };
        setState({status: 'ready', progress: 100});
        resolve(tts);
      } else if (m.type === 'error') {
        fail(m.error);
      } else if (m.type === 'audio') {
        const done = waiting.get(m.id);
        waiting.delete(m.id);
        done?.(m.error ? null : {audio: m.audio, sampling_rate: m.rate});
      }
    };
    worker.postMessage({type: 'load'});
  });
  return loading;
}

/** Too slow on this device to keep up with the game: stop using it until the page reloads. */
export function giveUpOnAi(reason: string) {
  setState({status: 'error', progress: 0, error: reason});
  tts = null;
}

// --- Playing ----------------------------------------------------------------------------

let ctx: AudioContext | null = null;
function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  ctx = AC ? new AC() : null;
  return ctx;
}
/** Phones only play sound that starts from a tap, so call this from a button press. */
export function unlockAiAudio() {
  const c = audioContext();
  if (c && c.state !== 'running') c.resume().catch(() => {});
}

let playing: AudioBufferSourceNode | null = null;
let token = 0;
// One sentence is generated at a time; a cancelled line still finishes its current one.
let chain: Promise<unknown> = Promise.resolve();

export function stopAi() {
  token++;
  try {
    playing?.stop();
  } catch {
    // Already stopped.
  }
  playing = null;
}

/**
 * Reads the parts with the AI voice. The next sentence is generated while the current one
 * plays, so there's no gap. `onDone` runs if it finishes without being cut off.
 */
export function speakAi(
  parts: {text: string; speed: number}[],
  voice: string,
  onDone?: () => void,
  /** Called instead if the first sentence isn't ready within `firstAudioMs`. */
  onSlow?: () => void,
  firstAudioMs = 2500
) {
  stopAi();
  const mine = token;
  const c = audioContext();
  if (!tts || !c || !parts.length) return;
  const model = tts;
  const gen = (i: number) => {
    const p = (chain = chain.then(() =>
      mine === token ? model.generate(parts[i].text, {voice, speed: Math.min(2, parts[i].speed)}) : null
    ));
    return p as Promise<{audio: Float32Array; sampling_rate: number} | null>;
  };
  const playOne = (audio: {audio: Float32Array; sampling_rate: number}) =>
    new Promise<void>((resolve) => {
      const buf = c.createBuffer(1, audio.audio.length, audio.sampling_rate);
      buf.copyToChannel(audio.audio as any, 0);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.onended = () => resolve();
      playing = src;
      src.start();
    });
  (async () => {
    let next = gen(0);
    // The game can't wait on a slow device: if the first sentence takes too long, hand over.
    let slow = false;
    const timer = setTimeout(() => {
      slow = true;
      if (mine !== token) return;
      token++;
      onSlow?.();
    }, firstAudioMs);
    for (let i = 0; i < parts.length; i++) {
      const audio = await next.catch(() => null);
      if (i === 0) clearTimeout(timer);
      if (slow || mine !== token) return;
      if (!audio) {
        // Generating failed: the device voice reads the rest.
        token++;
        onSlow?.();
        return;
      }
      if (i + 1 < parts.length) next = gen(i + 1);
      await playOne(audio);
      if (mine !== token) return;
    }
    onDone?.();
  })();
}

/** Tests only: stand in a fake model so playback can be checked without the download. */
export function setAiModelForTests(model: Tts | null) {
  tts = model;
  chain = Promise.resolve();
  setState(model ? {status: 'ready', progress: 100} : {status: 'off', progress: 0});
}
