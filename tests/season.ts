// Checks the podcast season standings. Usage: npm run test:season
import assert from 'node:assert/strict';
import {getSeason, recordSeasonGame, resetSeason} from '../utils/season';

const data: Record<string, string> = {};
const store = {getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k]};

recordSeasonGame([{name: 'Ann', score: 12000, won: true, finalCorrect: true}, {name: 'Bo', score: 8000, won: false, finalCorrect: false}], store);
recordSeasonGame([{name: 'ann ', score: 3000, won: false}, {name: 'Bo', score: 9000, won: true, finalCorrect: true}, {name: 'Cy', score: 9000, won: true}], store);
const rows = recordSeasonGame([], store);
assert.deepEqual(rows.map((r) => r.name), ['Bo', 'Ann', 'Cy'], 'most wins first, then money');
const ann2 = rows.find((r) => r.name === 'Ann')!;
assert.equal(ann2.games, 2, 'names match ignoring case and spaces');
assert.equal(ann2.money, 15000);
assert.equal(ann2.bestScore, 12000);
assert.equal(ann2.finalsPlayed, 1, 'sitting out the Final is not a Final played');
assert.equal(rows.find((r) => r.name === 'Cy')!.wins, 1, 'a tie for the top score is a win for both');
resetSeason(store);
assert.equal(getSeason(store).length, 0);
console.log('ok   season standings: wins then money, names merged, ties win, reset clears');
