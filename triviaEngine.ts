/**
 * Sports Arena Quiz question engine (NFL only).
 *
 * Questions come from the hand-written bank in triviaDatasetPart.ts plus banks
 * loaded at runtime (public/questions/nfl.json, built weekly from nflverse data).
 *
 * Within one game no question, category or answer repeats, and questions this
 * device has already seen are used last.
 */

export type SportTag = 'NFL';

export interface QuestionClue {
  id: string;
  category: string;
  value: number;
  clue: string;
  correctAnswer: string;
  distractors: string[];
  aliases: string[];
  sport: SportTag;
  difficulty: number; // 1 to 5
  isBonusWager?: boolean;
  /** The id of the category it came from (nfl_super_bowl ...). */
  categoryId?: string;
  /**
   * Everyone this clue is about, normalized: the answer when it's a person, plus any player
   * named in the clue. A game never asks two clues about the same person, so one clue can't
   * give away another's answer.
   */
  subjects?: string[];
  /** Who Am I?: the clue as hints, hardest first, shown one at a time as the tile's value drops. */
  hints?: string[];
}

export interface TriviaCategory {
  id: string;
  title: string;
  /** One line on what the column is about, read out when the round's categories are revealed. */
  description?: string;
  sport: SportTag;
  clues: QuestionClue[];
}

export interface RawClueData {
  clue: string;
  answer: string;
  distractors: string[];
  aliases?: string[];
  difficulty: number; // 1 (easiest) to 5 (hardest)
}

// ===========================================================================
// STRING NORMALIZATION & SANITIZATION HELPER
// ===========================================================================

/**
 * Strips all parenthetical expressions (e.g. "(18,355 yds)", "(7 rings)", "(1998)", "(109 goals)")
 * and normalizes whitespace so no answer choice or distractor ever contains giveaway parentheticals.
 */
export function sanitizeAnswerChoice(str: string): string {
  if (!str) return '';
  return str
    .replace(/\s*\([^)]*\)/g, '') // remove anything in parentheses
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tidies a clue's spacing and punctuation. Parentheses stay: the question builder writes hints
 * in them on purpose ("a first-round pick (11th overall)").
 */
export function sanitizeQuestionClue(str: string): string {
  if (!str) return '';
  return str
    .replace(/\s+,/g, ',') // clean up space before comma
    .replace(/\s+\./g, '.') // clean up space before period
    .replace(/\s+\?/g, '?') // clean up space before question mark
    .replace(/,\s*,/g, ',') // clean up duplicate commas
    .replace(/\s+/g, ' ') // normalize whitespace
    .trim();
}

/**
 * The last word of a person's name ("Mahomes"), skipping endings like "Jr." that would match anything.
 * Only for people: the last word of a school or stadium ("Florida" in Central Florida, "Stadium")
 * names something else.
 */
function lastNameAlias(answer: string): string {
  if (answerKind(answer) !== 'person') return '';
  const words = answer.toLowerCase().trim().split(/\s+/);
  const last = words[words.length - 1] || '';
  if (words.length < 2 || /^(jr|sr|ii|iii|iv|v|st)\.?$/.test(last) || /^\d+$/.test(last)) return '';
  return last;
}

