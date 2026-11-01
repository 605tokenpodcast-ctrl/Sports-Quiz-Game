// Checks every question in the game: the 8 choices must all be the same kind of answer
// (no player name offered for a "how many" or "what year" question) and never repeat.
import { readFileSync } from 'node:fs';
import { buildQuestionOptions } from '../triviaData';
import { getAllCompiledCategories, normalizeAnswer, answerKind } from '../triviaEngine';

// Load the nflverse bank the same way the game does, without fetch.
const bank = JSON.parse(readFileSync(new URL('../public/questions/nfl.json', import.meta.url), 'utf8'));
(globalThis as any).fetch = async () => ({ ok: true, json: async () => bank });
const { loadExternalQuestionBank } = await import('../triviaEngine');
await loadExternalQuestionBank();

const hasLetters = (s: string) => /[A-Za-z]{2,}/.test(s);
const numericLike = (s: string) => /\d/.test(s) && !hasLetters(s);

let checked = 0;
let fewer = 0;
const problems: string[] = [];
for (const cat of getAllCompiledCategories()) {
  for (const clue of cat.clues) {
    for (let run = 0; run < 3; run++) {
      const opts = buildQuestionOptions(clue, 'HARD');
      checked++;
      if (!opts.includes(clue.correctAnswer)) problems.push(`${cat.title}: answer missing for "${clue.clue}"`);
      if (new Set(opts.map(normalizeAnswer)).size !== opts.length) problems.push(`${cat.title}: repeated option ${opts.join(' / ')}`);
      if (opts.length < 8) fewer++;
      if (opts.length < 4) problems.push(`${cat.title}: only ${opts.length} options for "${clue.clue}"`);
      const wantNumber = numericLike(clue.correctAnswer);
      const odd = opts.filter((o) => numericLike(o) !== wantNumber);
      if (odd.length) problems.push(`${cat.title}: "${clue.correctAnswer}" offered with ${odd.join(', ')}`);
      // A score like 23-16 needs score options; a round like "Round 2" needs round options.
      const shape = (s: string) => s.replace(/\d+/g, '#').replace(/,/g, '');
      if (wantNumber) {
        const odd2 = opts.filter((o) => shape(o) !== shape(clue.correctAnswer) && !/^#$/.test(shape(o)) );
        if (odd2.length && shape(clue.correctAnswer) !== '#') problems.push(`${cat.title}: "${clue.correctAnswer}" offered with ${odd2.join(', ')}`);
      }
      const kind = answerKind(clue.correctAnswer);
      if (kind === 'team' || kind === 'person') {
        const clash = opts.filter((o) => answerKind(o) === (kind === 'team' ? 'person' : 'team'));
        if (clash.length) problems.push(`${cat.title}: "${clue.correctAnswer}" offered with ${clash.join(', ')}`);
      }
      if (/^Round \d+$/.test(clue.correctAnswer) && opts.some((o) => !/^Round \d+$/.test(o))) {
        problems.push(`${cat.title}: "${clue.correctAnswer}" offered with ${opts.join(', ')}`);
      }
    }
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`${unique.length} mismatched option sets:`);
  unique.slice(0, 40).forEach((p) => console.error('  ' + p));
  process.exit(1);
}
console.log(`answer options ok: ${checked} option sets checked, ${fewer} show fewer than 8 choices`);
