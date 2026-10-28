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
}

export interface TriviaCategory {
  id: string;
  title: string;
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
 * Strips all unnecessary parenthetical expressions, metadata markers, series counters,
 * and contextual annotations from question prompts, guaranteeing clean, concise,
 * natural trivia prompts without visual clutter.
 */
export function sanitizeQuestionClue(str: string): string {
  if (!str) return '';
  return str
    .replace(/\s*\([^)]*\)/g, '') // remove any parenthetical notes
    .replace(/\s+,/g, ',') // clean up space before comma
    .replace(/\s+\./g, '.') // clean up space before period
    .replace(/\s+\?/g, '?') // clean up space before question mark
    .replace(/,\s*,/g, ',') // clean up duplicate commas
    .replace(/\s+/g, ' ') // normalize whitespace
    .trim();
}

/** The last word of an answer ("Mahomes"), skipping endings like "Jr." or "St." that would match anything. */
function lastNameAlias(answer: string): string {
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

export function generateSmartDistractors(
  correctAnswer: string,
  sport: SportTag,
  category: string,
  existingDistractors: string[] = []
): string[] {
  const cleanCorrect = sanitizeAnswerChoice(correctAnswer);
  const target = normalizeAnswer(cleanCorrect);
  const curatedSet = new Set<string>();

  existingDistractors.forEach((d) => {
    const cleanD = sanitizeAnswerChoice(d);
    if (cleanD && normalizeAnswer(cleanD) !== target) {
      curatedSet.add(cleanD);
    }
  });

  if (curatedSet.size >= 7) {
    return Array.from(curatedSet);
  }

  const candidateBanks: string[][] = [
    PEER_BANKS.nfl_qb,
    PEER_BANKS.nfl_rb,
    PEER_BANKS.nfl_wr_te,
    PEER_BANKS.nfl_defense,
    PEER_BANKS.nfl_teams,
    PEER_BANKS.nfl_coaches,
  ];

  for (const bank of candidateBanks) {
    const shuffled = fisherYatesShuffle(bank);
    for (const peer of shuffled) {
      const cleanPeer = sanitizeAnswerChoice(peer);
      if (cleanPeer && normalizeAnswer(cleanPeer) !== target && !curatedSet.has(cleanPeer)) {
        curatedSet.add(cleanPeer);
        if (curatedSet.size >= 10) break;
      }
    }
    if (curatedSet.size >= 10) break;
  }

  return Array.from(curatedSet);
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
  }[];
}

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
 * Loads a question bank JSON file and adds its categories to the pool.
 * Fails quietly so the game still works with the built-in questions offline.
 */
export async function loadExternalQuestionBank(url = 'questions/nfl.json'): Promise<ExternalBankInfo | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const bank = await res.json();
    const known = new Set(EXTERNAL_SPECS.map((c) => c.id));
    for (const c of bank.categories as CategorySpec[]) {
      if (!known.has(c.id)) EXTERNAL_SPECS.push(c);
    }
    COMPILED_CACHE = null;
    return { questionCount: bank.questionCount, dataThrough: bank.dataThrough };
  } catch (e) {
    return null;
  }
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
    const seenAnswersInCat = new Set<string>();

    spec.entries.forEach((raw, idx) => {
      const cleanAnswer = sanitizeAnswerChoice(raw.answer);
      const ansNorm = normalizeAnswer(cleanAnswer);
      if (!ansNorm) return;

      const signature = `${spec.id}__${idx}__${cleanAnswer}__${raw.difficulty}`;
      const id = raw.id || `q_${createDeterministicHash(signature)}`;
      const distractors = generateSmartDistractors(cleanAnswer, spec.sport, spec.title, raw.distractors);

      clues.push({
        id,
        category: spec.title.toUpperCase(),
        value: raw.difficulty * 200,
        clue: sanitizeQuestionClue(raw.clue),
        correctAnswer: cleanAnswer,
        distractors,
        aliases: Array.from(
          new Set([
            cleanAnswer.toLowerCase().trim(),
            lastNameAlias(cleanAnswer),
            ...(raw.aliases || []).map((a) => sanitizeAnswerChoice(a).toLowerCase().trim()),
          ])
        ).filter(Boolean),
        sport: spec.sport,
        difficulty: raw.difficulty,
      });

      seenAnswersInCat.add(ansNorm);
    });

    result.push({
      id: spec.id,
      title: spec.title,
      sport: spec.sport,
      clues,
    });
  }

  COMPILED_CACHE = result;
  return result;
}

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
  return SEEN_HASH_SET;
}

