// Sanity checks on the built NFL bank, run before the weekly refresh publishes it,
// so a change in the nflverse data can't quietly put wrong or broken questions live.
import { readFileSync } from 'node:fs';

const bank = JSON.parse(readFileSync(new URL('../public/questions/nfl.json', import.meta.url), 'utf8'));
(globalThis as any).fetch = async () => ({ ok: true, json: async () => bank });
const { loadExternalQuestionBank } = await import('../triviaEngine');
const { getFreshFinalShowdownClue } = await import('../triviaData');
await loadExternalQuestionBank();

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);
const cats: { id: string; title: string; entries: { clue: string; answer: string; aliases?: string[] }[] }[] = bank.categories;
const byId = new Map(cats.map((c) => [c.id, c]));

if (bank.questionCount < 2500) fail(`only ${bank.questionCount} questions`);

for (const c of cats) {
  for (const e of c.entries) {
    // Raw data leaking into clues: "Wyoming; Reedley", "NA", "undefined".
    if (/;|\bNA\b|undefined|NaN/.test(e.clue)) fail(`${c.title}: raw data in clue: ${e.clue}`);
    if (!e.answer.trim()) fail(`${c.title}: empty answer: ${e.clue}`);
  }
}

// A player can't beat or lose to his own team ("this Rams quarterback ... in a 49-37 loss to the Rams"):
// that means a moved team's old home game was read as a road game.
for (const c of cats) {
  for (const e of c.entries) {
    const m = e.clue.match(/[Tt]his ([A-Z0-9][\w]+) [a-z ]+? .*?(?:win over|loss to|tie with|beat|against) the ([A-Z0-9][\w]+)/);
    if (m && m[1] === m[2]) fail(`${c.title}: a team playing itself: ${e.clue}`);
  }
}

// The live season column keeps a question's id while its answer is unchanged, so no id carries a week number.
// (Checked by shape: at most a few win-total questions, which are guessing games.)
const numberAnswers = (byId.get('nfl_records')?.entries ?? []).filter((e) => /^\d+$/.test(e.answer)).length;
if (numberAnswers > 25) fail(`Feast or Famine has ${numberAnswers} win-total questions`);
const roundAnswers = (byId.get('nfl_draft_steals')?.entries ?? []).filter((e) => /^Round \d+$/.test(e.answer)).length;
if (roundAnswers > 60) fail(`Draft Steals has ${roundAnswers} "which round" questions`);

// One stadium answer per team.
const stadiumOf = new Map<string, string>();
for (const e of byId.get('nfl_stadiums')?.entries ?? []) {
  const m = e.clue.match(/^The (.+) call this stadium home\.$/);
  if (!m) continue;
  if (stadiumOf.has(m[1]) && stadiumOf.get(m[1]) !== e.answer) fail(`${m[1]} has two stadiums: ${stadiumOf.get(m[1])}, ${e.answer}`);
  stadiumOf.set(m[1], e.answer);
}

// A player drafted by a team can't have been "shipped" to it that same spring (that was a draft-pick trade).
const draftedBy = new Map<string, { year: number; team: string }>();
for (const c of cats.filter((c) => c.id.startsWith('nfl_drafted_by'))) {
  for (const e of c.entries) {
    const m = e.clue.match(/^In (\d{4}), this team drafted .* ([A-Z][\w.'\-]+(?: [A-Z][\w.'\-]+)+) (?:with the|first overall)/);
    if (m) draftedBy.set(m[2], { year: +m[1], team: e.answer });
  }
}
for (const e of byId.get('nfl_blockbuster_trades')?.entries ?? []) {
  const m = e.clue.match(/^In (\d{4}), the .+ shipped .+? ((?:[A-Z][\w.'\-]+ ?)+) to this team\.$/);
  if (!m) continue;
  const d = draftedBy.get(m[2].trim());
  if (d && d.team === e.answer && (d.year === +m[1] || d.year === +m[1] + 1)) fail(`draft-pick trade: ${e.clue}`);
}

// Finals come from the big-game categories, never draft rounds, colleges or jersey numbers.
for (let i = 0; i < 300; i++) {
  const f = getFreshFinalShowdownClue(new Set(), new Set());
  if (/^Round \d+$/.test(f.correctAnswer) || /lasted until this round|played his college ball|jersey number|shipped/.test(f.clue)) {
    fail(`poor Final: ${f.clue}`);
    break;
  }
}

if (problems.length) {
  console.error(`question bank: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 25)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`question bank ok: ${bank.questionCount} questions in ${cats.length} categories`);
