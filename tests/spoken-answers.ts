// Checks that spoken answers map to the right multiple-choice option.
// Usage: npm run test:voice
import { matchSpokenOption } from '../triviaData';

const cases: [string[], string[], string | null][] = [
  [['mahomes'], ['Patrick Mahomes', 'Josh Allen', 'Joe Burrow', 'Lamar Jackson'], 'Patrick Mahomes'],
  [['the chiefs'], ['Kansas City Chiefs', 'Buffalo Bills', 'Detroit Lions', 'Philadelphia Eagles'], 'Kansas City Chiefs'],
  [['round six'], ['Round 6', 'Round 7', 'Round 2', 'Round 5'], 'Round 6'],
  [['sixth round'], ['Round 6', 'Round 7', 'Round 2', 'Round 5'], 'Round 6'],
  [['thirteen'], ['11', '12', '13', '14'], '13'],
  [['twenty nine to thirteen'], ['29-13', '32-13', '29-20', '26-10'], '29-13'],
  [['Saquon Barkley'], ['Saquon Barkley', 'Derrick Henry', 'Josh Jacobs', 'Bijan Robinson'], 'Saquon Barkley'],
  [['new york'], ['New York Jets', 'New York Giants', 'Dallas Cowboys', 'Miami Dolphins'], null],
  [['giants'], ['New York Jets', 'New York Giants', 'Dallas Cowboys', 'Miami Dolphins'], 'New York Giants'],
  [['pizza'], ['Patrick Mahomes', 'Josh Allen', 'Joe Burrow', 'Lamar Jackson'], null],
  [['brock party', 'brock purdy'], ['Brock Purdy', 'Kirk Cousins', 'Sam Darnold', 'Baker Mayfield'], 'Brock Purdy'],
  [['ohio state'], ['Ohio St.', 'Michigan', 'Alabama', 'Georgia'], 'Ohio St.'],
  [['the forty niners'], ['San Francisco 49ers', 'Seattle Seahawks', 'Los Angeles Rams', 'Arizona Cardinals'], 'San Francisco 49ers'],
  [['caesars superdome'], ['Caesars Superdome', 'Acrisure Stadium', 'State Farm Stadium', "Levi's Stadium"], 'Caesars Superdome'],
];

let failed = 0;
for (const [heard, options, want] of cases) {
  const got = matchSpokenOption(heard, options);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} heard "${heard[0]}" -> ${got} (want ${want})`);
}
if (failed) process.exit(1);
