// Pick'em carryover: saving picks and paying the right ones once every result is in.
import assert from 'node:assert/strict';

const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => (store[k] = String(v)),
  removeItem: (k: string) => delete store[k],
};
const P = await import('../utils/pickem');
const game = (id: string) => ({id, day: '2026-11-15', label: 'Sunday', away: 'KC', home: 'ATL', awayName: 'Kansas City Chiefs', homeName: 'Atlanta Falcons'});
const games = [game('a'), game('b'), game('c')];
const now = Date.parse('2026-11-14T20:00:00Z');
P.savePicks({week: 'Week 10', savedAt: now, games, picks: {sam: {a: 'ATL', b: 'KC', c: 'ATL'}, jo: {a: 'KC', b: 'KC', c: 'KC'}}});
const saved = P.loadSavedPicks(now)!;
assert.equal(P.pickemPayouts(saved, {a: 'ATL', b: 'KC'}), null, 'waits until every picked game has a result');
const pay = P.pickemPayouts(saved, {a: 'ATL', b: 'KC', c: 'TIE'})!;
assert.deepEqual(pay.map((p) => [p.name, p.right, p.bonus]), [['sam', 2, 2 * P.PICKEM_BONUS], ['jo', 1, P.PICKEM_BONUS]], 'a tie is a miss');
assert.equal(P.loadSavedPicks(now + 22 * 86400000), null, 'picks older than three weeks are dropped');
assert.ok(Object.values(P.aiPicks(games)).every((t) => t === 'KC' || t === 'ATL'));
console.log('ok   pick\'em pays $' + P.PICKEM_BONUS + ' a right pick once all results are in; ties miss; old picks drop');