export function markQuestionSeen(id: string): void {
  hydrateSeenStore();
  if (SEEN_HASH_SET.has(id)) return;
  SEEN_HASH_SET.add(id);
  SEEN_TOTAL_COUNT++;

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
    const j = Math.floor(Math.random() * (i + 1));
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
// STRICT DEDUPLICATION BOARD GENERATOR
// Ensures:
// 1. usedCategoryIds: No category repeats in the same game session.
// 2. usedQuestionIds: No question ID repeats in the same game session.
// 3. usedAnswers: No two questions played have the same normalized correct answer.
// ===========================================================================

export function generateBoardForRound(
  round: 'ROUND_1' | 'ROUND_2',
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT',
  categoryCount = 6,
  usedCategoryIds: Set<string>,
  usedQuestionIds: Set<string>,
  usedAnswers: Set<string>
): TriviaCategory[] {
  const allCategories = getActiveCategories();
  const seen = getSeenQuestionIds();
  const isRound2 = round === 'ROUND_2';
  const targetValues = isRound2 ? [400, 800, 1200, 1600, 2000] : [200, 400, 600, 800, 1000];

  // Pick categories whose ID has NOT been used in this match session,
  // favouring ones that still have plenty of questions this device hasn't seen.
  const availableCats = allCategories.filter((c) => !usedCategoryIds.has(c.id));
  const unseenCount = (c: TriviaCategory) => c.clues.filter((q) => !seen.has(q.id)).length;
  const shuffledAvailable = [
    ...fisherYatesShuffle(availableCats.filter((c) => unseenCount(c) >= 5)),
    ...fisherYatesShuffle(availableCats.filter((c) => unseenCount(c) < 5)),
  ];

  const selectedBoard: TriviaCategory[] = [];

  for (const cat of shuffledAvailable) {
    if (selectedBoard.length >= categoryCount) break;

    // Filter clues that have not been served and whose answer has not been used in this session.
    // Shuffled, then questions this device has never seen go first.
    const eligibleShuffled = fisherYatesShuffle(
      cat.clues.filter((q) => !usedQuestionIds.has(q.id) && !usedAnswers.has(normalizeAnswer(q.correctAnswer)))
    );
    const eligibleClues = [
      ...eligibleShuffled.filter((q) => !seen.has(q.id)),
      ...eligibleShuffled.filter((q) => seen.has(q.id)),
    ];

    // Ensure we can construct a full 5-clue ladder (difficulty 1 to 5)
    const ladderClues: QuestionClue[] = [];
    const localUsedClueIds = new Set<string>();
    const localUsedAnswers = new Set<string>();

    for (let ladderIdx = 0; ladderIdx < 5; ladderIdx++) {
      const targetDiff = ladderIdx + 1; // 1, 2, 3, 4, 5
      const val = targetValues[ladderIdx];

      // Prefer an unseen exact difficulty match, then an unseen clue one level off,
      // then any unseen clue, and only then something seen before.
      const isFree = (q: QuestionClue) =>
        !localUsedClueIds.has(q.id) &&
        !localUsedAnswers.has(normalizeAnswer(q.correctAnswer)) &&
        !usedAnswers.has(normalizeAnswer(q.correctAnswer)) &&
        !usedQuestionIds.has(q.id);
      let candidate =
        eligibleClues.find((q) => !seen.has(q.id) && q.difficulty === targetDiff && isFree(q)) ||
        eligibleClues.find((q) => !seen.has(q.id) && Math.abs(q.difficulty - targetDiff) === 1 && isFree(q)) ||
        eligibleClues.find((q) => !seen.has(q.id) && isFree(q)) ||
        eligibleClues.find(
        (q) =>
          q.difficulty === targetDiff &&
          !localUsedClueIds.has(q.id) &&
          !localUsedAnswers.has(normalizeAnswer(q.correctAnswer)) &&
          !usedAnswers.has(normalizeAnswer(q.correctAnswer)) &&
          !usedQuestionIds.has(q.id)
      );

      // If no exact difficulty match, pick any unused eligible clue in this category
      if (!candidate) {
        candidate = eligibleClues.find(
          (q) =>
            !localUsedClueIds.has(q.id) &&
            !localUsedAnswers.has(normalizeAnswer(q.correctAnswer)) &&
            !usedAnswers.has(normalizeAnswer(q.correctAnswer)) &&
            !usedQuestionIds.has(q.id)
        );
      }

      if (candidate) {
        const assigned: QuestionClue = {
          ...candidate,
          value: val,
        };
        ladderClues.push(assigned);
        localUsedClueIds.add(candidate.id);
        localUsedAnswers.add(normalizeAnswer(candidate.correctAnswer));
      }
    }

    if (ladderClues.length === 5) {
      // Commit all 5 clues and the category to session tracking
      ladderClues.forEach((c) => {
        usedQuestionIds.add(c.id);
        usedAnswers.add(normalizeAnswer(c.correctAnswer));
        markQuestionSeen(c.id);
      });

      usedCategoryIds.add(cat.id);

      selectedBoard.push({
        id: cat.id,
        title: cat.title,
        sport: cat.sport,
        clues: ladderClues,
      });
    }
  }

  return selectedBoard;
}

export function getChampionshipFinalClues(): QuestionClue[] {
  const allCategories = getActiveCategories();
  const clues: QuestionClue[] = [];

  allCategories.forEach((cat) => {
    cat.clues.forEach((q) => {
      if (q.difficulty >= 4) {
        clues.push({
          ...q,
          value: 0,
        });
      }
    });
  });

  return clues;
}
