// The host device keeps a copy of the game in progress, so a reload (or a tab the phone's
// browser threw away) doesn't end the show. It is saved between clues: boards, scores, whose
// pick it is and who sits where. Only the host needs it; phones get their seats back from it.
import type {QuestionClue, TriviaCategory} from '../triviaData';
import type {AIDifficulty, AnswerMode, BigPlay, Contestant, ContestantId, RemoteSeat, RoundType} from '../game/types';
import type {GameLength} from './leaderboard';

export interface SavedGame {
  version: 1;
  savedAt: number;
  roomCode: string;
  currentRound: RoundType;
  round1Board: TriviaCategory[];
  round2Board: TriviaCategory[];
  answeredClueIds: string[];
  activeSelector: ContestantId;
  contestants: Record<ContestantId, Contestant>;
  finalClue: QuestionClue | null;
  difficulty: AIDifficulty;
  answerMode: AnswerMode;
  gameLength: GameLength;
  episodeCode: string;
  isTwoPlayerMode: boolean;
  isClientConnected: boolean;
  hostPlays: boolean;
  matchStats: Record<string, number>;
  bigPlay: BigPlay | null;
  introducedRounds: RoundType[];
  /** Seats played from a phone, with that player's name, so each phone gets its own seat back. */
  phoneSeats: Partial<Record<RemoteSeat, string>>;
  /** Which phone (by device id) sat in each seat. */
  seatDevices: Partial<Record<RemoteSeat, string>>;
}

const KEY = 'sportsarena_saved_game';
// A game left longer than this is not offered again.
export const SAVED_GAME_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function saveGame(game: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(game));
  } catch {
    // Storage full or blocked: the game just can't be picked up after a reload.
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** The game this device was hosting, if it is recent and whole enough to pick up again. */
export function loadSavedGame(now = Date.now()): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as SavedGame;
    const whole =
      g &&
      g.version === 1 &&
      typeof g.roomCode === 'string' &&
      typeof g.savedAt === 'number' &&
      Array.isArray(g.round1Board) &&
      g.round1Board.length > 0 &&
      Array.isArray(g.round2Board) &&
      Array.isArray(g.answeredClueIds) &&
      g.contestants &&
      ['coach', 'player', 'player2', 'analyst'].every((id) => typeof g.contestants[id as ContestantId]?.score === 'number') &&
      ['ROUND_1', 'CHAMPIONSHIP', 'FINAL_SHOWDOWN'].includes(g.currentRound);
    if (!whole || now - g.savedAt > SAVED_GAME_MAX_AGE_MS || now < g.savedAt - 60000) {
      clearSavedGame();
      return null;
    }
    return g;
  } catch {
    return null;
  }
}

/** One line for the Resume card: "Round 2, 7 of 30 clues left". */
export function savedGameSummary(g: SavedGame): string {
  if (g.currentRound === 'FINAL_SHOWDOWN') return 'Final Showdown';
  const board = g.currentRound === 'ROUND_1' ? g.round1Board : g.round2Board;
  const ids = board.flatMap((cat) => cat.clues.map((q) => q.id));
  const left = ids.filter((id) => !g.answeredClueIds.includes(id)).length;
  return `Round ${g.currentRound === 'ROUND_1' ? 1 : 2}, ${left} of ${ids.length} clues left`;
}
