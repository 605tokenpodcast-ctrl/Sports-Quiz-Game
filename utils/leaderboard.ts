export type OpponentMode =
  | 'ROOKIE_AI'
  | 'PRO_AI'
  | 'ALL_STAR_AI'
  | 'LEGEND_AI'
  | 'PASS_PLAY'
  | 'ONLINE_DUEL';

export type TriviaTier = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
export type AnswerFormat = 'STANDARD' | 'HARD' | 'EXPERT';

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
];

const SEED_BENCHMARK_NAMES = [
  'Brady_GOAT',
  'LeStats_King',
  'Gridiron_Guru',
  'Diamond_Clutch',
  'CourtVision_99',
  'TriviaBeast_23',
  'BlitzMaster_07',
  'HoopScholar',
  'PuckWizard_87',
  'DerbyChamp',
  'RedZone_Chief',
  'TripleDouble',
  'GrandSlammer',
  'SpeedyBuzzer',
  'StatsMaverick',
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
 * Generates realistic seed entries for a specific combination
 */
export function generateSeedEntries(
  opponent: OpponentMode,
  tier: TriviaTier,
  format: AnswerFormat
): LeaderboardEntry[] {
  // Base score modifiers according to difficulty, tier, and format
  const tierMultiplier =
    tier === 'EASY' ? 1.0 : tier === 'MEDIUM' ? 1.25 : tier === 'HARD' ? 1.5 : 1.8;
  const formatMultiplier =
    format === 'STANDARD' ? 1.0 : format === 'HARD' ? 1.2 : 1.45;
  const oppMultiplier =
    opponent === 'ROOKIE_AI'
      ? 0.9
      : opponent === 'PRO_AI'
      ? 1.1
      : opponent === 'ALL_STAR_AI'
      ? 1.3
      : opponent === 'LEGEND_AI'
      ? 1.5
      : 1.2;

  const baseHigh = Math.round(18000 * tierMultiplier * formatMultiplier * oppMultiplier);

  // Deterministic seed generation based on key strings
  const keySum = (opponent + tier + format)
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);

  const entries: LeaderboardEntry[] = [];
  const numSeeds = 7;

  for (let i = 0; i < numSeeds; i++) {
    const nameIdx = (keySum + i * 3) % SEED_BENCHMARK_NAMES.length;
    const scoreFactor = 1 - i * 0.08 - ((keySum * (i + 1)) % 5) * 0.01;
    const score = Math.max(2000, Math.round(baseHigh * scoreFactor / 100) * 100);
    const accuracy = Math.min(100, Math.max(65, 96 - i * 4 - ((keySum + i) % 6)));
    const dailyDoublesWon = Math.max(0, 3 - Math.floor(i / 2));
    const questionsAnswered = Math.min(25, 20 + ((keySum + i) % 5));

    // Realistic dates within last few days
    const dayOffset = (i * 2 + (keySum % 5)) % 14;
    const d = new Date(Date.now() - dayOffset * 86400000 - (i * 3600000));
    const dateFormatted = `${d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}`;

    entries.push({
      id: `seed_${opponent}_${tier}_${format}_${i}`,
      playerName: SEED_BENCHMARK_NAMES[nameIdx],
      score,
      accuracy,
      questionsAnswered,
      dailyDoublesWon,
      date: dateFormatted,
      isLocalPlayer: false,
    });
  }

  // Sort descending by score
  return entries.sort((a, b) => b.score - a.score);
}

/**
 * Loads leaderboard records from localStorage or initial seeds
 */
export function getLeaderboard(
  opponent: OpponentMode,
  tier: TriviaTier,
  format: AnswerFormat
): LeaderboardEntry[] {
  if (typeof window === 'undefined') {
    return generateSeedEntries(opponent, tier, format);
  }

  const key = getStorageKey(opponent, tier, format);
  const stored = localStorage.getItem(key);

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as LeaderboardEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => b.score - a.score).slice(0, 10);
      }
    } catch (e) {
      console.error('Failed to parse leaderboard from localStorage', e);
    }
  }

  // If none stored yet, initialize with seed entries
  const seeds = generateSeedEntries(opponent, tier, format);
  try {
    localStorage.setItem(key, JSON.stringify(seeds));
  } catch (e) {}
  return seeds.slice(0, 10);
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
 * Clears or resets a specific leaderboard category to default seeds
 */
export function resetLeaderboardCategory(
  opponent: OpponentMode,
  tier: TriviaTier,
  format: AnswerFormat
): LeaderboardEntry[] {
  const seeds = generateSeedEntries(opponent, tier, format);
  if (typeof window !== 'undefined') {
    const key = getStorageKey(opponent, tier, format);
    try {
      localStorage.setItem(key, JSON.stringify(seeds));
    } catch (e) {}
  }
  return seeds;
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
