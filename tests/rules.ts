// Checks the game rules: clocks, wagers and how a clue moves on after an answer.
// Usage: npm run test:rules
import assert from 'node:assert/strict';
import {
  aiFinalWager,
  clampDailyDoubleWager,
  clampFinalWager,
  clueTimeUp,
  countdownForSync,
  countdownFromSync,
  frozenCountdown,
  msLeft,
  pauseCountdown,
  resolveAnswer,
  resumeCountdown,
  scoreAnswer,
  startCountdown,
  TIMES,
} from '../game/rules';
import type {ActiveClueState, Contestant, ContestantId} from '../game/types';

let failed = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n')[0]}`);
  }
};

const now = 1_000_000;
const seats: ContestantId[] = ['player', 'coach', 'analyst'];
const clue = (over: Partial<ActiveClueState> = {}): ActiveClueState => ({
  clue: {id: 'q1', category: 'TEST', value: 400, clue: 'Who?', correctAnswer: 'Tom Brady', aliases: [], distractors: ['A', 'B', 'C'], sport: 'NFL', difficulty: 2},
  catIndex: 0,
  clueIndex: 1,
  phase: 'ANSWERING',
  buzzedContestantId: 'player',
  buzzerLockout: {coach: false, player: false, analyst: false, player2: false},
  ...startCountdown(8, now),
  options: [],
  isBonusWager: false,
  bonusSelectingPlayerId: 'player',
  bonusWagerInput: 400,
  bonusWagerLocked: false,
  selectedOption: null,
  typedInput: '',
  feedbackText: '',
  ...over,
});
const ctx = {name: 'Sam', buzzerSeats: seats, now};

check('a countdown runs down and stops at zero', () => {
  const c = startCountdown(5, now);
  assert.equal(msLeft(c, now + 2000), 3000);
  assert.equal(msLeft(c, now + 9000), 0);
});

check('pausing keeps the time left and resuming picks up from there', () => {
  const paused = pauseCountdown(startCountdown(10, now), now + 4000);
  assert.equal(paused.endsAt, null);
  assert.equal(msLeft(paused, now + 60_000), 6000);
  const resumed = resumeCountdown(paused, now + 60_000);
  assert.equal(msLeft(resumed, now + 61_000), 5000);
});

check('a phone with a different clock counts down from the time left', () => {
  const sent = countdownForSync(startCountdown(10, now), now + 3000);
  const phone = countdownFromSync(sent, 50); // the phone's clock reads 50
  assert.equal(msLeft(phone, 50 + 1000), 6000);
  const frozen = countdownFromSync(countdownForSync(frozenCountdown(12), now), 50);
  assert.equal(frozen.endsAt, null);
  assert.equal(msLeft(frozen, 99_999), 12_000);
});

check('a right answer reveals the clue', () => {
  const next = resolveAnswer(clue(), 'player', true, {kind: 'player', answer: 'Tom Brady'}, ctx);
  assert.equal(next.phase, 'REVEALED');
  assert.equal(next.selectedOption, 'Tom Brady');
  assert.equal(msLeft(next, now), TIMES.showCorrect * 1000);
});

check('a wrong answer locks that player out and reopens the buzzers', () => {
  const next = resolveAnswer(clue(), 'player', false, {kind: 'player', answer: 'Eli'}, ctx);
  assert.equal(next.phase, 'BUZZER_OPEN');
  assert.equal(next.buzzedContestantId, null);
  assert.equal(next.buzzerLockout.player, true);
  assert.equal(msLeft(next, now), TIMES.reopenAfterWrong * 1000);
});

check('a timeout reopens the buzzers for a little longer', () => {
  const next = resolveAnswer(clue(), 'player', false, {kind: 'timeout'}, ctx);
  assert.equal(next.phase, 'BUZZER_OPEN');
  assert.match(next.feedbackText, /timed out/);
  assert.equal(msLeft(next, now), TIMES.reopenAfterTimeout * 1000);
});

check('the last player to miss ends the clue', () => {
  const lockout = {coach: true, player: false, analyst: true, player2: false};
  const next = resolveAnswer(clue({buzzerLockout: lockout}), 'player', false, {kind: 'ai', answer: 'B'}, ctx);
  assert.equal(next.phase, 'REVEALED');
  assert.match(next.feedbackText, /Correct was: Tom Brady/);
});

check('a missed Daily Double ends the clue', () => {
  const next = resolveAnswer(clue({isBonusWager: true}), 'player', false, {kind: 'player', answer: 'x'}, ctx);
  assert.equal(next.phase, 'REVEALED');
});

check('the clock moves a clue from reading to buzzers to the answer', () => {
  const reading = clueTimeUp(clue({phase: 'READING', buzzedContestantId: null}), 12, now);
  assert.equal(reading.kind, 'buzzers-open');
  if (reading.kind !== 'buzzers-open') return;
  assert.equal(msLeft(reading.next, now), 12_000);
  const open = clueTimeUp(reading.next, 12, now);
  assert.equal(open.kind, 'nobody-buzzed');
  assert.deepEqual(clueTimeUp(clue(), 12, now), {kind: 'answer-timed-out', who: 'player'});
  assert.deepEqual(clueTimeUp(clue({phase: 'REVEALED'}), 12, now), {kind: 'done'});
});

check('scores go up and down by the stake', () => {
  const c: Contestant = {id: 'player', name: 'Sam', shortName: 'P1', title: '', score: 1000, reaction: 'idle', correctCount: 0, wrongCount: 0, wager: 0};
  const right = scoreAnswer(c, 400, true, true);
  assert.equal(right.score, 1400);
  assert.equal(right.correctCount, 1);
  assert.equal(right.bonusHits, 1);
  const wrong = scoreAnswer(c, 400, false, false);
  assert.equal(wrong.score, 600);
  assert.equal(wrong.wrongCount, 1);
});

check('wagers stay inside the limits', () => {
  assert.equal(clampDailyDoubleWager(99_999, 'ROUND_1', 300), 1000);
  assert.equal(clampDailyDoubleWager(99_999, 'CHAMPIONSHIP', 300), 2000);
  assert.equal(clampDailyDoubleWager(5000, 'ROUND_1', 6000), 5000);
  assert.equal(clampDailyDoubleWager(-50, 'ROUND_1', 0), 5);
  assert.equal(clampFinalWager(99_999, 2500), 2500);
  assert.equal(clampFinalWager(99_999, -400), 1000);
  assert.equal(clampFinalWager(-5, 2500), 0);
  assert.equal(aiFinalWager(10_000, true), 6500);
  assert.equal(aiFinalWager(-100, false), 1000);
});

if (failed) process.exit(1);
