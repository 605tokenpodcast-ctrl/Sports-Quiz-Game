export type OpponentMode =
  | 'ROOKIE_AI'
  | 'PRO_AI'
  | 'ALL_STAR_AI'
  | 'LEGEND_AI'
  | 'PASS_PLAY'
  | 'ONLINE_DUEL';

export type TriviaTier = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
export type AnswerFormat = 'STANDARD' | 'HARD' | 'EXPERT' | 'VOICE';
// Short games have a smaller board, so their scores are kept on separate leaderboards.
export type GameLength = 'FULL' | 'SHORT';

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  accuracy: number; // 0 to 100 percentage
  questionsAnswered: number;
  dailyDoublesWon: number;
  date: string;
  isLocalPlayer?: boolean;
}

export const OPPONENT_OPTIONS: { id: OpponentMode; label: string; icon: string }[] = [
  { id: 'ROOKIE_AI', label: 'Rookie AI', icon: '🟢' },
  { id: 'PRO_AI', label: 'Pro AI', icon: '🔵' },
  { id: 'ALL_STAR_AI', label: 'All-Star AI', icon: '🟣' },
  { id: 'LEGEND_AI', label: 'Legend AI', icon: '🔴' },
  { id: 'PASS_PLAY', label: 'Pass & Play', icon: '👥' },
  { id: 'ONLINE_DUEL', label: 'Online Duel', icon: '📱' },
];

export const TIER_OPTIONS: { id: TriviaTier; label: string }[] = [
  { id: 'EASY', label: 'Standard (Easy)' },
  { id: 'MEDIUM', label: 'Pro (Medium)' },
  { id: 'HARD', label: 'Hard' },
  { id: 'EXPERT', label: 'Expert' },
];

export const FORMAT_OPTIONS: { id: AnswerFormat; label: string; shortLabel: string }[] = [
  { id: 'STANDARD', label: '4-Choice (Multiple Choice)', shortLabel: '4-Choice' },
  { id: 'HARD', label: '8-Choice (Multiple Choice)', shortLabel: '8-Choice' },
  { id: 'EXPERT', label: 'Text Input (Direct Typing)', shortLabel: 'Type-In' },
  { id: 'VOICE', label: 'Mic Only (Say Your Answer)', shortLabel: 'Mic Only' },
];

export const LENGTH_OPTIONS: { id: GameLength; label: string }[] = [
  { id: 'FULL', label: 'Full Game' },
  { id: 'SHORT', label: 'Short Game' },
];

export function getStorageKey(
  opponent: OpponentMode,
  tier: TriviaTier,
  format: AnswerFormat,
  length: GameLength = 'FULL'
): string {
  const suffix = length === 'SHORT' ? '_SHORT' : '';
  return `sport_trivia_leaderboards_${opponent}_${tier}_${format}${suffix}`;
}

export function getLastPlayerName(): string {
  if (typeof window === 'undefined') return 'Champion';
  return localStorage.getItem('sport_trivia_last_player_name') || 'Champion';
}

export function setLastPlayerName(name: string): void {
  if (typeof window === 'undefined') return;
  const clean = name.trim().slice(0, 18) || 'Champion';
  localStorage.setItem('sport_trivia_last_player_name', clean);
}

/**
 * Loads the saved scores for one combination, best first. Only real games are listed;
 * the made-up "benchmark" entries older versions added are dropped.
 */
export function getLeaderboard(
  opponent: OpponentMode,
  tier: TriviaTier,
  format: AnswerFormat,
  length: GameLength = 'FULL'
): LeaderboardEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(getStorageKey(opponent, tier, format, length)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return (parsed as LeaderboardEntry[])
      .filter((e) => !e.id.startsWith('seed_'))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch (e) {
    console.error('Failed to parse leaderboard from localStorage', e);
    return [];
  }
}

/**
 * Saves a new entry to the specific leaderboard combination
 */
