// Checks that full and short games deal the right board shapes and tile values.
// Usage: npm run test:length
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store: Record<string, string> = {};
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => (store[k] = v),
  removeItem: (k: string) => delete store[k],
};
(globalThis as any).fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync('public/questions/nfl.json', 'utf8')) });

const T = await import('../triviaData');
await T.loadExternalQuestionBank();

const expected: Record<'FULL' | 'SHORT', { cats: number; r1: number[]; r2: number[] }> = {
  FULL: { cats: 6, r1: [200, 400, 600, 800, 1000], r2: [400, 800, 1200, 1600, 2000] },
  SHORT: { cats: 5, r1: [500, 1000, 1500], r2: [1000, 2000, 3000] },
};

const season = T.getActiveCategories().find((c) => c.id === T.CURRENT_CATEGORY_IDS.ROUND_2);
const seasonAnswers = new Set(season?.clues.map((q) => T.normalizeAnswer(q.correctAnswer))).size;

for (const length of ['FULL', 'SHORT'] as const) {
  for (let g = 0; g < 20; g++) {
    const s = T.createFullGameSession('MEDIUM', length);
    const want = expected[length];
    assert.equal(s.round1Board.length, want.cats, `${length} round 1 categories`);
    assert.equal(s.round2Board.length, want.cats, `${length} round 2 categories`);
    for (const cat of s.round1Board) assert.deepEqual(cat.clues.map((c) => c.value), want.r1);
    for (const cat of s.round2Board) assert.deepEqual(cat.clues.map((c) => c.value), want.r2);
    const ids = [...s.round1Board, ...s.round2Board].flatMap((c) => c.clues.map((q) => q.id));
    assert.equal(new Set(ids).size, ids.length, 'no question repeats in a game');
    assert.ok(s.round1Board.some((c) => c.id === T.CURRENT_CATEGORY_IDS.ROUND_1), `${length} round 1 has This Week in the NFL`);
    // Early in a season there may not be enough season-so-far questions for a column yet.
    if (seasonAnswers >= want.r2.length) {
      assert.ok(s.round2Board.some((c) => c.id === T.CURRENT_CATEGORY_IDS.ROUND_2), `${length} round 2 has the season so far`);
    }
  }
  const { cats, r1, r2 } = expected[length];
  const pot = cats * (r1.reduce((a, b) => a + b) + r2.reduce((a, b) => a + b));
  console.log(`ok   ${length.toLowerCase()} game: ${cats} categories x ${r1.length} clues, $${pot.toLocaleString()} on the boards, current columns every time`);
}
