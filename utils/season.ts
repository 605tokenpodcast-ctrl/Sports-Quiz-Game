// Podcast season standings: a running table of every person who has played on this device,
// across games (episodes). Kept on the host device next to the leaderboards.
type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type ReadWrite = Pick<Storage, 'getItem' | 'setItem'>;

export interface SeasonRow {
  name: string;
  games: number;
  wins: number; // games finished with the top score (ties count for everyone tied)
  money: number; // total final scores
  bestScore: number;
  finalsRight: number;
  finalsPlayed: number;
  lastPlayed: string; // ISO date
}

/** One person's result from a finished game. */
export interface SeasonResult {
  name: string;
  score: number;
  won: boolean;
  finalCorrect?: boolean; // undefined when they sat the Final out
}

const SEASON_KEY = 'sport_trivia_season_v1';
const keyOf = (name: string) => name.trim().toLowerCase();

function storage(): KeyStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getSeason(store: ReadWrite | null = storage()): SeasonRow[] {
  if (!store) return [];
  try {
    const rows = JSON.parse(store.getItem(SEASON_KEY) || '[]');
    return Array.isArray(rows) ? (rows as SeasonRow[]) : [];
  } catch {
    return [];
  }
}

/** The standings, best first: most wins, then most money. */
export const seasonStandings = (rows: SeasonRow[]) => [...rows].sort((a, b) => b.wins - a.wins || b.money - a.money || a.name.localeCompare(b.name));

/** Adds one game's results to the season. Players are matched by name, ignoring case. */
export function recordSeasonGame(results: SeasonResult[], store: ReadWrite | null = storage(), now = new Date()): SeasonRow[] {
  const rows = getSeason(store);
  for (const r of results) {
    const name = r.name.trim().slice(0, 24);
    if (!name) continue;
    let row = rows.find((x) => keyOf(x.name) === keyOf(name));
    if (!row) {
      row = {name, games: 0, wins: 0, money: 0, bestScore: r.score, finalsRight: 0, finalsPlayed: 0, lastPlayed: ''};
      rows.push(row);
    }
    row.games += 1;
    row.wins += r.won ? 1 : 0;
    row.money += r.score;
    row.bestScore = Math.max(row.bestScore, r.score);
    if (r.finalCorrect !== undefined) {
      row.finalsPlayed += 1;
      row.finalsRight += r.finalCorrect ? 1 : 0;
    }
    row.lastPlayed = now.toISOString().slice(0, 10);
  }
  try {
    store?.setItem(SEASON_KEY, JSON.stringify(rows));
  } catch {
    // Storage full or blocked: the season just isn't saved this time.
  }
  return seasonStandings(rows);
}

const isRow = (r: unknown): r is SeasonRow => {
  const x = r as SeasonRow;
  return (
    !!x && typeof x.name === 'string' && !!x.name.trim() &&
    ['games', 'wins', 'money', 'bestScore', 'finalsRight', 'finalsPlayed'].every((k) => Number.isFinite((x as unknown as Record<string, number>)[k])) &&
    typeof x.lastPlayed === 'string'
  );
};

/**
 * Puts season standings from a backup onto this device. A person on both keeps whichever row
 * has more games (then the later one), so restoring the same backup twice never doubles anyone.
 * Returns how many people were added or brought up to date.
 */
export function mergeSeason(incoming: unknown, store: ReadWrite | null = storage()): number {
  if (!Array.isArray(incoming)) return 0;
  const rows = getSeason(store);
  let changed = 0;
  for (const r of incoming.filter(isRow)) {
    const row: SeasonRow = {...r, name: r.name.trim().slice(0, 24)};
    const i = rows.findIndex((x) => keyOf(x.name) === keyOf(row.name));
    if (i < 0) {
      rows.push(row);
      changed++;
    } else if (row.games > rows[i].games || (row.games === rows[i].games && row.lastPlayed > rows[i].lastPlayed)) {
      rows[i] = row;
      changed++;
    }
  }
  if (changed) {
    try {
      store?.setItem(SEASON_KEY, JSON.stringify(rows));
    } catch {
      return 0;
    }
  }
  return changed;
}

/** Starts a new season. */
export function resetSeason(store: KeyStore | null = storage()): void {
  try {
    store?.removeItem(SEASON_KEY);
  } catch {
    // nothing to clear
  }
}