export function normalizeAnswer(str: string): string {
  if (!str) return '';
  const sanitized = sanitizeAnswerChoice(str);
  return sanitized
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// ===========================================================================
// PEER BANKS FOR 8-CHOICE DISTRACTOR GENERATION (7 DISTRACTORS PER QUESTION)
// ===========================================================================

export const PEER_BANKS = {
  nfl_qb: [
    'Tom Brady', 'Patrick Mahomes', 'Aaron Rodgers', 'Drew Brees', 'Peyton Manning',
    'Joe Montana', 'Dan Marino', 'John Elway', 'Brett Favre', 'Steve Young',
    'Kurt Warner', 'Jim Kelly', 'Warren Moon', 'Troy Aikman', 'Dan Fouts',
    'Johnny Unitas', 'Bart Starr', 'Fran Tarkenton', 'Roger Staubach', 'Ken Stabler',
    'Terry Bradshaw', 'Joe Namath', 'Russell Wilson', 'Josh Allen', 'Lamar Jackson',
    'Joe Burrow', 'Jalen Hurts', 'Justin Herbert', 'Eli Manning', 'Ben Roethlisberger',
  ],
  nfl_rb: [
    'Emmitt Smith', 'Barry Sanders', 'Walter Payton', 'LaDainian Tomlinson', 'Terrell Davis',
    'Eric Dickerson', 'Marshall Faulk', 'Adrian Peterson', 'Derrick Henry', 'Christian McCaffrey',
    'Curtis Martin', 'Jerome Bettis', 'Edgerrin James', 'Thurman Thomas', 'Franco Harris',
    'Earl Campbell', 'Tony Dorsett', 'Jim Brown', 'Marcus Allen', 'Shaun Alexander',
    'O.J. Simpson', 'Ricky Williams', 'Priest Holmes', 'Marshawn Lynch', 'Roger Craig',
  ],
  nfl_wr_te: [
    'Jerry Rice', 'Randy Moss', 'Terrell Owens', 'Larry Fitzgerald', 'Calvin Johnson',
    'Marvin Harrison', 'Cris Carter', 'Steve Largent', 'Tyreek Hill', 'Justin Jefferson',
    'Davante Adams', 'DeAndre Hopkins', 'Travis Kelce', 'Rob Gronkowski', 'Tony Gonzalez',
    'Shannon Sharpe', 'Antonio Gates', 'Hines Ward', 'Santonio Holmes', 'Stefon Diggs',
    'Michael Irvin', 'Isaac Bruce', 'Torry Holt', 'Art Monk', 'Andre Reed',
  ],
  nfl_defense: [
    'Ray Lewis', 'Lawrence Taylor', 'Reggie White', 'Bruce Smith', 'Deion Sanders',
    'Rod Woodson', 'Ed Reed', 'Troy Polamalu', 'Aaron Donald', 'J.J. Watt',
    'Michael Strahan', 'Von Miller', 'Richard Sherman', 'Earl Thomas', 'Kam Chancellor',
    'Mean Joe Greene', 'Ronnie Lott', 'Derrick Brooks', 'Warren Sapp', 'Malcolm Smith',
    'Richard Dent', 'Paul Krause', 'Bobby Wagner', 'T.J. Watt', 'Champ Bailey',
  ],
  nfl_teams: [
    'Kansas City Chiefs', 'San Francisco 49ers', 'New England Patriots', 'Dallas Cowboys',
    'Green Bay Packers', 'Pittsburgh Steelers', 'Philadelphia Eagles', 'Baltimore Ravens',
    'Miami Dolphins', 'Buffalo Bills', 'Denver Broncos', 'Seattle Seahawks',
    'Chicago Bears', 'Las Vegas Raiders', 'Los Angeles Rams', 'Tampa Bay Buccaneers',
    'Minnesota Vikings', 'New Orleans Saints', 'Indianapolis Colts', 'Detroit Lions',
  ],
  nfl_coaches: [
    'Bill Belichick', 'Vince Lombardi', 'Don Shula', 'Tom Landry', 'Chuck Noll',
    'Andy Reid', 'Bill Walsh', 'Mike Tomlin', 'Sean McVay', 'John Madden',
    'Jimmy Johnson', 'Tony Dungy', 'Mike Ditka', 'Pete Carroll', 'Sean Payton',
  ],
};

// ===========================================================================
// DYNAMIC CONTEXTUAL DISTRACTOR GENERATOR FOR 8-CHOICE & 4-CHOICE FORMATS
// ===========================================================================

export type AnswerKind = 'number' | 'year' | 'score' | 'team' | 'person' | 'other';

const TEAM_NICKNAMES = [
  'Cardinals', 'Falcons', 'Ravens', 'Bills', 'Panthers', 'Bears', 'Bengals', 'Browns', 'Cowboys',
  'Broncos', 'Lions', 'Packers', 'Texans', 'Colts', 'Jaguars', 'Chiefs', 'Raiders', 'Chargers',
  'Rams', 'Dolphins', 'Vikings', 'Patriots', 'Saints', 'Giants', 'Jets', 'Eagles', 'Steelers',
  '49ers', 'Seahawks', 'Buccaneers', 'Titans', 'Commanders', 'Redskins', 'Oilers', 'Football Team',
];
export const TEAM_NICKNAMES_FOR_TESTS: readonly string[] = TEAM_NICKNAMES;
const PLACE_WORDS = /\b(stadium|field|park|dome|bowl|coliseum|center|centre|arena|superdome|college|university|state|tech|a&m|round|pick|overall|yards?|points?|wins?|losses?|games?)\b/i;

/**
 * What kind of thing an answer is, so wrong options can be the same kind:
 * numbers with numbers, years with years, scores with scores, teams with teams, people with people.
 */
export function answerKind(answer: string): AnswerKind {
  const a = sanitizeAnswerChoice(answer);
  if (/^(19|20)\d\d$/.test(a)) return 'year';
  if (/^\d[\d,]*$/.test(a)) return 'number';
  if (/^\d{1,2}\s*[-\u2013]\s*\d{1,2}$/.test(a)) return 'score';
  if (TEAM_NICKNAMES.some((n) => a === n || a.endsWith(` ${n}`))) return 'team';
  if (!/\d/.test(a) && !PLACE_WORDS.test(a) && /^[A-Z][A-Za-z.'\-]*( [A-Z][A-Za-z.'\-]*){1,3}$/.test(a)) return 'person';
  return 'other';
}

