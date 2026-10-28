// Checks which typed answers count as correct, using real questions from the NFL bank.
// Usage: npm run test:typed
import { readFileSync } from 'node:fs';
import { checkTypedAnswer, getActiveCategories, loadExternalQuestionBank, QuestionClue } from '../triviaData';

const bank = JSON.parse(readFileSync(new URL('../public/questions/nfl.json', import.meta.url), 'utf8'));
(globalThis as any).fetch = async () => ({ ok: true, json: async () => bank });

const clues = new Map<string, QuestionClue>();
const findClue = (answer: string) => {
  const clue = clues.get(answer);
  if (!clue) throw new Error(`No question with answer "${answer}" in the bank`);
  return clue;
};

const cases: [string, string, boolean][] = [
  // [correct answer, what the player typed, should it count?]
  ['Round 2', 'Round 2', true],
  ['Round 2', 'round two', true],
  ['Round 2', '2nd', true],
  ['Round 2', 'Round 3', false],
  ['Round 2', 'round', false],
  ['Round 2', '12', false],
  ['23-16', '23-16', true],
  ['23-16', '23 16', true],
  ['23-16', '23-17', false],
  ['San Francisco 49ers', '49ers', true],
  ['San Francisco 49ers', 'niners', true],
  ['Ohio St.', 'Ohio State', true],
  ['Ohio St.', 'Michigan St.', false],
  ['Ohio St.', 'st', false],
  ['Kansas City Chiefs', 'chiefs', true],
  ['Kansas City Chiefs', 'the chiefs', true],
  ['Kansas City Chiefs', 'KC Chiefs', true],
  ['Kansas City Chiefs', 'kansas city cheifs', true],
  ['Malcolm Smith', 'Malcolm Smith', true],
  ['Malcolm Smith', 'smith', true],
  ['Malcolm Smith', 'Emmitt Smith', false],
  ['Peyton Manning', 'Eli Manning', false],
  ['Peyton Manning', 'peyton maning', true],
  ['Peyton Manning', 'manning', true],
];

async function main() {
  await loadExternalQuestionBank();
  for (const cat of getActiveCategories()) for (const q of cat.clues) if (!clues.has(q.correctAnswer)) clues.set(q.correctAnswer, q);

  let failed = 0;
  for (const [answer, typed, want] of cases) {
    const got = checkTypedAnswer(typed, findClue(answer), 0.75);
    if (got !== want) failed++;
    console.log(`${got === want ? 'ok  ' : 'FAIL'} "${typed}" for ${answer} -> ${got ? 'correct' : 'wrong'}`);
  }
  if (failed) process.exit(1);
}

main();
