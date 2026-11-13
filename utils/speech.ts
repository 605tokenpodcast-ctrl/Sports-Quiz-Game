// Reading clues aloud with the browser's built-in voice (speechSynthesis). Works in Chrome,
// Edge and Safari; does nothing on browsers without it.
//
// Every device ships different voices, and the default one is often the flat robot voice.
// So we rank what the device has and pick the most natural one: Edge's "Online (Natural)"
// neural voices, Apple's Premium/Enhanced voices, then Google's. Players can also pick a
// voice and a speed themselves (remembered on that device).

import {pronounce} from './pronunciation';

export const isSpeechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

// --- Voices -----------------------------------------------------------------------------

/** macOS/iOS joke and effect voices. Never pick these on our own. */
const NOVELTY =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|pipe organ|fred|junior|ralph|kathy|princess|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy)\b/i;

/** Voices that are known to sound good, and pace well for a game show host. */
const GOOD_NAMES = /\b(andrew|brian|guy|christopher|eric|steffan|roger|davis|jason|tony|aria|jenny|ava|emma|michelle|evan|nathan|zoe|tom|samantha|allison|susan|alex)\b/i;

/** How natural a voice should sound, from its name and language. Higher is better. */
export function voiceScore(v: Pick<SpeechSynthesisVoice, 'name' | 'lang'>): number {
  const name = v.name;
  const lang = (v.lang || '').replace('_', '-').toLowerCase();
  if (!lang.startsWith('en')) return -1000;
  if (NOVELTY.test(name)) return -500;
  let score = 0;
  if (/natural|neural/i.test(name)) score += 100; // Edge's online neural voices
  if (/premium/i.test(name)) score += 90; // Apple's best downloadable voices
  if (/enhanced/i.test(name)) score += 75;
  if (/^google/i.test(name)) score += 55; // Chrome's network voices
  if (/-network$/i.test(name)) score += 50; // Android's Google neural voices
  if (/espeak|robot/i.test(name)) score -= 80;
  if (GOOD_NAMES.test(name)) score += 15;
  if (/multilingual/i.test(name)) score += 5; // Edge's newest, most expressive voices
  if (lang === 'en-us') score += 20;
  else if (lang === 'en-gb' || lang === 'en-au' || lang === 'en-ca') score += 10;
  return score;
}

/** English voices on this device, best first. */
export function rankedVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => voiceScore(v) > -500)
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
}

const VOICE_KEY = 'tts_voice';
const RATE_KEY = 'tts_speed';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private browsing: the setting just isn't remembered.
  }
}

let chosenVoiceName: string | null = readStored(VOICE_KEY);
let voice: SpeechSynthesisVoice | null = null;

/** Voice list changes (Chrome loads its voices late), so look again when it does. */
const voiceListeners = new Set<() => void>();
if (isSpeechSupported) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = null;
    voiceListeners.forEach((fn) => fn());
  });
}
export function onVoicesChanged(fn: () => void): () => void {
  voiceListeners.add(fn);
  return () => voiceListeners.delete(fn);
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (voice) return voice;
  const ranked = rankedVoices();
  voice = (chosenVoiceName && ranked.find((v) => v.name === chosenVoiceName)) || ranked[0] || null;
  return voice;
}

/** The voice picked on this device, or null for "best available". */
export const getChosenVoice = () => chosenVoiceName;
export function setChosenVoice(name: string | null) {
  chosenVoiceName = name;
  voice = null;
  writeStored(VOICE_KEY, name);
}
/** The voice that will actually be used. */
export const currentVoiceName = () => pickVoice()?.name ?? null;

// --- Speed ------------------------------------------------------------------------------

