export type OpponentMode =
  | 'ROOKIE_AI'
  | 'PRO_AI'
  | 'ALL_STAR_AI'
  | 'LEGEND_AI'
  | 'PASS_PLAY'
  | 'ONLINE_DUEL';

export type TriviaTier = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
export type AnswerFormat = 'STANDARD' | 'HARD' | 'EXPERT' | 'VOICE';

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

export function getStorageKey(
  opponent: OpponentMode,
  tier: TriviaTier,
  format: AnswerFormat
): string {
  return `sport_trivia_leaderboards_${opponent}_${tier}_${format}`;
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
  format: AnswerFormat
): LeaderboardEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(getStorageKey(opponent, tier, format)) || '[]');
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
  }
): { rank: number; isTop10: boolean; isHighScore: boolean } {
  const current = getLeaderboard(opponent, tier, format);
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
    const key = getStorageKey(opponent, tier, format);
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
  format: AnswerFormat
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(opponent, tier, format));
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
        resetLeaderboardCategory(opp.id, t.id, f.id);
      });
    });
  });
}
