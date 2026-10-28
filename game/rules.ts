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
 * About how long the browser's voice takes to read `text`, in seconds, at a little faster
 * than normal speech. The buzzers open after this when clues are read aloud.
 */
export function readingSeconds(text: string, minimum: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(15, Math.max(minimum, Math.round((words / 2.8 + 0.8) * 10) / 10));
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

/** What a clue is worth to the player answering it. */
export const clueStake = (clue: ActiveClueState) => (clue.isBonusWager ? clue.bonusWagerInput : clue.clue.value);

export type AnswerHow =
  | {kind: 'player'; answer: string} // a person picked or typed an answer
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
  return {
    ...prev,
    ...startCountdown(reopenFor, ctx.now),
    phase: 'BUZZER_OPEN',
    buzzedContestantId: null,
    buzzerLockout,
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
          ...startCountdown(questionTimeLimit, now),
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
