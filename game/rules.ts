// Game rules as plain functions: timers, scoring, wagers and how a clue moves from phase to
// phase. Nothing here touches React, sound or the network, so it can be tested on its own.
import {checkTypedAnswer, type QuestionClue} from '../triviaData';
import type {ActiveClueState, AIDifficulty, Contestant, ContestantId, Countdown} from './types';

// Seconds for each step of a clue.
export const TIMES = {
  dailyDouble: 12, // answering a Daily Double once the wager is in
  aiAnswer: 3.5, // an AI player who buzzed in
  humanAnswer: 8, // a player who buzzed in
  voiceAnswer: 10, // mic-only games give a little longer, so a missed word can be said again
  reopenAfterWrong: 4.5, // buzzers open again after a wrong answer
  reopenAfterTimeout: 5, // buzzers open again after a player ran out of time
  showCorrect: 2.8, // how long the answer stays up after a right answer
  showAnswer: 3, // how long the answer stays up after a miss
  final: 30, // answering the Final Showdown
};

/**
 * Buzzing while the clue is still being read locks that player out for this long, as on TV,
 * so tapping over and over doesn't beat waiting for the light.
 */
export const EARLY_BUZZ_LOCKOUT_MS = 250;
/**
 * When a phone's buzz counts as pressed, on the host's clock. A phone sees the buzzer light up
 * a network trip after the host does, so judging by arrival time (even minus the trip back)
 * favors a player on the host device. Instead each phone reports its reaction time from when
 * it showed the light, and the host adds that to when it opened the buzzers: everyone is
 * timed from the moment they could see the light. Older phones without a reaction time fall
 * back to arrival time minus the one-way delay.
 */
export function remoteBuzzTime(openedAt: number, arrivedAt: number, oneWayDelayMs: number, reactionMs?: number): number {
  if (reactionMs === undefined || !Number.isFinite(reactionMs) || reactionMs < 0) return arrivedAt - oneWayDelayMs;
  return Math.min(arrivedAt, openedAt + reactionMs);
}

/** True when a buzz pressed at `pressedAt` falls inside an early-buzz lockout that ends at `lockedUntil`. */
export const inEarlyBuzzLockout = (pressedAt: number, lockedUntil: number | undefined) =>
  lockedUntil !== undefined && pressedAt < lockedUntil;

// --- Countdowns -------------------------------------------------------------------------

export const startCountdown = (seconds: number, now: number): Countdown => ({endsAt: now + seconds * 1000, leftMs: seconds * 1000});
export const frozenCountdown = (seconds: number): Countdown => ({endsAt: null, leftMs: seconds * 1000});

export const msLeft = (c: Countdown, now: number) => (c.endsAt === null ? c.leftMs : Math.max(0, c.endsAt - now));

export const pauseCountdown = <T extends Countdown>(c: T, now: number): T =>
  c.endsAt === null ? c : {...c, endsAt: null, leftMs: msLeft(c, now)};

export const resumeCountdown = <T extends Countdown>(c: T, now: number): T => ({...c, endsAt: now + c.leftMs});

// Clocks differ between devices, so the host sends how much time is left and each phone
// turns that back into an end time on its own clock.
export const countdownForSync = <T extends Countdown>(c: T, now: number): T & {running: boolean} => ({
  ...c,
  running: c.endsAt !== null,
  leftMs: msLeft(c, now),
});
export const countdownFromSync = <T extends Countdown>(c: T & {running?: boolean}, now: number): T => ({
  ...c,
  endsAt: c.running === false ? null : now + c.leftMs,
});

// --- AI opponents -----------------------------------------------------------------------

export interface AISettings {
  coachSpeed: number; // seconds to buzz, before randomness
  analystSpeed: number;
  coachAcc: number; // chance of a right answer
  analystAcc: number;
}

export function aiSettings(difficulty: AIDifficulty): AISettings {
  switch (difficulty) {
    case 'EASY':
      return {coachSpeed: 3.8, analystSpeed: 4.2, coachAcc: 0.45, analystAcc: 0.48};
    case 'HARD':
      return {coachSpeed: 1.4, analystSpeed: 1.3, coachAcc: 0.82, analystAcc: 0.86};
    case 'EXPERT':
      return {coachSpeed: 0.8, analystSpeed: 0.75, coachAcc: 0.94, analystAcc: 0.96};
    case 'MEDIUM':
    default:
      return {coachSpeed: 2.3, analystSpeed: 2.1, coachAcc: 0.68, analystAcc: 0.72};
  }
}


