// Wrong choices never hand out a free elimination: nothing the clue names, and no Round 1
// for a draft steal. Checked across the whole bank, in 4-choice and 8-choice games.
import {readFileSync} from 'node:fs';
import {buildQuestionOptions, getActiveCategories, loadExternalQuestionBank} from '../triviaData';
import {TEAM_NICKNAMES_FOR_TESTS} from '../triviaEngine';

const bank = JSON.parse(readFileSync(new URL('../public/questions/nfl.json', import.meta.url), 'utf8'));
(globalThis as any).fetch = async () => ({ok: true, json: async () => bank});

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
await loadExternalQuestionBank();
let checked = 0;
const bad: string[] = [];
for (const cat of getActiveCategories()) {
  for (const q of cat.clues) {
    const clue = words(q.clue);
    for (const mode of ['STANDARD', 'HARD'] as const) {
      for (const opt of buildQuestionOptions(q, mode)) {
        if (opt === q.correctAnswer) continue;
        checked++;
        const nick = TEAM_NICKNAMES_FOR_TESTS.find((n) => opt.endsWith(` ${n}`));
        const named = (opt.length > 3 && clue.includes(words(opt))) || (nick && clue.includes(words(nick)));
        const round1 = /lasted until this round/i.test(q.clue) && opt === 'Round 1';
        if (named || round1) bad.push(`${q.clue} -> offers ${opt}`);
      }
    }
  }
}
if (bad.length) {
  console.log(`FAIL ${bad.length} wrong choices are named in the clue or impossible, e.g.:\n  ${bad.slice(0, 5).join('\n  ')}`);
  process.exit(1);
}
console.log(`ok   ${checked} wrong choices checked: none named in the clue, no Round 1 draft steals`);