export type VoiceSpeed = 'normal' | 'fast' | 'turbo';
export const VOICE_SPEEDS: {id: VoiceSpeed; label: string; rate: number}[] = [
  {id: 'normal', label: 'Normal', rate: 1.0},
  {id: 'fast', label: 'Fast', rate: 1.2},
  {id: 'turbo', label: 'Turbo', rate: 1.4},
];
const isSpeed = (s: string | null): s is VoiceSpeed => VOICE_SPEEDS.some((x) => x.id === s);
let speed: VoiceSpeed = (() => {
  const s = readStored(RATE_KEY);
  return isSpeed(s) ? s : 'fast';
})();
export const getVoiceSpeed = () => speed;
export function setVoiceSpeed(s: VoiceSpeed, remember = true) {
  if (!isSpeed(s)) return;
  speed = s;
  if (remember) writeStored(RATE_KEY, s);
}
export const speechRate = () => VOICE_SPEEDS.find((x) => x.id === speed)!.rate;

// --- Speaking ---------------------------------------------------------------------------

/**
 * A line is read as a few parts with their own delivery, so the host doesn't sound flat:
 * `hype` parts ("Daily Double!", the category intro, the answer) come a touch higher and
 * quicker; the clue itself stays clear.
 */
export type SpeechPart = string | {text: string; hype?: boolean};

// Marks what is being read as cancelled, so its end doesn't count as finishing.
let current: (() => void) | null = null;

