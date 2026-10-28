// Checks the game rules: clocks, wagers and how a clue moves on after an answer.
// Usage: npm run test:rules
import assert from 'node:assert/strict';
import {
  aiFinalWager,
  clampDailyDoubleWager,
  clampFinalWager,
  playsFinal,
  readingSeconds,
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
  trackAnswer,
} from '../game/rules';
import {recapAwards} from '../game/recap';
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
  assert.equal(clampDailyDoubleWager(99_999, 1000, 300), 1000);
  assert.equal(clampDailyDoubleWager(99_999, 2000, 300), 2000);
  assert.equal(clampDailyDoubleWager(99_999, 3000, 300), 3000);
  assert.equal(clampDailyDoubleWager(5000, 1000, 6000), 5000);
  assert.equal(clampDailyDoubleWager(-50, 1000, 0), 5);
  assert.equal(clampFinalWager(99_999, 2500), 2500);
  assert.equal(clampFinalWager(99_999, -400), 0);
  assert.equal(clampFinalWager(500, 0), 0);
  assert.equal(clampFinalWager(-5, 2500), 0);
  assert.equal(aiFinalWager(10_000, true), 6500);
  assert.equal(aiFinalWager(-100, false), 0);
  assert.equal(aiFinalWager(0, true), 0);
  assert.ok(playsFinal(200) && !playsFinal(0) && !playsFinal(-600), 'only players with money play the Final');
});

check('reading a clue aloud holds the buzzers until it is read', () => {
  assert.equal(readingSeconds('Who won?', 3.6), 3.6);
  const clue = 'Who had the most receiving yards of any player in Week 6 of the 2026 season (165)?';
  const secs = readingSeconds(clue, 3.6);
  assert.ok(secs > 5 && secs < 8, `about 6 seconds for a 17-word clue, got ${secs}`);
  assert.equal(readingSeconds('word '.repeat(200), 3.6), 15);
});

const person = (id: ContestantId, name: string, extra: Partial<Contestant> = {}): Contestant => ({
  id, name, shortName: name, title: '', score: 0, reaction: 'idle', correctCount: 0, wrongCount: 0, wager: 0, ...extra,
});

check('answers add up toward the awards', () => {
  let c = person('player', 'Ann');
  c = trackAnswer(c, true, {difficulty: 5}, {buzzMs: 800, byVoice: true});
  c = trackAnswer(c, false, {difficulty: 4}, {buzzMs: 300, byVoice: true});
  c = trackAnswer(c, true, {difficulty: 2}, {buzzMs: 1200});
  assert.equal(c.fastBuzzMs, 2000, 'only right answers count toward buzz speed');
  assert.equal(c.fastBuzzes, 2);
  assert.deepEqual([c.hardRight, c.hardTries], [1, 2]);
  assert.deepEqual([c.voiceRight, c.voiceTries], [1, 2]);
});

check('awards go to the right players and skip thin samples', () => {
  const ann = person('player', 'Ann', {fastBuzzMs: 1500, fastBuzzes: 3, hardRight: 3, hardTries: 4, voiceRight: 4, voiceTries: 5});
  const bo = person('player2', 'Bo', {fastBuzzMs: 1200, fastBuzzes: 3, hardRight: 1, hardTries: 4, finalCorrect: true, wager: 900});
  const cy = person('analyst', 'Cy', {fastBuzzMs: 100, fastBuzzes: 1, finalCorrect: false, wager: 2000});
  const awards = Object.fromEntries(recapAwards([ann, bo, cy]).map((a) => [a.title, a]));
  assert.equal(awards['Quick Draw'].winner, 'Bo', 'one fast buzz is not enough');
  assert.equal(awards['Quick Draw'].detail, '0.40s average buzz');
  assert.equal(awards['Clutch Gene'].winner, 'Bo');
  assert.equal(awards['NFL Historian'].winner, 'Ann');
  assert.equal(awards['Voice Sniper'].detail, '80% with the mic');
  assert.deepEqual(recapAwards([person('player', 'Dee')]), [], 'a quiet game gives no awards');
});

check('tied awards name everyone', () => {
  const a = person('player', 'Ann', {fastBuzzMs: 1000, fastBuzzes: 2});
  const b = person('player2', 'Bo', {fastBuzzMs: 1000, fastBuzzes: 2});
  assert.equal(recapAwards([a, b])[0].winner, 'Ann and Bo');
});

if (failed) process.exit(1);
