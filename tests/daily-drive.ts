// Daily Drive: the same five questions for everyone on a day, one per level, and the streak and share text.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const store: Record<string, string> = {};
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => (store[k] = String(v)),
  removeItem: (k: string) => delete store[k],
};
const bank = JSON.parse(readFileSync(new URL('../public/questions/nfl.json', import.meta.url), 'utf8'));
(globalThis as any).fetch = async () => ({ok: true, json: async () => bank});

const T = await import('../triviaData');
const D = await import('../utils/dailyDrive');
await T.loadExternalQuestionBank();

const a = T.dailyDriveClues('2026-11-13');
assert.equal(a.length, 5);
assert.deepEqual(a.map((q) => q.difficulty), [1, 2, 3, 4, 5]);
assert.deepEqual(a.map((q) => q.value), [200, 400, 600, 800, 1000]);
assert.equal(new Set(a.map((q) => T.categoryFamily(q.categoryId!))).size, 5, 'five different kinds of column');
assert.ok(!a.some((q) => ['nfl_this_week', 'nfl_this_season', 'nfl_custom_column'].includes(q.categoryId!)));
// Nothing this device has seen or flagged changes the drive.
T.markQuestionsSeen(a.map((q) => q.id));
assert.deepEqual(T.dailyDriveClues('2026-11-13').map((q) => q.id), a.map((q) => q.id));
const days = ['2026-11-14', '2026-11-15', '2026-11-16'].map((d) => T.dailyDriveClues(d).map((q) => q.id).join());
assert.equal(new Set([a.map((q) => q.id).join(), ...days]).size, 4, 'each day has its own drive');
console.log('ok   one clue per level from five kinds of column, the same on every device that day, new each day');

assert.equal(D.dailyStreak('2026-11-13'), 0);
D.saveDailyResult({day: '2026-11-11', right: [true, true, true, false, false]});
D.saveDailyResult({day: '2026-11-12', right: [true, true, false, true, false]});
assert.equal(D.dailyStreak('2026-11-13'), 2, 'today not played yet: the streak runs to yesterday');
D.saveDailyResult({day: '2026-11-13', right: [true, true, true, true, false]});
assert.equal(D.dailyStreak('2026-11-13'), 3);
assert.deepEqual(D.savedDailyResult('2026-11-13')?.right, [true, true, true, true, false]);
assert.equal(D.savedDailyResult('2026-11-14'), null);
assert.equal(D.dailyMoney([true, true, true, true, false]), 2000);
const text = D.dailyShareText(D.savedDailyResult('2026-11-13')!, 3, 'https://example.com/?daily=1');
assert.ok(text.includes('🟩🟩🟩🟩🟥') && text.includes('$2,000 of $3,000') && text.includes('3-day streak') && text.includes('Nov 13'));
for (const q of a) assert.ok(!text.includes(q.correctAnswer), 'the share text gives nothing away');
console.log('ok   results, streaks and a share text with no answers in it');