/** Categories each AI is especially good at: Coach Dave knows coaches, big games and teams; Stats Riley knows numbers and players. */
const AI_SPECIALTIES: Record<'coach' | 'analyst', RegExp> = {
  coach: /^nfl_(super_bowl|conference_title|head_coaches|stadiums|records$|franchises|blockbuster_trades)/,
  analyst: /^nfl_(passing|rushing|receiving)_leaders|^nfl_(this_season|this_week|combine|stars_now|records_legends|playoff_qbs|who_am_i)/,
};

/**
 * How likely an AI player is to answer a clue right. `base` is its accuracy for the game's
 * difficulty on an average ($600-level) clue. Easier clues go up and harder ones down, by
 * about 8 points a level, and the AI's specialties add 10 points.
 */
export function aiCorrectChance(base: number, who: 'coach' | 'analyst', difficulty: number, categoryId = ''): number {
  const level = Math.min(5, Math.max(1, difficulty || 3));
  const specialty = AI_SPECIALTIES[who].test(categoryId) ? 0.1 : 0;
  return Math.min(0.98, Math.max(0.15, base + (3 - level) * 0.08 + specialty));
}

/** An AI only buzzes in when it thinks it knows: always when it's sure, less often on a long shot. */
export const aiBuzzChance = (correctChance: number) => Math.min(1, 0.3 + correctChance * 0.8);

// --- Wagers -----------------------------------------------------------------------------

// `topClue` is the highest tile on the board in play: $1,000 / $2,000 in a full game,
// $1,500 / $3,000 in a short one.

/** A Daily Double can risk the whole score, or the board's top clue value when the score is lower. */
export const maxDailyDoubleWager = (topClue: number, score: number) => Math.max(topClue, score);
export const clampDailyDoubleWager = (wager: number, topClue: number, score: number) =>
  Math.max(5, Math.min(maxDailyDoubleWager(topClue, score), Math.round(Number(wager)) || 5));
/** The amount a player's Daily Double box starts at. */
export const defaultDailyDoubleWager = (topClue: number, score: number) =>
  Math.min(topClue, maxDailyDoubleWager(topClue, score));

/** Better AI players bet bigger. */
export function aiDailyDoubleWager(accuracy: number, topClue: number, score: number): number {
  const max = maxDailyDoubleWager(topClue, score);
  const bet = accuracy > 0.8 ? max * 0.9 : accuracy > 0.6 ? max * 0.65 : Math.max(topClue, max * 0.4);
  return Math.max(5, Math.min(max, Math.round(Math.floor(bet) / 50) * 50));
}

/** Only players with money in the bank play the Final Showdown (the TV rule); the rest sit it out. */
export const playsFinal = (score: number) => score > 0;
/** The Final Showdown lets a player bet up to their whole score. */
export const maxFinalWager = (score: number) => Math.max(0, score);
export const clampFinalWager = (wager: number, score: number) =>
  Math.max(0, Math.min(maxFinalWager(score), Math.round(Number(wager)) || 0));

/** The leader protects some of the lead; everyone else goes big. */
export function aiFinalWager(score: number, isLeader: boolean, random = Math.random()): number {
  if (!playsFinal(score)) return 0;
  const bank = maxFinalWager(score);
  return isLeader ? Math.floor(bank * 0.65) : Math.floor(bank * (0.8 + random * 0.2));
}

// --- Reading clues aloud ---------------------------------------------------------------

/**
 * About how long the browser's voice takes to read `text` at speech rate `rate`, in seconds.
 * The buzzers open after this when clues are read aloud (or sooner, the moment the reading
 * actually ends), so it errs on the long side.
 */
export function readingSeconds(text: string, minimum: number, rate = 1.2): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(20, Math.max(minimum, Math.round((words / (2.5 * rate) + 1) * 10) / 10));
}

// --- Answers ----------------------------------------------------------------------------

/** Multiple choice needs the exact option; typed answers get the usual spelling tolerance. */
export function isFinalAnswerRight(input: string, clue: QuestionClue, options: string[], threshold: number): boolean {
  if (options.length) return input.trim().toLowerCase() === clue.correctAnswer.trim().toLowerCase();
  return checkTypedAnswer(input, clue, threshold);
}

