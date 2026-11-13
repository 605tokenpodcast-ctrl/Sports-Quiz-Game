// Question freshness: questions the group saw recently are held back, phones pool their
// history with the host's, and boards still fill when the group has seen everything.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const store: Record<string, string> = {};
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => (store[k] = String(v)),
  removeItem: (k: string) => delete store[k],
};
// A device upgrading from the old undated list.
store['sports_arena_seen_hashes_v20'] = JSON.stringify(['old_a', 'old_b']);

const bank = JSON.parse(readFileSync(new URL('../public/questions/nfl.json', import.meta.url), 'utf8'));
(globalThis as any).fetch = async () => ({ok: true, json: async () => bank});

const T = await import('../triviaData');
const H = await import('../utils/questionHistory');
await T.loadExternalQuestionBank();

const now = H.today();
assert.equal(H.lastShownDay('old_a'), now);
assert.equal(store['sports_arena_seen_hashes_v20'], undefined);
console.log('ok   the old per-device list carries over (held back from today)');

const gameIds = (s: ReturnType<typeof T.createFullGameSession>) => [
  ...[...s.round1Board, ...s.round2Board].flatMap((c) => c.clues.map((q) => q.id)),
  s.finalClue.id,
];
const assertFull = (s: ReturnType<typeof T.createFullGameSession>, label: string) => {
  assert.equal(s.round1Board.length, 6, `${label}: Round 1 columns`);
  assert.equal(s.round2Board.length, 6, `${label}: Round 2 columns`);
  for (const c of [...s.round1Board, ...s.round2Board]) assert.equal(c.clues.length, 5, `${label}: ${c.title} clues`);
  assert.ok(s.finalClue?.id, `${label}: Final`);
};

// Dealing alone doesn't mark anything: only questions actually shown are remembered.
T.resetSeenQuestions();
const first = T.createFullGameSession('MEDIUM');
assert.equal(T.getSeenQuestionsCount(), 0);
console.log('ok   dealing a board marks nothing (unopened tiles stay fresh)');

// Play the whole game, then deal again: nothing from it comes back.
T.markQuestionsSeen(gameIds(first));
const second = T.createFullGameSession('MEDIUM');
const firstSet = new Set(gameIds(first));
assert.equal(gameIds(second).filter((id) => firstSet.has(id)).length, 0);
console.log('ok   the next game repeats none of the questions just played');

// A phone that joins brings its history; the host holds those questions back too.
T.resetSeenQuestions();
const phoneGame = T.createFullGameSession('MEDIUM');
const phoneIds = gameIds(phoneGame);
const phoneHistory: Record<string, string[]> = {[now - 3]: phoneIds};
assert.equal(H.mergeHistory(phoneHistory), phoneIds.length);
assert.equal(H.mergeHistory(phoneHistory), 0, 'merging the same history twice changes nothing');
const phoneSet = new Set(phoneIds);
for (let g = 0; g < 5; g++) {
  const s = T.createFullGameSession('MEDIUM');
  assert.equal(gameIds(s).filter((id) => phoneSet.has(id)).length, 0, `game ${g + 1} reused a question a phone saw`);
}
// And the host's history goes back out whole, so that phone could host next time.
const out = H.exportHistory();
assert.deepEqual([...out[now - 3]].sort(), [...phoneIds].sort());
console.log("ok   a joining phone's history is held back by the host and handed back as the group's");

// Bad input from a phone is ignored; a date in the future counts as today.
H.mergeHistory({banana: ['x'], [now + 400]: ['future_q', 42], [now - 1]: 'nope'} as any);
assert.equal(H.lastShownDay('future_q'), now);
assert.equal(H.lastShownDay('x'), undefined);
console.log('ok   junk and future dates from a phone are handled');

// Seen long ago (past the hold-back window) counts as fresh again, but never-seen still comes first.
T.resetSeenQuestions();
const all = T.getActiveCategories().flatMap((c) => c.clues.map((q) => q.id));
H.mergeHistory({[now - H.HOLD_BACK_DAYS - 5]: all});
assert.equal(T.isRecentlySeen(all[0]), false);
assert.equal(H.heldBackCount(), 0);
console.log(`ok   questions seen more than ${H.HOLD_BACK_DAYS} days ago come back`);

// The group has seen everything recently: boards still fill, from what was seen longest ago.
T.resetSeenQuestions();
const older = all.filter((_, i) => i % 2 === 0);
const newer = all.filter((_, i) => i % 2 === 1);
H.mergeHistory({[now - 40]: older, [now]: newer});
const olderSet = new Set(older);
for (const len of ['FULL', 'SHORT'] as const) {
  const s = T.createFullGameSession('MEDIUM', len);
  if (len === 'FULL') assertFull(s, 'all seen');
  else assert.equal(s.round2Board[0].clues.length, 3);
  const ids = gameIds(s);
  const share = ids.filter((id) => olderSet.has(id)).length / ids.length;
  assert.ok(share > 0.8, `${len}: only ${Math.round(share * 100)}% came from the longest-ago half`);
  console.log(`ok   everything seen: a ${len.toLowerCase()} game still fills, ${Math.round(share * 100)}% from the questions seen longest ago`);
}

// Many games in a row (each fully played) keep filling and repeat nothing until the bank runs thin.
T.resetSeenQuestions();
const played = new Set<string>();
let firstRepeat = 0;
for (let g = 1; g <= 60; g++) {
  const s = T.createFullGameSession('MEDIUM');
  assertFull(s, `game ${g}`);
  const ids = gameIds(s);
  if (!firstRepeat && ids.some((id) => played.has(id))) firstRepeat = g;
  ids.forEach((id) => played.add(id));
  T.markQuestionsSeen(ids);
}
// (The small weekly and season columns are put on every board, so they repeat first.)
console.log(`ok   60 games in a row all fill; first repeated question in game ${firstRepeat || 'none'} (bank of ${all.length})`);

// Reset clears it all.
T.resetSeenQuestions();
assert.equal(T.getSeenQuestionsCount(), 0);
assert.equal(store['sports_arena_question_history_v1'], undefined);
console.log('ok   reset clears the history');
