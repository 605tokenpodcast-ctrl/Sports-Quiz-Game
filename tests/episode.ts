// An episode code deals the exact same boards (columns, clues, Final) on any device, whatever
// that device has already seen, and a different code deals a different game.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFullGameSession, dealWith, loadExternalQuestionBank, markQuestionsSeen, getActiveCategories} from '../triviaData';
import {episodeLength, newEpisodeCode, normalizeEpisodeCode, seededRandom} from '../utils/episode';

const bank = JSON.parse(readFileSync(new URL('../public/questions/nfl.json', import.meta.url), 'utf8'));
(globalThis as any).fetch = async () => ({ok: true, json: async () => bank});
await loadExternalQuestionBank();

const deal = (code: string) => {
  const s = dealWith(seededRandom(code), () => createFullGameSession('MEDIUM', episodeLength(code)));
  return JSON.stringify([s.round1Board, s.round2Board].map((b) => b.map((c) => [c.id, c.clues.map((q) => q.id)])).concat([[s.finalClue.id]]));
};

const first = deal('F-7KQ2');
// A device that has seen half the bank still gets the same game.
markQuestionsSeen(getActiveCategories().flatMap((c) => c.clues.filter((_, i) => i % 2 === 0).map((q) => q.id)));
assert.equal(deal('F-7KQ2'), first);
console.log('ok   the same code deals the same boards and Final, whatever this device has seen');
assert.notEqual(deal('F-9ZZ3'), first);
console.log('ok   another code deals another game');
assert.equal(JSON.parse(deal('S-7KQ2'))[0][0][1].length, 3);
console.log('ok   an S code deals a short game');
assert.equal(normalizeEpisodeCode(' f 7kq2 '), 'F-7KQ2');
assert.equal(normalizeEpisodeCode('hello'), '');
assert.match(newEpisodeCode('SHORT'), /^S-[A-Z2-9]{4}$/);
console.log('ok   codes are tidied as typed, and new codes carry the game length');
