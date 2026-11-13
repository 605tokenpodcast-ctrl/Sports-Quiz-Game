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
  ['Round 4', 'Round 4', true],
  ['Round 4', 'round four', true],
  ['Round 4', '4th', true],
  ['Round 4', 'Round 3', false],
  ['Round 4', 'round', false],
  ['Round 4', '14', false],
  ['23-16', '23-16', true],
  ['23-16', '23 16', true],
  ['23-16', '23-17', false],
  ['San Francisco 49ers', '49ers', true],
  ['San Francisco 49ers', 'niners', true],
  ['Ohio State', 'Ohio State', true],
  ['Ohio State', 'Ohio St.', true],
  ['Ohio State', 'Michigan St.', false],
  ['Ohio State', 'st', false],
  // Schools go by other names, and the last word of a school is a different school.
  ['Boston College', 'boston college', true],
  ['Boston College', 'boston col.', true],
  ['Boston College', 'col', false],
  ['Mississippi', 'ole miss', true],
  ['North Carolina State', 'nc state', true],
  ['North Carolina State', 'north carolina', false],
  ['Central Florida', 'ucf', true],
  ['Central Florida', 'florida', false],
  ['West Virginia', 'virginia', false],
  ['Pittsburgh', 'pitt', true],
  ['USC', 'southern cal', true],
  ['LSU', 'louisiana state', true],
  ['Miami of Ohio', 'miami ohio', true],
  ['Acrisure Stadium', 'stadium', false],
  ['Acrisure Stadium', 'acrisure', true],
  // A city with two teams doesn't name one.
  ['New York Giants', 'new york', false],
  ['New York Giants', 'giants', true],
  ['Los Angeles Rams', 'los angeles', false],
  ['Pittsburgh Steelers', 'pittsburgh', true],
  ['Kansas City Chiefs', 'chiefs', true],
  ['Kansas City Chiefs', 'the chiefs', true],
  ['Kansas City Chiefs', 'KC Chiefs', true],
  ['Kansas City Chiefs', 'kansas city cheifs', true],
  ['Bruce Smith', 'Bruce Smith', true],
  ['Bruce Smith', 'smith', true],
  ['Bruce Smith', 'Emmitt Smith', false],
  ['Peyton Manning', 'Eli Manning', false],
  ['Peyton Manning', 'peyton maning', true],
  ['Peyton Manning', 'manning', true],
  // Short and long first names are the same person.
  ['Patrick Mahomes', 'Pat Mahomes', true],
  ['Patrick Mahomes', 'Peyton Mahomes', false],
  ['Matthew Stafford', 'matt stafford', true],
  ['Tom Brady', 'Thomas Brady', true],
  // A team that moved counts under any of its names, but not another team's.
  ['Oakland Raiders', 'Las Vegas Raiders', true],
  ['Las Vegas Raiders', 'oakland raiders', true],
  ['St. Louis Rams', 'Los Angeles Rams', true],
  ['San Diego Chargers', 'LA Chargers', true],
  ['San Diego Chargers', 'Los Angeles Rams', false],
  ['Washington Redskins', 'Commanders', true],
  ['Washington Redskins', 'Washington Commanders', true],
  ['Oakland Raiders', 'Oakland Athletics', false],
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