const NUMERIC_KINDS: AnswerKind[] = ['number', 'year', 'score'];

/** True when offering `b` as a wrong answer to an `a` answer would look out of place. */
function kindsClash(a: AnswerKind, b: AnswerKind): boolean {
  if (a === b) return false;
  if ((a === 'number' && b === 'year') || (a === 'year' && b === 'number')) return false;
  if (NUMERIC_KINDS.includes(a) || NUMERIC_KINDS.includes(b)) return true;
  return (a === 'team' && b === 'person') || (a === 'person' && b === 'team');
}

/** Same-kind number fillers close to the answer ("13" gives 12, 14, 11, 15 ...). */
function nearbyNumbers(answer: string, kind: 'number' | 'year', taken: Set<string>, want: number): string[] {
  const n = parseInt(answer.replace(/,/g, ''), 10);
  if (isNaN(n)) return [];
  const big = n >= 1000 && kind === 'number';
  const step = big ? Math.max(1, Math.round(n * 0.04)) : 1;
  const out: string[] = [];
  for (let k = 1; out.length < want && k < 60; k++) {
    for (const v of [n + k * step, n - k * step]) {
      if (v < 0 || out.length >= want) continue;
      if (kind === 'year' && v > new Date().getFullYear()) continue;
      const str = big ? v.toLocaleString('en-US') : String(v);
      const norm = normalizeAnswer(str);
      if (taken.has(norm)) continue;
      taken.add(norm);
      out.push(str);
    }
  }
  return out;
}

/** Same-kind score fillers close to the answer ("23-16" gives 24-16, 23-17 ...), winner's score stays higher. */
function nearbyScores(answer: string, taken: Set<string>, want: number): string[] {
  const m = answer.match(/^(\d+)\s*[-\u2013]\s*(\d+)$/);
  if (!m) return [];
  const [w, l] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  const out: string[] = [];
  const deltas = [3, -3, 7, -7, 4, -4, 6, -6, 10, -10, 1, -1, 2, -2];
  for (const dw of deltas) {
    for (const dl of [0, ...deltas]) {
      if (out.length >= want) return out;
      const a = w + dw;
      const b = l + dl;
      if (b < 0 || a <= b) continue;
      const str = `${a}-${b}`;
      const norm = normalizeAnswer(str);
      if (taken.has(norm)) continue;
      taken.add(norm);
      out.push(str);
    }
  }
  return out;
}

const PERSON_BANKS = [PEER_BANKS.nfl_qb, PEER_BANKS.nfl_rb, PEER_BANKS.nfl_wr_te, PEER_BANKS.nfl_defense, PEER_BANKS.nfl_coaches];

/**
 * Returns the question's wrong answers, padded up to 7 when it has fewer.
 * Padding is always the same kind as the answer. When no same-kind filler makes sense
 * (a draft round, a stadium) the question simply shows fewer options.
 */
