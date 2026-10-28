// Simulates 60 games and reports when questions first repeat.
// Usage: npx tsx tests/repeat-simulation.ts public/questions/nfl.json ../triviaData.ts
import { readFileSync } from 'node:fs';
const store: Record<string, string> = {};
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] };
(globalThis as any).fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(process.argv[2], 'utf8')) });
const T = await import(process.argv[3]);
await T.loadExternalQuestionBank();
for (const scope of ['ALL', 'NFL'] as const) {
  T.resetSeenQuestions();
  T.setQuestionScope(scope);
  const seen = new Set<string>();
  let firstRepeat = 0, games = 0, short = 0;
  const total = T.getTotalAvailableQuestionCount();
  for (games = 1; games <= 60; games++) {
    const s = T.createFullGameSession('MEDIUM');
    const ids = [...s.round1Board, ...s.round2Board].flatMap((c: any) => c.clues.map((q: any) => q.id)).concat(s.finalClue.id);
    if (s.round1Board.length < 6 || s.round2Board.length < 6) short++;
    const sports = new Set([...s.round1Board, ...s.round2Board].map((c: any) => c.sport));
    if (scope === 'NFL' && [...sports].some((x) => x !== 'NFL')) throw new Error('non-NFL category in NFL mode');
    if (!firstRepeat && ids.some((id: string) => seen.has(id))) firstRepeat = games;
    ids.forEach((id: string) => seen.add(id));
  }
  console.log(`${scope}: ${total} questions; first repeated question in game #${firstRepeat || 'none within 60'}; boards short of 6 categories: ${short}`);
}
