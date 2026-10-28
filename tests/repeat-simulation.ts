// Simulates 40 games on one device and reports how much of each board was already seen.
// Usage: npm run simulate
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
const seen = new Set<string>();
const repeated: number[] = [];
for (let g = 1; g <= 40; g++) {
  const s = T.createFullGameSession('MEDIUM');
  const boards = [...s.round1Board, ...s.round2Board];
  if (boards.some((c) => c.sport !== 'NFL')) throw new Error('Non-NFL category on the board');
  if (s.round1Board.length < 6 || s.round2Board.length < 6) throw new Error(`Game ${g} has fewer than 6 categories in a round`);
  const ids = boards.flatMap((c) => c.clues.map((q) => q.id));
  repeated.push(Math.round((100 * ids.filter((id) => seen.has(id)).length) / ids.length));
  ids.forEach((id) => seen.add(id));
}
console.log(`${T.getTotalAvailableQuestionCount()} NFL questions`);
console.log(`% of each board already seen, games 1-40: ${repeated.join(', ')}`);
