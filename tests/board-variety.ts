// Board variety from game to game: columns follow the calendar, the last game's columns sit
// the next one out, and people the group was just asked about wait a few weeks.
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
const H = await import('../utils/questionHistory');
const {seededRandom} = await import('../utils/episode');
await T.loadExternalQuestionBank();

type Session = ReturnType<typeof T.createFullGameSession>;
const columns = (s: Session) => [...s.round1Board, ...s.round2Board].map((c) => c.id);
const clues = (s: Session) => [...s.round1Board, ...s.round2Board].flatMap((c) => c.clues);
const CURRENT = new Set<string>(Object.values(T.CURRENT_CATEGORY_IDS));
const day = (month: number, date: number) => new Date(2026, month - 1, date);

// ---- The calendar ----------------------------------------------------------
assert.ok(T.isInSeason('nfl_thanksgiving', day(11, 26)));
assert.ok(!T.isInSeason('nfl_thanksgiving', day(7, 4)));
assert.ok(T.isInSeason('nfl_frozen_tundra', day(1, 10)), 'a window can run over New Year');
assert.ok(T.isInSeason('nfl_frozen_tundra', day(12, 20)));
assert.ok(!T.isInSeason('nfl_frozen_tundra', day(2, 20)));
assert.ok(T.isInSeason('nfl_super_bowl_details', day(2, 7)));
assert.ok(T.isInSeason('nfl_drafted_by_1990s', day(4, 24)));
console.log('ok   columns know their time of year (and a window can cross New Year)');

T.setDealDate(day(11, 26));
for (let g = 0; g < 8; g++) {
  T.resetSeenQuestions();
  assert.ok(columns(T.createFullGameSession('MEDIUM')).includes('nfl_thanksgiving'), 'Thanksgiving week game without Turkey Day');
}
console.log('ok   Thanksgiving week: every game has Turkey Day');

T.setDealDate(day(2, 5));
for (let g = 0; g < 8; g++) {
  T.resetSeenQuestions();
  const s = T.createFullGameSession('MEDIUM');
  for (const board of [s.round1Board, s.round2Board]) {
    assert.ok(board.some((c) => T.isInSeason(c.id, day(2, 5))), `Super Bowl week board with nothing in season: ${board.map((c) => c.id)}`);
    assert.ok(board.filter((c) => T.isInSeason(c.id, day(2, 5))).length <= 3, 'the calendar took over the board');
  }
  assert.ok(columns(s).some((id) => id.startsWith('nfl_super_bowl')), 'Super Bowl week game without a Super Bowl column');
}
console.log('ok   Super Bowl week: every board has a playoff column, every game a Super Bowl column');

T.setDealDate(day(7, 4));
let turkeys = 0;
for (let g = 0; g < 12; g++) {
  T.resetSeenQuestions();
  if (columns(T.createFullGameSession('MEDIUM')).includes('nfl_thanksgiving')) turkeys++;
}
assert.ok(turkeys < 12, 'Turkey Day in every July game');
console.log(`ok   out of season a column takes its chances (Turkey Day in ${turkeys} of 12 July games)`);

// ---- The last game's columns sit the next one out --------------------------
T.resetSeenQuestions();
let last = T.createFullGameSession('MEDIUM');
for (let g = 0; g < 10; g++) {
  T.rememberGameColumns(columns(last));
  const next = T.createFullGameSession('MEDIUM');
  const again = columns(next).filter((id) => columns(last).includes(id) && !CURRENT.has(id));
  assert.deepEqual(again, [], `game ${g + 2} brought back ${again}`);
  assert.equal(next.round1Board.length, 6);
  assert.equal(next.round2Board.length, 6);
  last = next;
}
console.log("ok   ten games in a row: none brings back a column from the game before (besides this week's and the season's)");

// ---- An episode code ignores the calendar and the last game ----------------
const deal = () => T.dealWith(seededRandom('TEST-CODE'), () => T.createFullGameSession('MEDIUM'));
T.setDealDate(day(7, 4));
T.resetSeenQuestions();
const july = deal();
T.setDealDate(day(11, 26));
T.rememberGameColumns(columns(july));
T.markQuestionsSeen(clues(july).map((q) => q.id));
const november = deal();
assert.deepEqual(clues(november).map((q) => q.id), clues(july).map((q) => q.id));
console.log('ok   an episode code deals the same game whatever the date, the last game or who came up lately');

// ---- People wait a few weeks -----------------------------------------------
T.setDealDate(day(7, 4));
T.resetSeenQuestions();
const first = T.createFullGameSession('MEDIUM');
T.markQuestionsSeen([...clues(first).map((q) => q.id), first.finalClue.id]);
const met = new Set(clues(first).flatMap((q) => q.people ?? []));
assert.ok(met.size > 20, 'the first game named people');
for (const p of met) assert.ok(H.isPersonHeldBack(p));
assert.equal(T.getSeenQuestionsCount(), clues(first).length + 1, "people don't count as questions seen");
let about = 0, asked = 0;
for (let g = 0; g < 5; g++) {
  const s = T.createFullGameSession('MEDIUM');
  // The two current columns are small and about this season's stars, so they are allowed to repeat people.
  const open = [...s.round1Board, ...s.round2Board].filter((c) => !CURRENT.has(c.id)).flatMap((c) => c.clues);
  asked += open.length;
  about += open.filter((q) => (q.people ?? []).some((p) => met.has(p))).length;
}
assert.ok(about <= asked * 0.02, `${about} of ${asked} clues were about people from the game before`);
console.log(`ok   the next five games: ${about} of ${asked} clues about anyone from the first game`);

// Three weeks on, they are back in play; and the history sent to another device drops them.
const later = H.today() + H.PEOPLE_HOLD_BACK_DAYS;
for (const p of met) assert.ok(!H.isPersonHeldBack(p, later));
const shared = Object.values(H.exportHistory()).flat();
assert.ok(shared.some((id) => id.startsWith('p:')), 'people travel with the group history');
console.log('ok   people come back after three weeks, and travel with the group history');

// A phone only has the clue: who it was about arrives with the reveal.
T.resetSeenQuestions();
const sample = clues(first).find((q) => (q.people ?? []).length > 0)!;
T.markCluePeopleSeen(sample);
assert.ok(H.isPersonHeldBack(sample.people![0]));
T.resetSeenQuestions();
assert.ok(!H.isPersonHeldBack(sample.people![0]));
assert.equal(H.lastGameColumns().size, 0, 'reset forgets the last game too');
console.log('ok   a phone remembers who a revealed clue was about; reset clears people and the last game');
T.setDealDate(null);