/**
 * Chrome's Google voices stop dead about 15 seconds into one utterance, so long text is read
 * one sentence at a time. Queued back to back, there's no gap between them.
 */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?;]+(?:[.!?;]+["')\]]*|$)\s*/g) || [text];
  const out: string[] = [];
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    // Very short bits ("No.", "Jr.") read better attached to what came before.
    if (out.length && (p.length < 12 || out[out.length - 1].length < 12)) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

// --- Reading the text the way a host would --------------------------------------------

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** 0-99 in words: 24 -> "twenty-four". */
function smallNumber(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
}

/** A year the way people say it: 1998 -> "nineteen ninety-eight", 2005 -> "two thousand five". */
export function spokenYear(year: number): string {
  const hi = Math.floor(year / 100);
  const lo = year % 100;
  if (year >= 2000 && year < 2010) return year === 2000 ? 'two thousand' : `two thousand ${ONES[lo]}`;
  if (lo === 0) return `${smallNumber(hi)} hundred`;
  return `${smallNumber(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : smallNumber(lo)}`;
}

const ROMAN: Record<string, number> = {I: 1, V: 5, X: 10, L: 50, C: 100};
function fromRoman(r: string): number {
  let total = 0;
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN[r[i]];
    total += v < (ROMAN[r[i + 1]] ?? 0) ? -v : v;
  }
  return total;
}

/** Whether "N-N" between `before` and `after` is a win-loss record rather than a score. */
function isRecord(before: string, after: string): boolean {
  return (
    /\b(went|go|goes|going|finished|finishing|worst|best|league-worst|league-best|at|record of|records? (?:is|was|of)|start(?:ed)? (?:at|the season)|improved to|fell to|dropped to|stumbled to an?|sits? at|stand(?:s|ing)? at)\s*$/i.test(before) ||
    /^\s*(record|start|so far|this season|on the season|on the year|in the standings|overall|mark)\b/i.test(after) ||
    /^\s*\)/.test(after) && /\(\s*$/.test(before)
  );
}

/**
 * Rewrites a clue so every voice reads it naturally: "St." as Saint or State, "Jr." as
 * Junior, years as years, scores as "23 to 16", records as "11 and 6", Super Bowl numerals
 * as numbers, and hard names the way they're said (utils/pronunciation.ts). Without this,
 * voices say "street", spell out roman numerals, read years like big numbers and mangle
 * names like Kelce and Favre.
 */
export function spokenText(text: string): string {
  return (
    pronounce(text)
      // "St. Louis", "Amon-Ra St. Brown" -> Saint; "Florida St. defensive end", "Ohio St." -> State.
      .replace(/\bSt\.(?=\s+[A-Z])/g, 'Saint')
      .replace(/\bSt\./g, 'State')
      .replace(/\bJr\./g, 'Junior')
      .replace(/\bSr\./g, 'Senior')
      .replace(/\bNo\.\s?(?=\d)/g, 'number ')
      .replace(/\bvs\.?(?=\s)/gi, 'versus')
      .replace(/\bSuper Bowl ([IVXLC]+)\b/g, (_, r: string) => `Super Bowl ${fromRoman(r)}`)
      // Kenneth Walker III -> Kenneth Walker the third.
      .replace(/(\b[A-Z][a-z]+) (II|III|IV)\b/g, (_, name: string, r: string) =>
        `${name} the ${({II: 'second', III: 'third', IV: 'fourth'} as Record<string, string>)[r]}`
      )
      // Win-loss records ("went 11-6", "at 7-1", "3-4 so far") read with "and"; scores ("a 23-16 win") with "to".
      .replace(/\b(\d{1,2})-(\d{1,2})(?:-(\d{1,2}))?\b/g, (m: string, a: string, b: string, t: string | undefined, at: number, all: string) =>
        isRecord(all.slice(Math.max(0, at - 30), at), all.slice(at + m.length, at + m.length + 30))
          ? `${a} and ${b}${t ? ` and ${t}` : ''}`
          : `${a} to ${b}${t ? ` to ${t}` : ''}`
      )
      // Years, but not counts like "1600 yards".
      .replace(/\b(19\d\d|20\d\d)\b(?!\s*(?:yards?|points?|receptions?|catches|carries|attempts|passes|tackles|sacks|yds|pts))/g,
        (y) => spokenYear(Number(y)))
  );
}

/** Reads `parts` aloud, cutting off anything still being read. `onDone` runs if it finishes. */
export function speak(parts: SpeechPart | SpeechPart[], onDone?: () => void) {
  const list = (Array.isArray(parts) ? parts : [parts])
    .map((p) => (typeof p === 'string' ? {text: p, hype: false} : {text: p.text, hype: !!p.hype}))
    .map((p) => ({...p, text: spokenText(p.text)}))
    .flatMap((p) => splitSentences(p.text).map((text) => ({text, hype: p.hype})))
    .filter((p) => p.text.trim());
  if (!list.length) return;
  speakWithDevice(list, onDone);
}

function speakWithDevice(list: {text: string; hype: boolean}[], onDone?: () => void) {
  if (!isSpeechSupported) return;
  const synth = window.speechSynthesis;
  current?.();
  synth.cancel();
  // Some engines get stuck paused after a cancel from the background.
  if (synth.paused) synth.resume();

  const v = pickVoice();
  const rate = speechRate();
  let cancelled = false;
  current = () => (cancelled = true);
  list.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.text);
    if (v) u.voice = v;
    u.lang = v?.lang || 'en-US';
    u.rate = Math.min(2, p.hype ? rate * 1.08 : rate);
    u.pitch = p.hype ? 1.15 : 1.04;
    u.onerror = () => (cancelled = true);
    if (i === list.length - 1) u.onend = () => !cancelled && onDone?.();
    synth.speak(u);
  });
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

/** A sample line for trying out a voice. */
export const sampleLine = (): SpeechPart[] => [
  {text: 'Super Bowl Legends, for 400!', hype: true},
  'This quarterback threw for 4 touchdowns in his first title game.',
];

/** "$1,200" reads as "1,200" in every voice; the dollar sign alone does not read well. */
export const spokenMoney = (amount: number) => amount.toLocaleString();

/** A short, varied host line for the answer reveal. */
/** What the host voice says when a player's run of right answers reaches 3, 5, 7 ... (empty otherwise). */
export function streakLine(name: string, streak: number): string {
  if (streak < 3 || streak % 2 === 0) return '';
  if (streak === 3) return `${name} is heating up!`;
  if (streak === 5) return `${name} is on fire!`;
  return `${name} can't miss! That's ${streak} in a row!`;
}

export function answerLine(answer: string, pick = Math.random()): string {
  const lines = [`It's ${answer}!`, `The answer: ${answer}!`, `That's ${answer}!`];
  return lines[Math.floor(pick * lines.length) % lines.length];
}