export function generateSmartDistractors(
  correctAnswer: string,
  sport: SportTag,
  category: string,
  existingDistractors: string[] = [],
  clueText = ''
): string[] {
  const cleanCorrect = sanitizeAnswerChoice(correctAnswer);
  const target = normalizeAnswer(cleanCorrect);
  const kind = answerKind(cleanCorrect);
  const curated: string[] = [];
  const taken = new Set<string>([target]);
  // Anything the clue names is a free elimination ("beat the Tennessee Titans" offering the Titans).
  const shown = ` ${clueText.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const namedInClue = (d: string) => {
    const words = d.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (words.length > 3 && shown.includes(` ${words} `)) return true;
    // A team the clue calls by its nickname ("beating the Eagles").
    const nick = TEAM_NICKNAMES.find((n) => d.endsWith(` ${n}`));
    return Boolean(nick && shown.includes(` ${nick.toLowerCase()} `));
  };
  // A draft steal "lasted until" a later round, so Round 1 can't be the answer.
  const impossible = (d: string) => /lasted until this round/i.test(clueText) && /^Round 1$/.test(d);
  for (const d of existingDistractors) {
    const cleanD = sanitizeAnswerChoice(d);
    if (cleanD && (namedInClue(cleanD) || impossible(cleanD))) taken.add(normalizeAnswer(cleanD));
  }

  existingDistractors.forEach((d) => {
    const cleanD = sanitizeAnswerChoice(d);
    const norm = normalizeAnswer(cleanD);
    if (!cleanD || taken.has(norm)) return;
    // Drop a wrong answer of a different kind (a name offered for a "how many" question).
    if (kindsClash(kind, answerKind(cleanD))) return;
    taken.add(norm);
    curated.push(cleanD);
  });

  const missing = 7 - curated.length;
  if (missing <= 0) return curated;

  if (kind === 'number' || kind === 'year') return [...curated, ...nearbyNumbers(cleanCorrect, kind, taken, missing)];
  if (kind === 'score') return [...curated, ...nearbyScores(cleanCorrect, taken, missing)];

  let pool: string[] = [];
  if (kind === 'team') {
    pool = PEER_BANKS.nfl_teams;
  } else if (kind === 'person') {
    // Prefer the bank the answer or its wrong answers come from (tight ends with tight ends).
    const known = new Set([target, ...curated.map(normalizeAnswer)]);
    const ranked = PERSON_BANKS.map((bank) => ({
      bank,
      hits: bank.filter((p) => known.has(normalizeAnswer(p))).length,
    })).sort((a, b) => b.hits - a.hits);
    pool = ranked[0].hits > 0 ? ranked[0].bank : PERSON_BANKS.slice(0, 4).flat();
  }

  const out = [...curated];
  for (const peer of fisherYatesShuffle(pool)) {
    if (out.length >= 7) break;
    const norm = normalizeAnswer(peer);
    if (taken.has(norm) || namedInClue(peer)) continue;
    taken.add(norm);
    out.push(peer);
  }
  return out;
}

// ===========================================================================
// CATEGORY DEFINITIONS & BUILDER ENGINE (100+ UNIQUE QUESTIONS PER CATEGORY)
// ===========================================================================

export interface CategorySpec {
  id: string;
  title: string;
  sport: SportTag;
  description: string;
  entries: {
    id?: string;
    clue: string;
    answer: string;
    distractors: string[];
    aliases?: string[];
    difficulty: number;
    hints?: string[];
  }[];
}

import { collegeName, collegeAliases } from './colleges';

// Import builder helper that creates deep 100+ cohorts per category
import { BUILT_IN_NFL_SPECS } from './triviaBankData';

// ===========================================================================
// RUNTIME QUESTION BANKS (THE GAME IS NFL ONLY)
// ===========================================================================

// Categories loaded at runtime, such as the NFL bank built from nflverse data
// by scripts/build-nfl-questions.ts and refreshed every week.
const EXTERNAL_SPECS: CategorySpec[] = [];
let COMPILED_CACHE: TriviaCategory[] | null = null;

export interface ExternalBankInfo {
  questionCount: number;
  dataThrough: string;
}

/**
 * Loads a question bank JSON file and adds its categories to the pool, trying a few times
 * on a flaky connection. Resolves null if it never loads (the game can't deal a full board
 * from the built-in questions alone, so the start menu waits for this).
 */
export async function loadExternalQuestionBank(url = 'questions/nfl.json', attempts = 3): Promise<ExternalBankInfo | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const bank = await res.json();
        const known = new Set(EXTERNAL_SPECS.map((c) => c.id));
        for (const c of bank.categories as CategorySpec[]) {
          if (!known.has(c.id)) EXTERNAL_SPECS.push(c);
        }
        COMPILED_CACHE = null;
        return { questionCount: bank.questionCount, dataThrough: bank.dataThrough };
      }
    } catch (e) {}
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  return null;
}

/** Categories in play. The game is NFL only, so other sports in the old bank are skipped. */
export function getActiveCategories(): TriviaCategory[] {
  return getAllCompiledCategories().filter((c) => c.sport === 'NFL');
}

/**
 * Validates and compiles all categories, guaranteeing:
 * 1. Every single category contains at least 100 unique questions.
 * 2. Every question has a unique non-spoiling clue text and distinct correct answer.
 * 3. 8 options supported (1 correct + 7 smart distractors).
 */
export function getAllCompiledCategories(): TriviaCategory[] {
  if (COMPILED_CACHE) return COMPILED_CACHE;
  const result: TriviaCategory[] = [];

  for (const spec of [...BUILT_IN_NFL_SPECS, ...EXTERNAL_SPECS]) {
    const clues: QuestionClue[] = [];

    // College answers are shown the way a host says them ("Boston College", "Miami of Ohio"),
    // even in a bank built before the builder did that itself.
    const isCollege = spec.id.startsWith('nfl_colleges_');
    spec.entries.forEach((raw, idx) => {
      const cleanAnswer = sanitizeAnswerChoice(isCollege ? collegeName(raw.answer) : raw.answer);
      const ansNorm = normalizeAnswer(cleanAnswer);
      if (!ansNorm) return;

      const signature = `${spec.id}__${idx}__${cleanAnswer}__${raw.difficulty}`;
      const id = raw.id || `q_${createDeterministicHash(signature)}`;
      const distractors = generateSmartDistractors(cleanAnswer, spec.sport, spec.title, isCollege ? raw.distractors.map(collegeName) : raw.distractors, raw.clue);

      clues.push({
        id,
        category: spec.title.toUpperCase(),
        categoryId: spec.id,
        value: raw.difficulty * 200,
        clue: sanitizeQuestionClue(raw.clue),
        correctAnswer: cleanAnswer,
        distractors,
        aliases: answerAliases(cleanAnswer, raw.aliases || [], isCollege),
        sport: spec.sport,
        difficulty: raw.difficulty,
        ...(raw.hints && raw.hints.length > 1 ? {hints: raw.hints.map(sanitizeQuestionClue)} : {}),
      });

    });

    result.push({
      id: spec.id,
      title: spec.title,
      description: spec.description,
      sport: spec.sport,
      clues,
    });
  }

  tagSubjects(result);
  COMPILED_CACHE = result;
  return result;
}

// Cities with more than one team: "New York" alone doesn't say Giants or Jets.
const SHARED_TEAM_CITIES = new Set(['new york', 'los angeles', 'ny', 'la', 'l.a.']);

/** Every answer the checker accepts for a clue, in lower case. */
export function answerAliases(answer: string, extra: string[], isCollege = false): string[] {
  const kind = answerKind(answer);
  const all = [
    answer.toLowerCase().trim(),
    // A school can look like a name ("Central Florida"), but its last word is another school.
    isCollege ? '' : lastNameAlias(answer),
    ...extra.map((a) => sanitizeAnswerChoice(isCollege ? collegeName(a) : a).toLowerCase().trim()),
    // The raw spelling too ("boston col."), so old answers still count.
    ...(isCollege ? extra.map((a) => sanitizeAnswerChoice(a).toLowerCase().trim()) : []),
    ...(isCollege ? collegeAliases(answer) : []),
    // "Acrisure" for Acrisure Stadium.
    / Stadium$/.test(answer) ? answer.replace(/ Stadium$/, '').toLowerCase() : '',
  ];
  return Array.from(new Set(all)).filter((a) => {
    if (!a) return false;
    if (kind === 'team' && SHARED_TEAM_CITIES.has(a)) return false;
    return true;
  });
}

/** Fills in each clue's `subjects`: the people (from every person answer in the bank) it names. */
function tagSubjects(categories: TriviaCategory[]): void {
  const people = new Map<string, string>(); // "Willie Roaf" -> "willieroaf"
  for (const cat of categories) {
    for (const q of cat.clues) if (answerKind(q.correctAnswer) === 'person') people.set(q.correctAnswer, normalizeAnswer(q.correctAnswer));
  }
  // Runs of 2 to 4 capitalized words, the shape of a name ("Patrick Mahomes", "Kenneth Walker III").
  const nameRun = /[A-Z][A-Za-z.'\-]+(?: [A-Z][A-Za-z.'\-]+){1,3}/g;
  for (const cat of categories) {
    for (const q of cat.clues) {
      const found = new Set<string>();
      if (people.has(q.correctAnswer)) found.add(people.get(q.correctAnswer)!);
      for (const run of q.clue.match(nameRun) ?? []) {
        const words = run.split(' ');
        // Try every 2 to 4 word stretch, since a run can include words before the name ("Georgia quarterback Matthew Stafford" has none, "Kansas City Chiefs Patrick Mahomes" does).
        for (let i = 0; i < words.length; i++) {
          for (let j = i + 2; j <= Math.min(words.length, i + 4); j++) {
            const norm = people.get(words.slice(i, j).join(' '));
            if (norm) found.add(norm);
          }
        }
      }
      q.subjects = [...found];
    }
  }
}

/** True when this clue's answer or anyone it's about has already been used in this game. */
export function clueOverlaps(q: QuestionClue, used: Set<string>): boolean {
  return used.has(normalizeAnswer(q.correctAnswer)) || (q.subjects ?? []).some((s) => used.has(s));
}

/** Marks this clue's answer and the people it's about as used in this game. */
export function markClueUsed(q: QuestionClue, used: Set<string>): void {
  used.add(normalizeAnswer(q.correctAnswer));
  for (const s of q.subjects ?? []) used.add(s);
}

// Board columns that are too alike to share a board: at most one of each family per round.
const CATEGORY_FAMILIES: [RegExp, string][] = [
  // Draft and college columns share a family: at most one per board, so boards aren't mostly draft trivia.
  [/^nfl_(drafted_by_|draft_steals$|mr_irrelevant$|number_one_picks$|colleges_)/, 'draft'],
  [/^nfl_(passing|rushing|receiving)_leaders$/, 'leaders'],
  [/^nfl_super_bowl/, 'super_bowl'],
];
export const categoryFamily = (id: string) => CATEGORY_FAMILIES.find(([re]) => re.test(id))?.[1] ?? id;

/** Big-game and famous-season columns. Every board gets at least one, besides the current column. */
export const STORY_CATEGORY_IDS = new Set([
  'nfl_super_bowl',
  'nfl_super_bowl_details',
  'nfl_conference_title',
  'nfl_records',
  'nfl_records_legends',
  'nfl_playoff_heroes',
  'nfl_monster_games',
]);

export function getTotalCategoryCount(): number {
  return getActiveCategories().length;
}

export function getTotalAvailableQuestionCount(): number {
  return getActiveCategories().reduce((n, c) => n + c.clues.length, 0);
}

// ===========================================================================
// PERSISTENCE & ANTI-REPEAT QUESTION TRACKING
// ===========================================================================

const SEEN_HASHES_STORAGE_KEY = 'sports_arena_seen_hashes_v20';
const SEEN_COUNTER_STORAGE_KEY = 'sports_arena_seen_count_v20';

const SEEN_HASH_SET = new Set<string>();
let SEEN_TOTAL_COUNT = 0;
let HAS_HYDRATED = false;

function hydrateSeenStore(): void {
  if (HAS_HYDRATED) return;
  HAS_HYDRATED = true;
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const rawCount = localStorage.getItem(SEEN_COUNTER_STORAGE_KEY);
    if (rawCount) {
      SEEN_TOTAL_COUNT = parseInt(rawCount, 10) || 0;
    }
    const raw = localStorage.getItem(SEEN_HASHES_STORAGE_KEY);
    if (raw) {
      const arr: string[] = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((h) => SEEN_HASH_SET.add(h));
      }
    }
  } catch (e) {}
}

export function getSeenQuestionIds(): Set<string> {
  hydrateSeenStore();
  // An episode code deals the same boards everywhere, so what this device has seen can't matter.
  return gameRandomSource ? NOTHING_SEEN : SEEN_HASH_SET;
}
const NOTHING_SEEN = new Set<string>();

// While an episode code deals a game, every random pick comes from it instead of Math.random.
let gameRandomSource: (() => number) | null = null;

/** A random number for dealing a game: from the episode code when there is one. */
export const gameRandom = () => (gameRandomSource ? gameRandomSource() : Math.random());

/** Runs `deal` with every random pick taken from `random` (an episode code's), or Math.random when null. */
export function dealWith<T>(random: (() => number) | null, deal: () => T): T {
  // Prepare the questions first: that shuffles wrong answers, which must not use up the code's numbers.
  getAllCompiledCategories();
  const before = gameRandomSource;
  gameRandomSource = random;
  try {
    return deal();
  } finally {
    gameRandomSource = before;
  }
}

export function markQuestionSeen(id: string): void {
  markQuestionsSeen([id]);
}

/** Marks questions as seen on this device, saving the list once for the whole batch. */
export function markQuestionsSeen(ids: string[]): void {
  hydrateSeenStore();
  const fresh = ids.filter((id) => !SEEN_HASH_SET.has(id));
  if (!fresh.length) return;
  for (const id of fresh) SEEN_HASH_SET.add(id);
  SEEN_TOTAL_COUNT += fresh.length;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(SEEN_COUNTER_STORAGE_KEY, SEEN_TOTAL_COUNT.toString());
      const sample = Array.from(SEEN_HASH_SET).slice(-50000);
      localStorage.setItem(SEEN_HASHES_STORAGE_KEY, JSON.stringify(sample));
    } catch (e) {}
  }
}

export function resetSeenQuestions(): void {
  SEEN_HASH_SET.clear();
  SEEN_TOTAL_COUNT = 0;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(SEEN_HASHES_STORAGE_KEY);
      localStorage.removeItem(SEEN_COUNTER_STORAGE_KEY);
    } catch (e) {}
  }
}

export function getSeenQuestionsCount(): number {
  hydrateSeenStore();
  return Math.max(SEEN_TOTAL_COUNT, SEEN_HASH_SET.size);
}

export function fisherYatesShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(gameRandom() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createDeterministicHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

// ===========================================================================
// GAME LENGTH
// Full: 6 categories x 5 clues per round. Short: 5 categories x 3 clues per round.
// Short tiles are worth more so a short game's board adds up to about as much
// as a full game's (15,000 vs 18,000 in Round 1, 30,000 vs 36,000 in Round 2).
// ===========================================================================

export type GameLength = 'FULL' | 'SHORT';

export const BOARD_LAYOUTS: Record<
  GameLength,
  {categories: number; difficulties: number[]; values: Record<'ROUND_1' | 'ROUND_2', number[]>}
> = {
  FULL: {
    categories: 6,
    difficulties: [1, 2, 3, 4, 5],
    values: {ROUND_1: [200, 400, 600, 800, 1000], ROUND_2: [400, 800, 1200, 1600, 2000]},
  },
  SHORT: {
    categories: 5,
    difficulties: [1, 3, 5],
    values: {ROUND_1: [500, 1000, 1500], ROUND_2: [1000, 2000, 3000]},
  },
};

// ===========================================================================
// BOARD GENERATOR
// Within one game:
// 1. No category repeats, and a board has at most one column of each family (one draft
//    column, one college column ...), plus at least one big-game or famous-season column.
// 2. No question repeats.
// 3. No answer repeats, and no person is the subject of two clues.
// ===========================================================================

export function generateBoardForRound(
  round: 'ROUND_1' | 'ROUND_2',
  categoryCount = 6,
  usedCategoryIds: Set<string>,
  usedQuestionIds: Set<string>,
  usedAnswers: Set<string>,
  gameLength: GameLength = 'FULL',
  featuredCategoryId?: string
): TriviaCategory[] {
  const allCategories = getActiveCategories();
  const seen = getSeenQuestionIds();
  const layout = BOARD_LAYOUTS[gameLength];
  const targetValues = layout.values[round];
  const ladderSize = targetValues.length;

  // Pick categories whose ID has NOT been used in this match session,
  // favouring ones that still have plenty of questions this device hasn't seen.
  const availableCats = allCategories.filter((c) => !usedCategoryIds.has(c.id));
  const unseenCount = (c: TriviaCategory) => c.clues.filter((q) => !seen.has(q.id)).length;
  const order = [
    ...fisherYatesShuffle(availableCats.filter((c) => unseenCount(c) >= ladderSize)),
    ...fisherYatesShuffle(availableCats.filter((c) => unseenCount(c) < ladderSize)),
  ];
  // The featured category (this week's games) is tried first so it makes the board even
  // when this device has seen it all, then a story column, then the rest.
  const story = order.find((c) => STORY_CATEGORY_IDS.has(c.id) && c.id !== featuredCategoryId);
  if (story) order.unshift(...order.splice(order.indexOf(story), 1));
  const featuredIdx = order.findIndex((c) => c.id === featuredCategoryId);
  if (featuredIdx > 0) order.unshift(...order.splice(featuredIdx, 1));

  const selectedBoard: TriviaCategory[] = [];
  const familiesOnBoard = new Set<string>();

  for (const cat of order) {
    if (selectedBoard.length >= categoryCount) break;
    const family = categoryFamily(cat.id);
    if (familiesOnBoard.has(family)) continue;

    // Clues not served yet whose answer and people are new this game, shuffled,
    // with questions this device has never seen first.
    const eligibleShuffled = fisherYatesShuffle(cat.clues.filter((q) => !usedQuestionIds.has(q.id) && !clueOverlaps(q, usedAnswers)));
    const eligibleClues = [...eligibleShuffled.filter((q) => !seen.has(q.id)), ...eligibleShuffled.filter((q) => seen.has(q.id))];

    // Build the ladder (difficulty 1 to 5, or 1/3/5 for a short game).
    const ladderClues: QuestionClue[] = [];
    const localUsed = new Set<string>();
    for (let ladderIdx = 0; ladderIdx < ladderSize; ladderIdx++) {
      const targetDiff = layout.difficulties[ladderIdx];
      const isFree = (q: QuestionClue) => !ladderClues.some((c) => c.id === q.id) && !clueOverlaps(q, localUsed);
      // Prefer an unseen exact difficulty match, then an unseen clue one level off,
      // then any unseen clue, then a seen one at the right level, then anything left.
      const candidate =
        eligibleClues.find((q) => !seen.has(q.id) && q.difficulty === targetDiff && isFree(q)) ||
        eligibleClues.find((q) => !seen.has(q.id) && Math.abs(q.difficulty - targetDiff) === 1 && isFree(q)) ||
        eligibleClues.find((q) => !seen.has(q.id) && isFree(q)) ||
        eligibleClues.find((q) => q.difficulty === targetDiff && isFree(q)) ||
        eligibleClues.find(isFree);
      if (!candidate) break;
      ladderClues.push({...candidate, value: targetValues[ladderIdx]});
      markClueUsed(candidate, localUsed);
    }

    if (ladderClues.length === ladderSize) {
      ladderClues.forEach((c) => {
        usedQuestionIds.add(c.id);
        markClueUsed(c, usedAnswers);
      });
      markQuestionsSeen(ladderClues.map((c) => c.id));
      usedCategoryIds.add(cat.id);
      familiesOnBoard.add(family);
      selectedBoard.push({id: cat.id, title: cat.title, description: cat.description, sport: cat.sport, clues: ladderClues});
    }
  }

  // Shuffle the columns so the current and story columns land anywhere on the board.
  return fisherYatesShuffle(selectedBoard);
}

/**
 * Categories whose hard clues make a good Final Showdown: big games, legends and famous
 * seasons. Draft rounds, colleges, jersey numbers and trades are left out because a Final
 * like "Round 4" or "Idaho St." ends the game flat.
 */
export const FINAL_CATEGORY_IDS = new Set([
  'nfl_super_bowl',
  'nfl_super_bowl_details',
  'nfl_conference_title',
  'nfl_records',
  'nfl_number_one_picks',
  'nfl_who_am_i',
  'nfl_passing_leaders',
  'nfl_rushing_leaders',
  'nfl_receiving_leaders',
  'nfl_records_legends',
  'nfl_franchises_stadiums',
  'nfl_playoff_heroes',
  'nfl_monster_games',
]);

export function getChampionshipFinalClues(): QuestionClue[] {
  const allCategories = getActiveCategories().filter((c) => FINAL_CATEGORY_IDS.has(c.id));
  const clues: QuestionClue[] = [];

  allCategories.forEach((cat) => {
    cat.clues.forEach((q) => {
      // Stadium names make poor Finals: hard to spell and easy to half-know.
      // Numbers and scores ("13", "24-10") make poor Finals too: a near miss is still wrong.
      const kind = answerKind(q.correctAnswer);
      if (q.difficulty >= 4 && !/in this stadium/i.test(q.clue) && kind !== 'number' && kind !== 'score' && kind !== 'year') {
        clues.push({
          ...q,
          value: 0,
        });
      }
    });
  });

  return clues;
}
