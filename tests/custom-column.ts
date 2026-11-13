// Your own column from a Google Sheet: links, CSV, and the column landing on the Round 1 board.
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
const sheet = [
  'Clue,Answer,Wrong 1,Wrong 2,Wrong 3,Level',
  '"Our host\'s favorite team, ""America\'s Team""",Dallas Cowboys,New York Giants,Philadelphia Eagles,Washington Commanders,1',
  'The co-host was born in this city,Sioux Falls,Rapid City,Pierre,Brookings,2',
  'Our first guest played here,South Dakota State,North Dakota State,Montana,Montana State,3',
  'The podcast started in this year,2021,2019,2020,2022,4',
  '"This QB, our producer\'s idol, wore No. 4",Brett Favre,Dan Marino,John Elway,Joe Montana,5',
  ',,,,,',
].join('\r\n');
(globalThis as any).fetch = async (url: string) =>
  String(url).includes('docs.google.com')
    ? {ok: true, text: async () => sheet}
    : {ok: true, json: async () => bank};

const C = await import('../utils/customColumn');
const T = await import('../triviaData');
const {seededRandom} = await import('../utils/episode');
await T.loadExternalQuestionBank();

// ---- Links -------------------------------------------------------------------
assert.equal(C.sheetCsvUrl('https://docs.google.com/spreadsheets/d/abc_123-XY/edit#gid=42'), 'https://docs.google.com/spreadsheets/d/abc_123-XY/gviz/tq?tqx=out:csv&gid=42');
assert.equal(C.sheetCsvUrl('https://docs.google.com/spreadsheets/d/abc/edit?usp=sharing'), 'https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:csv');
assert.equal(C.sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1v/pubhtml'), 'https://docs.google.com/spreadsheets/d/e/2PACX-1v/pub?output=csv');
assert.equal(C.sheetCsvUrl('https://example.com/sheet.csv'), null);
assert.equal(C.sheetCsvUrl('not a link'), null);
console.log('ok   shared and published Google Sheets links become CSV addresses; other links are refused');

// ---- CSV ---------------------------------------------------------------------
const rows = C.parseCsv(sheet);
assert.equal(rows.length, 6, 'the blank row is dropped');
assert.equal(rows[1][0], `Our host's favorite team, "America's Team"`);
assert.equal(rows[5][1], 'Brett Favre');
const spec = C.columnFromRows(rows, 'Listener Questions');
assert.equal(spec.entries.length, 5);
assert.deepEqual(spec.entries.map((e) => e.difficulty), [1, 2, 3, 4, 5]);
assert.deepEqual(spec.entries[1].distractors, ['Rapid City', 'Pierre', 'Brookings']);
// Without levels, top rows are cheap and bottom rows expensive.
const plain = C.columnFromRows([['clue', 'answer'], ...Array.from({length: 10}, (_, i) => [`Clue ${i}`, `Answer ${i}`])], '');
assert.deepEqual(plain.entries.map((e) => e.difficulty), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
assert.equal(plain.title, 'Our Column');
assert.throws(() => C.columnFromRows([['Question', 'Reply'], ['a', 'b']], ''), /Clue column and an Answer column/);
assert.throws(() => C.columnFromRows([['Clue', 'Answer'], ['a', 'b']], ''), /at least 3 clues/);
console.log('ok   CSV with quotes and commas, levels given or spread top to bottom, and clear errors');

// ---- On the board -----------------------------------------------------------
T.setCustomColumn(await C.loadCustomColumn({url: 'https://docs.google.com/spreadsheets/d/abc/edit', title: 'Listener Questions'}));
for (const length of ['FULL', 'SHORT'] as const) {
  for (let g = 0; g < 5; g++) {
    const s = T.createFullGameSession('MEDIUM', length);
    const col = s.round1Board.find((c) => c.id === C.CUSTOM_COLUMN_ID);
    assert.ok(col, `${length} game ${g + 1}: the custom column is on the Round 1 board`);
    assert.equal(col!.title, 'Listener Questions');
    assert.ok(!s.round2Board.some((c) => c.id === C.CUSTOM_COLUMN_ID));
    assert.equal(s.round1Board.length, length === 'FULL' ? 6 : 5);
    // Tiles go up in level with the money.
    const levels = col!.clues.map((q) => q.difficulty);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  }
}
const sb = T.createFullGameSession('MEDIUM').round1Board.find((c) => c.id === C.CUSTOM_COLUMN_ID)!.clues.find((q) => q.correctAnswer === 'Sioux Falls');
if (sb) {
  assert.ok(T.checkTypedAnswer('sioux falls', sb, 0.75));
  assert.ok(sb.distractors.includes('Rapid City'));
}
console.log('ok   the column is on every Round 1 board (full and short), never Round 2, tiles in level order');

const coded = T.dealWith(seededRandom('CODE-1'), () => T.createFullGameSession('MEDIUM'));
assert.ok(![...coded.round1Board, ...coded.round2Board].some((c) => c.id === C.CUSTOM_COLUMN_ID));
console.log('ok   an episode code leaves the column out, so every device deals the same game');

T.setCustomColumn(null);
assert.ok(!T.createFullGameSession('MEDIUM').round1Board.some((c) => c.id === C.CUSTOM_COLUMN_ID));
console.log('ok   removing the column takes it off the board');
