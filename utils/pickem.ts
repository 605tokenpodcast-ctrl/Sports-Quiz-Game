// Pick'em carryover: at the end of a game each player picks the winners of three of the coming
// week's games. The next game on this device pays the right picks as starting money, once the
// weekly question refresh has the results.
import type {PickemGame} from '../triviaEngine';

export const PICKEM_BONUS = 500; // per right pick
const KEY = 'sports_arena_pickem_v1';
const KEEP_MS = 21 * 86400000;

export interface SavedPicks {
  week: string;
  savedAt: number;
  games: PickemGame[];
  /** Player name -> game id -> the team code they picked. */
  picks: Record<string, Record<string, string>>;
}

export function loadSavedPicks(now = Date.now()): SavedPicks | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || !Array.isArray(saved.games) || now - saved.savedAt > KEEP_MS) return null;
    return saved;
  } catch {
    return null;
  }
}

export function savePicks(p: SavedPicks): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export function clearSavedPicks(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export interface PickemPayout {
  name: string;
  right: number;
  of: number;
  bonus: number;
}

/**
 * What each player won with their picks, or null while any picked game has no result yet.
 * A tie counts as a miss for both sides.
 */
export function pickemPayouts(saved: SavedPicks, results: Record<string, string>): PickemPayout[] | null {
  if (!saved.games.every((g) => results[g.id])) return null;
  return Object.entries(saved.picks).map(([name, picks]) => {
    const right = saved.games.filter((g) => picks[g.id] && picks[g.id] === results[g.id]).length;
    return {name, right, of: saved.games.length, bonus: right * PICKEM_BONUS};
  });
}

/** An AI player's picks: the home team, unless a coin flip says otherwise. */
export function aiPicks(games: PickemGame[], random: () => number = Math.random): Record<string, string> {
  return Object.fromEntries(games.map((g) => [g.id, random() < 0.6 ? g.home : g.away]));
}