export function recordLeaderboardEntry(
  opponent: OpponentMode,
  tier: TriviaTier,
  format: AnswerFormat,
  entryData: {
    playerName: string;
    score: number;
    accuracy: number;
    questionsAnswered: number;
    dailyDoublesWon: number;
  },
  length: GameLength = 'FULL'
): { rank: number; isTop10: boolean; isHighScore: boolean } {
  const current = getLeaderboard(opponent, tier, format, length);
  const dateFormatted = new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  const newEntry: LeaderboardEntry = {
    id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    playerName: entryData.playerName.trim().slice(0, 18) || 'Champion',
    score: entryData.score,
    accuracy: Math.round(Math.max(0, Math.min(100, entryData.accuracy))),
    questionsAnswered: entryData.questionsAnswered,
    dailyDoublesWon: entryData.dailyDoublesWon,
    date: dateFormatted,
    isLocalPlayer: true,
  };

  const updated = [...current, newEntry].sort((a, b) => b.score - a.score);
  const rank = updated.findIndex((e) => e.id === newEntry.id) + 1;
  const isTop10 = rank <= 10;
  const isHighScore = rank === 1;

  const top10 = updated.slice(0, 10);
  if (typeof window !== 'undefined') {
    const key = getStorageKey(opponent, tier, format, length);
    try {
      localStorage.setItem(key, JSON.stringify(top10));
      setLastPlayerName(entryData.playerName);
    } catch (e) {
      console.error('Failed to save leaderboard to localStorage', e);
    }
  }

  return { rank, isTop10, isHighScore };
}

/**
 * Clears one leaderboard combination
 */
export function resetLeaderboardCategory(
  opponent: OpponentMode,
  tier: TriviaTier,
  format: AnswerFormat,
  length: GameLength = 'FULL'
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(opponent, tier, format, length));
  } catch (e) {}
}

/**
 * Resets all leaderboards
 */
export function resetAllLeaderboards(): void {
  if (typeof window === 'undefined') return;
  OPPONENT_OPTIONS.forEach((opp) => {
    TIER_OPTIONS.forEach((t) => {
      FORMAT_OPTIONS.forEach((f) => {
        LENGTH_OPTIONS.forEach((l) => resetLeaderboardCategory(opp.id, t.id, f.id, l.id));
      });
    });
  });
}

// --- Backup -------------------------------------------------------------------------------
// Leaderboards live in this browser only, so clearing site data wipes them. A backup file
// keeps them safe and moves them to another device.

const BOARD_PREFIX = 'sport_trivia_leaderboards_';
const BACKUP_KIND = 'nfl-quiz-leaderboards';

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;

const isEntry = (e: unknown): e is LeaderboardEntry => {
  const x = e as LeaderboardEntry;
  return !!x && typeof x.id === 'string' && typeof x.playerName === 'string' && typeof x.score === 'number' && Number.isFinite(x.score);
};

const readBoard = (store: KeyStore, key: string): LeaderboardEntry[] => {
  try {
    const parsed = JSON.parse(store.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
};

/** Every saved leaderboard on this device, as the text of a backup file. */
export function leaderboardBackup(store: KeyStore = localStorage): string {
  const boards: Record<string, LeaderboardEntry[]> = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(BOARD_PREFIX)) continue;
    const entries = readBoard(store, key);
    if (entries.length) boards[key] = entries;
  }
  return JSON.stringify({kind: BACKUP_KIND, version: 1, savedAt: new Date().toISOString(), boards}, null, 2);
}

/**
 * Adds a backup's scores to this device's leaderboards. Scores already here are kept, the same
 * score is never added twice, and each board keeps its top 10. Throws if the file isn't a backup.
 */
export function restoreLeaderboardBackup(text: string, store: KeyStore = localStorage): {boards: number; added: number} {
  let data: {kind?: string; boards?: Record<string, unknown>};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a leaderboard backup.');
  }
  if (data?.kind !== BACKUP_KIND || !data.boards || typeof data.boards !== 'object') {
    throw new Error('That file is not a leaderboard backup.');
  }
  let boards = 0;
  let added = 0;
  for (const [key, list] of Object.entries(data.boards)) {
    if (!key.startsWith(BOARD_PREFIX) || !Array.isArray(list)) continue;
    const current = readBoard(store, key);
    const have = new Set(current.map((e) => e.id));
    const incoming = list.filter(isEntry).filter((e) => !have.has(e.id));
    if (!incoming.length) continue;
    const merged = [...current, ...incoming].sort((a, b) => b.score - a.score).slice(0, 10);
    const kept = merged.filter((e) => !have.has(e.id)).length;
    if (!kept) continue; // all too low for this board's top 10
    added += kept;
    store.setItem(key, JSON.stringify(merged));
    boards++;
  }
  return {boards, added};
}

/** Saves the backup as a file in the browser's downloads. */
export function downloadLeaderboardBackup(): void {
  const blob = new Blob([leaderboardBackup()], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nfl-quiz-leaderboards-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