/** A contestant's line after answering a clue worth `amount`. */
export function scoreAnswer(c: Contestant, amount: number, correct: boolean, isBonus: boolean): Contestant {
  return correct
    ? {
        ...c,
        score: c.score + amount,
        reaction: 'correct',
        correctCount: c.correctCount + 1,
        bonusHits: (c.bonusHits || 0) + (isBonus ? 1 : 0),
      }
    : {...c, score: c.score - amount, reaction: 'wrong', wrongCount: c.wrongCount + 1};
}

/** The clue difficulty (1 to 5) from which a right answer counts toward NFL Historian. */
export const HARD_CLUE_DIFFICULTY = 4;

/** Adds one answer to a contestant's award stats. */
export function trackAnswer(
  c: Contestant,
  correct: boolean,
  clue: {difficulty: number},
  how: {buzzMs?: number; byVoice?: boolean}
): Contestant {
  const next = {...c};
  if (correct && how.buzzMs !== undefined) {
    next.fastBuzzMs = (c.fastBuzzMs || 0) + how.buzzMs;
    next.fastBuzzes = (c.fastBuzzes || 0) + 1;
  }
  if (clue.difficulty >= HARD_CLUE_DIFFICULTY) {
    next.hardTries = (c.hardTries || 0) + 1;
    if (correct) next.hardRight = (c.hardRight || 0) + 1;
  }
  if (how.byVoice) {
    next.voiceTries = (c.voiceTries || 0) + 1;
    if (correct) next.voiceRight = (c.voiceRight || 0) + 1;
  }
  return next;
}

/** A run this long or longer is a hot streak: a flame on the podium and a call from the host voice. */
export const HOT_STREAK = 3;
export const isOnFire = (c: Pick<Contestant, 'streak'>) => (c.streak || 0) >= HOT_STREAK;

/**
 * Updates everyone's streak after `who` answers: a right answer adds one to theirs and ends
 * everyone else's run, a miss ends theirs.
 */
export function updateStreaks<T extends Record<string, Contestant>>(all: T, who: keyof T, correct: boolean): T {
  const next = {...all};
  for (const id of Object.keys(all) as (keyof T)[]) {
    const streak = id === who ? (correct ? (all[id].streak || 0) + 1 : 0) : correct ? 0 : all[id].streak || 0;
    if (streak !== (all[id].streak || 0)) next[id] = {...all[id], streak};
  }
  return next;
}

// --- Who Am I? hints --------------------------------------------------------------------

/** A new hint shows this often while the buzzers are open. */
export const HINT_SECONDS = 4;

/** How many hints a clue shows one at a time (0 when it shows the whole clue at once, as a Daily Double does). */
export const hintCount = (c: Pick<ActiveClueState, 'clue' | 'isBonusWager'>) =>
  !c.isBonusWager && c.clue.hints && c.clue.hints.length > 1 ? c.clue.hints.length : 0;

/** A tile's value with `shown` of `total` hints up: full with one hint, then down by equal steps (rounded to $100). */
export const hintValue = (value: number, shown: number, total: number) =>
  total ? Math.max(100, Math.round((value * (total - Math.min(shown, total) + 1)) / total / 100) * 100) : value;

/** The clue text players can see right now: the hints so far, or the whole clue. */
export function shownClueText(c: Pick<ActiveClueState, 'clue' | 'isBonusWager' | 'phase' | 'hintsShown'>): string {
  const n = hintCount(c);
  if (!n || c.phase === 'REVEALED') return c.clue.clue;
  return c.clue.hints!.slice(0, Math.max(1, c.hintsShown ?? 1)).join(' ');
}

/** What the clue is worth right now: the wager, the value when the current player buzzed, or the value at this hint. */
export function currentWorth(c: ActiveClueState): number {
  if (c.isBonusWager) return c.bonusWagerInput;
  if (c.stakeAtBuzz !== undefined) return c.stakeAtBuzz;
  const n = hintCount(c);
  return n ? hintValue(c.clue.value, c.hintsShown ?? 1, n) : c.clue.value;
}

/** What a clue is worth to the player answering it. */
export const clueStake = (clue: ActiveClueState) => currentWorth(clue);

