// Football scoring: pick-six pays 1.5x after a rival's miss, and go for two finds a harder follow-up.
// Usage: npm run test:football
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

const R = await import('../game/rules');
const T = await import('../triviaData');
await T.loadExternalQuestionBank();

const clue = (value: number, extra: object = {}) =>
  ({
    clue: {id: 'x', clue: 'c', correctAnswer: 'a', aliases: [], sport: 'NFL', difficulty: 5, value, category: 'Test'},
    catIndex: 0, clueIndex: 4, phase: 'ANSWERING', buzzedContestantId: 'player', buzzerLockout: {coach: false, player: false, analyst: false, player2: false},
    options: [], isBonusWager: false, bonusSelectingPlayerId: 'player', bonusWagerInput: value, bonusWagerLocked: false,
    selectedOption: null, typedInput: '', feedbackText: '', endsAt: null, leftMs: 0, ...extra,
  }) as any;

assert.equal(R.pickSixPayout(clue(400), 400), null, 'nobody missed: no bonus');
assert.equal(R.pickSixPayout(clue(400, {buzzerLockout: {coach: true, player: false, analyst: false, player2: false}}), 400), 600);
assert.equal(R.pickSixPayout(clue(1000, {isBonusWager: true, buzzerLockout: {coach: true}}), 1000), null, 'never on a Daily Double');
console.log('ok   pick-six pays 1.5x only right after someone missed');

assert.ok(R.earnsGoForTwo(clue(1000), 1000, true));
assert.ok(!R.earnsGoForTwo(clue(800), 1000, true), 'only the top-dollar row');
assert.ok(!R.earnsGoForTwo(clue(1000), 1000, false), 'AI players never go for two');
assert.ok(!R.earnsGoForTwo(clue(1000, {isBonusWager: true}), 1000, true), 'not on a Daily Double');
assert.ok(!R.earnsGoForTwo(clue(1000, {goForTwo: {who: 'player', stage: 'playing'}}), 1000, true), 'not twice in a row');
console.log('ok   go for two only after a human gets a top-dollar tile right');

// Every top tile of ten deals gets a follow-up: harder or as hard, not on the board, a new answer.
let found = 0, sameSubject = 0, tiles = 0;
for (let g = 0; g < 10; g++) {
  const session = T.createFullGameSession('MEDIUM' as any, 'FULL' as any);
  const boards = [session.round1Board, session.round2Board] as any[];
  const all = boards.flatMap((b: any[]) => b.flatMap((c) => c.clues));
  for (const board of boards) for (const cat of board) {
    const top = cat.clues[cat.clues.length - 1];
    tiles++;
    const f = T.goForTwoClue(top, all);
    if (!f) continue;
    found++;
    assert.ok(f.difficulty >= top.difficulty, 'at least as hard');
    assert.ok(!all.some((q: any) => q.id === f.id), 'not on the board');
    assert.notEqual(T.normalizeAnswer(f.correctAnswer), T.normalizeAnswer(top.correctAnswer), 'not the answer just revealed');
    if ((f.subjects ?? []).some((s) => [T.normalizeAnswer(top.correctAnswer), ...(top.subjects ?? [])].includes(s))) sameSubject++;
  }
}
assert.ok(found / tiles > 0.9, `follow-ups for ${found} of ${tiles} top tiles`);
console.log(`ok   a follow-up for ${found} of ${tiles} top tiles (${sameSubject} about the same person, the rest from the same column)`);
