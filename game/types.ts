// Shared game types. The host owns the game; phones get a copy of this state over the network.
import type {QuestionClue} from '../triviaData';

export type AIDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
export type AnswerMode = 'STANDARD' | 'HARD' | 'EXPERT' | 'VOICE'; // 4-choice, 8-choice, Typed, Mic only
export type RoundType = 'ROUND_1' | 'CHAMPIONSHIP' | 'FINAL_SHOWDOWN' | 'RESULTS';
export type ContestantId = 'coach' | 'player' | 'analyst' | 'player2';
// HOST runs the game, CLIENT is a friend's phone, SCREEN is the big-screen stream view (watches only).
export type DeviceRole = 'HOST' | 'CLIENT' | 'SCREEN';

// Seats a friend's phone can take. The third seat is the AI analyst ("Stats Riley")
// unless a friend joins online to play it as P3. When the host device only hosts (a laptop
// on the stream), phones take Player 1's seat too.
export type RemoteSeat = 'player' | 'player2' | 'analyst';
export const remoteSeatsFor = (hostPlays: boolean): RemoteSeat[] =>
  hostPlays ? ['player2', 'analyst'] : ['player', 'player2', 'analyst'];
export const seatLabel = (seat: ContestantId) => (seat === 'analyst' ? 'P3' : seat === 'player2' ? 'P2' : 'P1');

// Typed and mic-only modes show no options and check the answer with fuzzy matching.
export const isOpenAnswerMode = (mode: AnswerMode) => mode === 'EXPERT' || mode === 'VOICE';
// What a phone gets of a question before the reveal: the clue without its answer, or the
// names of who it is about (which would give the answer away).
export const hideAnswer = (clue: QuestionClue): QuestionClue => ({...clue, correctAnswer: '', aliases: [], distractors: [], subjects: undefined, people: undefined});

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
  streak?: number; // right answers in a row, broken by a miss or by someone else getting one right
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
  /** A Who Am I? clue: how many of its hints are showing (1 at first). */
  hintsShown?: number;
  /** What the clue is worth to the player who buzzed in, fixed when they buzzed (it drops as hints appear). */
  stakeAtBuzz?: number;
  /**
   * Go for two: after a right answer on a top-dollar tile the player may take a harder follow-up
   * ('offer' while they decide). The follow-up is played like a Daily Double for the tile's value
   * ('playing'): right doubles the tile, wrong gives it back.
   */
  goForTwo?: {who: ContestantId; stage: 'offer' | 'playing'};
  /** A right answer here paid the pick-six bonus. */
  pickSix?: boolean;
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

/** Category draft: the players strike columns in turn until a normal board is left. */
export interface CategoryDraftState {
  round: 'ROUND_1' | 'CHAMPIONSHIP';
  /** The columns struck so far, in order. */
  struck: string[];
  /** How many columns this round's draft strikes. */
  strikes: number;
  /** Who strikes, in turn (lowest score first). */
  order: ContestantId[];
  turn: number;
}

/** Whose turn it is to strike a column. */
export const draftTurn = (d: CategoryDraftState): ContestantId => d.order[d.turn % d.order.length];

/** A person gets this long to strike a column before one is struck for them. */
export const DRAFT_TURN_MS = 20000;

/** Pick'em at the end of a game: next week's games and each player's picks (team codes). */
export interface PickemState {
  week: string;
  games: import('../triviaEngine').PickemGame[];
  picks: Partial<Record<ContestantId, Record<string, string>>>;
  locked: Partial<Record<ContestantId, boolean>>;
}
