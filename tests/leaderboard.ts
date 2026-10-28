// Checks that a leaderboard backup round-trips and merges without losing or doubling scores.
// Usage: npm run test:leaderboard
import assert from 'node:assert/strict';
import {leaderboardBackup, restoreLeaderboardBackup, type LeaderboardEntry} from '../utils/leaderboard';

let failed = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
};

/** A stand-in for localStorage. */
function fakeStore(items: Record<string, string> = {}) {
  const map = new Map(Object.entries(items));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    read: (k: string) => JSON.parse(map.get(k) || '[]') as LeaderboardEntry[],
  };
}

const entry = (id: string, score: number): LeaderboardEntry => ({
  id, playerName: id, score, accuracy: 50, questionsAnswered: 10, dailyDoublesWon: 0, date: 'Oct 28',
});
const KEY = 'sport_trivia_leaderboards_PRO_AI_MEDIUM_STANDARD';
const OTHER = 'sport_trivia_leaderboards_ONLINE_DUEL_HARD_VOICE_SHORT';

check('a backup restores onto an empty device', () => {
  const from = fakeStore({[KEY]: JSON.stringify([entry('a', 900), entry('b', 400)]), [OTHER]: JSON.stringify([entry('c', 100)]), contestant_name: 'Ann'});
  const to = fakeStore();
  assert.deepEqual(restoreLeaderboardBackup(leaderboardBackup(from), to), {boards: 2, added: 3});
  assert.deepEqual(to.read(KEY).map((e) => e.id), ['a', 'b']);
  assert.equal(to.getItem('contestant_name'), null, 'only leaderboards are in the backup');
});

check('restoring twice adds nothing and keeps the top 10', () => {
  const backup = leaderboardBackup(fakeStore({[KEY]: JSON.stringify(Array.from({length: 10}, (_, i) => entry(`old${i}`, i * 100)))}));
  const to = fakeStore({[KEY]: JSON.stringify([entry('new', 450)])});
  restoreLeaderboardBackup(backup, to);
  assert.deepEqual(restoreLeaderboardBackup(backup, to), {boards: 0, added: 0});
  const board = to.read(KEY);
  assert.equal(board.length, 10);
  assert.ok(board.some((e) => e.id === 'new'), 'scores already on the device stay');
  assert.equal(board[0].score, 900);
});

check('other files are refused', () => {
  assert.throws(() => restoreLeaderboardBackup('not json', fakeStore()), /not a leaderboard backup/);
  assert.throws(() => restoreLeaderboardBackup('{"boards":{}}', fakeStore()), /not a leaderboard backup/);
  const sneaky = JSON.stringify({kind: 'nfl-quiz-leaderboards', boards: {read_aloud: [entry('x', 1)], [KEY]: [{id: 'bad'}]}});
  assert.deepEqual(restoreLeaderboardBackup(sneaky, fakeStore()), {boards: 0, added: 0});
});

if (failed) process.exit(1);
