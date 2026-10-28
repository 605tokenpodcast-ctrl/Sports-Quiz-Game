// Reading clues aloud with the browser's built-in voice (speechSynthesis). Works in Chrome,
// Edge and Safari; does nothing on browsers without it.

export const isSpeechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let voice: SpeechSynthesisVoice | null = null;
// Marks the utterance being read as cancelled, so its end doesn't count as finishing.
let current: (() => void) | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (voice) return voice;
  const voices = window.speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang === 'en-US' && /google|natural|samantha|aria|jenny/i.test(v.name)) ||
    voices.find((v) => v.lang === 'en-US') ||
    voices.find((v) => v.lang.startsWith('en')) ||
    null;
  return voice;
}

/** Reads `text` aloud, cutting off anything still being read. `onDone` runs if it finishes. */
export function speak(text: string, onDone?: () => void) {
  if (!isSpeechSupported || !text.trim()) return;
  const synth = window.speechSynthesis;
  current?.();
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v?.lang || 'en-US';
  u.rate = 1.05;
  let cancelled = false;
  u.onend = () => !cancelled && onDone?.();
  u.onerror = () => (cancelled = true);
  current = () => (cancelled = true);
  synth.speak(u);
}

export function stopSpeaking() {
  if (!isSpeechSupported) return;
  current?.();
  current = null;
  window.speechSynthesis.cancel();
}

/** iPhones only allow speech that starts from a tap, so call this from a button press first. */
export function unlockSpeech() {
  if (!isSpeechSupported) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

/** "$1,200" reads as "1,200 dollars" in every voice; the dollar sign alone does not. */
export const spokenMoney = (amount: number) => `${amount.toLocaleString()} dollars`;
