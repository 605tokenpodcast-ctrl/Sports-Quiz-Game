// Shared game types. The host owns the game; phones get a copy of this state over the network.
import type {QuestionClue} from '../triviaData';

export type AIDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
export type AnswerMode = 'STANDARD' | 'HARD' | 'EXPERT' | 'VOICE'; // 4-choice, 8-choice, Typed, Mic only
export type RoundType = 'ROUND_1' | 'CHAMPIONSHIP' | 'FINAL_SHOWDOWN' | 'RESULTS';
export type ContestantId = 'coach' | 'player' | 'analyst' | 'player2';
// HOST runs the game, CLIENT is a friend's phone, SCREEN is the big-screen stream view (watches only).
export type DeviceRole = 'HOST' | 'CLIENT' | 'SCREEN';

// Seats a friend's phone can take. The third seat is the AI analyst ("Stats Riley")
// unless a second friend joins online, in which case that friend plays it as P3.
export type RemoteSeat = 'player2' | 'analyst';
export const REMOTE_SEATS: RemoteSeat[] = ['player2', 'analyst'];
export const seatLabel = (seat: ContestantId) => (seat === 'analyst' ? 'P3' : seat === 'player2' ? 'P2' : 'P1');

// Typed and mic-only modes show no options and check the answer with fuzzy matching.
export const isOpenAnswerMode = (mode: AnswerMode) => mode === 'EXPERT' || mode === 'VOICE';
// What a phone gets of a question before the reveal: the clue without its answer.
export const hideAnswer = (clue: QuestionClue): QuestionClue => ({...clue, correctAnswer: '', aliases: [], distractors: []});

export interface Contestant {
  id: ContestantId;
  name: string;
  shortName: string;
  title: string;
  score: number;
  reaction: 'idle' | 'buzzing' | 'answering' | 'correct' | 'wrong' | 'locked';
  correctCount: number;
  wrongCount: number;
  wager: number;
  bonusHits?: number; // Daily Doubles answered correctly
  finalAnswer?: string;
  finalCorrect?: boolean;
  sitsOutFinal?: boolean; // no money in the bank when the Final Showdown started
  // For the end-of-game awards
  fastBuzzMs?: number; // total buzz-in time on clues answered right
  fastBuzzes?: number; // how many of those were timed
  hardRight?: number; // right answers on the board's two toughest rows
  hardTries?: number;
  voiceRight?: number; // right answers given with the mic
  voiceTries?: number;
}

/** The biggest single win of the match, for the recap. */
export interface BigPlay {
  who: ContestantId;
  amount: number;
  dailyDouble: boolean;
  category: string;
}

/**
 * A countdown. While it runs, `endsAt` is the time it hits zero on this device's clock.
 * While it is paused (a menu is open, or a Daily Double wager isn't in yet) `endsAt` is null
 * and `leftMs` holds what is left.
 */
export interface Countdown {
  endsAt: number | null;
  leftMs: number;
}

export interface ActiveClueState extends Countdown {
  clue: QuestionClue;
  catIndex: number;
  clueIndex: number;
  phase: 'READING' | 'BUZZER_OPEN' | 'ANSWERING' | 'REVEALED';
  buzzedContestantId: ContestantId | null;
  buzzMs?: number; // how long the buzzer was open before the current answerer pressed
  buzzerLockout: Record<ContestantId, boolean>;
  options: string[];
  isBonusWager: boolean;
  bonusSelectingPlayerId: ContestantId;
  bonusWagerInput: number;
  bonusWagerLocked: boolean;
  selectedOption: string | null;
  typedInput: string;
  feedbackText: string;
}

export type FinalPhase = 'WAGER' | 'CLUE' | 'RESULTS';

// Final Showdown: which players have locked their wager and their answer.
export type FinalLocks = {wager: Partial<Record<ContestantId, boolean>>; answer: Partial<Record<ContestantId, boolean>>};
export const NO_FINAL_LOCKS: FinalLocks = {wager: {}, answer: {}};

export interface MatchStats {
  totalQuestions: number;
  playerCorrect: number;
  playerWrong: number;
  highestScore: number;
  buzzerWins: number;
  bonusWagersHit: number;
}
