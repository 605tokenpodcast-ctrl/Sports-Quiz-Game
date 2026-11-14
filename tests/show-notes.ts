// Show notes: the stumper of the game, the stumper of the week and the Markdown.
import assert from 'node:assert/strict';

const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => (store[k] = String(v)),
  removeItem: (k: string) => delete store[k],
};
const N = await import('../utils/showNotes');

const clue = (id: string, value: number, right: string[], wrong: string[], round: 'ROUND_1' | 'ROUND_2' | 'FINAL' = 'ROUND_1') => ({
  id, round, category: 'QB Club', value, clue: `Clue ${id}`, answer: `Answer ${id}`, right, wrong,
});
const log = [clue('a', 400, ['Sam'], []), clue('b', 800, [], []), clue('c', 800, [], ['Sam', 'Jo']), clue('d', 2000, [], [], 'FINAL'), clue('e', 1200, ['Jo'], ['Sam'], 'ROUND_2')];
assert.equal(N.stumperOf(log)?.id, 'c', 'priciest missed clue, one somebody tried wins the tie, the Final never counts');
assert.equal(N.stumperOf([clue('a', 400, ['Sam'], [])]), null);
console.log('ok   stumper of the game');

const day = Date.parse('2026-11-14T20:00:00Z');
N.rememberStumper(clue('old', 2000, [], []), day - 8 * 86400000);
N.rememberStumper(clue('x', 1000, [], ['Jo']), day - 2 * 86400000);
N.rememberStumper(N.stumperOf(log), day);
assert.equal(N.stumperOfTheWeek(day)?.id, 'x', 'a stumper older than a week drops off');
console.log('ok   stumper of the week, last 7 days only');

const md = N.showNotesMarkdown({date: new Date(day), mode: 'Full Game', standings: [{name: 'Jo', score: 1200}, {name: 'Sam', score: -400}], log, weekStumper: N.stumperOfTheWeek(day), episodeCode: 'ABC123'});
for (const bit of ['# Sports Arena Showdown', 'Episode code ABC123', '1. **Jo** $1,200', '2. **Sam** -$400', '## Stumper of the game', '> Clue c', '## Stumper of the week', '> Clue x', '## Round 1', '## Round 2', '## Final Showdown', 'nobody buzzed', '✓ Jo · ✗ Sam'])
  assert.ok(md.includes(bit), bit);
console.log('ok   Markdown has scores, stumpers and every clue by round');