export type AnswerHow =
  | {kind: 'player'; answer: string; byVoice?: boolean} // a person picked, typed or said an answer
  | {kind: 'ai'; answer: string} // an AI player said an answer
  | {kind: 'timeout'}; // the answer clock ran out

/**
 * The clue after `who` answered. A right answer reveals it. A wrong one locks that player out
 * and reopens the buzzers, unless it was a Daily Double or nobody is left to buzz.
 */
export function resolveAnswer(
  prev: ActiveClueState,
  who: ContestantId,
  correct: boolean,
  how: AnswerHow,
  ctx: {name: string; buzzerSeats: ContestantId[]; now: number}
): ActiveClueState {
  const stake = clueStake(prev).toLocaleString();
  const right = prev.clue.correctAnswer;
  const selectedOption = how.kind === 'player' ? how.answer : prev.selectedOption;

  if (correct) {
    return {
      ...prev,
      ...startCountdown(TIMES.showCorrect, ctx.now),
      phase: 'REVEALED',
      selectedOption,
      feedbackText:
        how.kind === 'ai'
          ? `${ctx.name} is CORRECT with "${how.answer}"! (+$${stake})`
          : `CORRECT! ${ctx.name} earned +$${stake} and won Board Control!`,
    };
  }

  const buzzerLockout = {...prev.buzzerLockout, [who]: true};
  const nobodyLeft = ctx.buzzerSeats.every((id) => buzzerLockout[id]);
  if (prev.isBonusWager || nobodyLeft) {
    return {
      ...prev,
      ...startCountdown(TIMES.showAnswer, ctx.now),
      phase: 'REVEALED',
      selectedOption,
      buzzerLockout,
      feedbackText:
        how.kind === 'ai'
          ? `${ctx.name} said "${how.answer}" (Incorrect). Correct was: ${right}`
          : how.kind === 'timeout'
          ? `Time expired! Correct answer: ${right}`
          : `INCORRECT! (-$${stake}) Correct answer: ${right}`,
    };
  }

  const reopenFor = how.kind === 'timeout' ? TIMES.reopenAfterTimeout : TIMES.reopenAfterWrong;
  const hints = hintCount(prev);
  return {
    ...prev,
    ...startCountdown(reopenFor, ctx.now),
    phase: 'BUZZER_OPEN',
    buzzedContestantId: null,
    buzzerLockout,
    // After a miss everyone sees every hint, and the clue is worth its lowest value.
    ...(hints ? {hintsShown: hints, stakeAtBuzz: undefined} : {}),
    feedbackText:
      how.kind === 'ai'
        ? `${ctx.name} said "${how.answer}" (Incorrect, -$${stake}). Buzzers re-opened!`
        : how.kind === 'timeout'
        ? `${ctx.name} timed out! Buzzers re-opened!`
        : `${ctx.name} was Incorrect (-$${stake}). Buzzers re-opened!`,
  };
}

/** The clue once the current phase's clock runs out, before any answer is scored. */
export type ClueTimeUp =
  | {kind: 'buzzers-open'; next: ActiveClueState}
  | {kind: 'nobody-buzzed'; next: ActiveClueState}
  | {kind: 'answer-timed-out'; who: ContestantId}
  | {kind: 'done'};

export function clueTimeUp(prev: ActiveClueState, questionTimeLimit: number, now: number): ClueTimeUp {
  switch (prev.phase) {
    case 'READING':
      return {
        kind: 'buzzers-open',
        next: {
          ...prev,
          // A Who Am I? clue keeps the buzzers open long enough for every hint to show.
          ...startCountdown(questionTimeLimit + Math.max(0, hintCount(prev) - 1) * HINT_SECONDS, now),
          phase: 'BUZZER_OPEN',
          feedbackText: 'BUZZERS ACTIVE! Buzz in now!',
        },
      };
    case 'BUZZER_OPEN':
      return {
        kind: 'nobody-buzzed',
        next: {
          ...prev,
          ...startCountdown(TIMES.showAnswer, now),
          phase: 'REVEALED',
          feedbackText: `Time's up! Correct answer: ${prev.clue.correctAnswer}`,
        },
      };
    case 'ANSWERING':
      return prev.buzzedContestantId ? {kind: 'answer-timed-out', who: prev.buzzedContestantId} : {kind: 'done'};
    case 'REVEALED':
    default:
      return {kind: 'done'};
  }
}
