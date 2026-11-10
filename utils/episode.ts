// Episode codes: a short code that deals the exact same boards on any device, so podcast
// listeners can play the game from the show. The first letter is the game length (F full,
// S short), the rest picks the boards. Boards also depend on the week's question bank, so a
// code deals the same game until the next weekly refresh.
import type {GameLength} from '../triviaEngine';

// No 0/O or 1/I/L, so a code read out loud or typed from a screenshot can't be mistaken.
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A new random code for this game length, like "F-7KQ2". */
export function newEpisodeCode(length: GameLength, random = Math.random): string {
  let body = '';
  for (let i = 0; i < 4; i++) body += LETTERS[Math.floor(random() * LETTERS.length)];
  return `${length === 'SHORT' ? 'S' : 'F'}-${body}`;
}

/** Tidies what someone typed ("f 7kq2" -> "F-7KQ2"). Returns '' when it isn't a code. */
export function normalizeEpisodeCode(input: string): string {
  const raw = (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[FS][A-Z0-9]{4}$/.test(raw)) return '';
  return `${raw[0]}-${raw.slice(1)}`;
}

/** The game length a code was made for. */
export const episodeLength = (code: string): GameLength => (code.startsWith('S') ? 'SHORT' : 'FULL');

/** A repeatable random number source for a code (mulberry32 over a string hash). */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
