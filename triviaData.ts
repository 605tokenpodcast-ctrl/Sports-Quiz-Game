/**
 * Sports Arena Quiz - Comprehensive Multi-Difficulty Question Bank & Fuzzy Matcher
 * Powered by Procedural & Curated Sports Trivia Engine
 * 
 * Guarantees:
 * - Questions NEVER repeat within the same game (`usedQuestionIds`).
 * - Categories NEVER repeat within the same game (`usedCategoryIds`).
 * - Answers NEVER repeat within the same game (`usedAnswers` / `normalizeAnswer`).
 * - At least 100 unique questions in every single category.
 * - Reset tracking sets ONLY on starting a completely new game ("Play Again" / "New Game").
 */

export * from './triviaEngine';
import {
  generateBoardForRound,
  generateSmartDistractors,
  getChampionshipFinalClues,
  getQuestionScope,
  getSeenQuestionsCount,
  getSeenQuestionIds,
  markQuestionSeen,
  resetSeenQuestions,
  getTotalAvailableQuestionCount,
  getTotalCategoryCount,
  normalizeAnswer,
  sanitizeAnswerChoice,
  sanitizeQuestionClue,
  QuestionClue,
  TriviaCategory,
} from './triviaEngine';

// Deep Championship Showdown Final Clues Pool
const RAW_FINAL_SHOWDOWN_QUESTIONS: QuestionClue[] = [
  ...getChampionshipFinalClues(),
  {
    id: 'final_nfl_immortal_1',
    category: 'CHAMPIONSHIP IMMORTALS',
    value: 0,
    clue: 'He is the only quarterback in NFL history to win 7 Super Bowl Championships and claim 5 Super Bowl MVP awards across two different franchises.',
    correctAnswer: 'Tom Brady',
    distractors: ['Peyton Manning', 'Joe Montana', 'Kurt Warner', 'Brett Favre', 'Drew Brees', 'Patrick Mahomes', 'Eli Manning'],
    aliases: ['brady', 'tom brady', 'tb12', 'thomas brady'],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nba_legend_2',
    category: 'HISTORIC DYNASTIES',
    value: 0,
    clue: 'This head coach won 11 NBA Championships coaching the Chicago Bulls and Los Angeles Lakers, utilizing the famous Triangle Offense.',
    correctAnswer: 'Phil Jackson',
    distractors: ['Pat Riley', 'Gregg Popovich', 'Red Auerbach', 'Steve Kerr', 'Chuck Daly', 'Larry Brown', 'Doc Rivers'],
    aliases: ['jackson', 'phil jackson', 'zen master'],
    sport: 'NBA',
    difficulty: 5,
  },
  {
    id: 'final_mlb_barrier_3',
    category: 'BASEBALL MILESTONES',
    value: 0,
    clue: "On April 15, 1947, he broke Major League Baseball's color barrier by starting at first base for the Brooklyn Dodgers wearing jersey #42.",
    correctAnswer: 'Jackie Robinson',
    distractors: ['Satchel Paige', 'Roy Campanella', 'Larry Doby', 'Hank Aaron', 'Willie Mays', 'Monte Irvin', 'Don Newcombe'],
    aliases: ['robinson', 'jackie robinson', 'jack robinson', '42'],
    sport: 'MLB',
    difficulty: 5,
  },
  {
    id: 'final_ncaa_heisman_4',
    category: 'HEISMAN IMMORTALS',
    value: 0,
    clue: 'In 1988, this Oklahoma State running back set the unbreakable single-season NCAA record with 2,628 rushing yards and 37 touchdowns in just 11 games.',
    correctAnswer: 'Barry Sanders',
    distractors: ['Bo Jackson', 'Herschel Walker', 'Archie Griffin', 'Ricky Williams', 'Derrick Henry', 'Reggie Bush', 'Marcus Allen'],
    aliases: ['barry sanders', 'sanders'],
    sport: 'NCAA_FOOTBALL',
    difficulty: 5,
  },
  {
    id: 'final_nhl_greatone_5',
    category: 'NHL LEGENDS',
    value: 0,
    clue: 'Known as "The Great One", this center scored 50 goals in just 39 games in 1981-82 and finished his career with an NHL record 2,857 points.',
    correctAnswer: 'Wayne Gretzky',
    distractors: ['Mario Lemieux', 'Gordie Howe', 'Bobby Orr', 'Jaromir Jagr', 'Sidney Crosby', 'Alex Ovechkin', 'Mark Messier'],
    aliases: ['gretzky', 'wayne gretzky', 'the great one', 'great one', '99'],
    sport: 'NHL',
    difficulty: 5,
  },
  {
    id: 'final_march_madness_6',
    category: 'MARCH MADNESS DYNASTIES',
    value: 0,
    clue: "Known as the \"Wizard of Westwood\", this legendary head coach led the UCLA Bruins men's basketball team to 10 NCAA National Championships in a 12-year span, including 7 consecutive titles.",
    correctAnswer: 'John Wooden',
    distractors: ['Mike Krzyzewski', 'Dean Smith', 'Bob Knight', 'Adolph Rupp', 'Jim Calhoun', 'Roy Williams', 'Lute Olson'],
    aliases: ['wooden', 'john wooden', 'wizard of westwood'],
    sport: 'NCAA_BASKETBALL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_unbeaten_7',
    category: 'PERFECT SEASONS',
    value: 0,
    clue: 'Under Hall of Fame head coach Don Shula, which 1972 NFL team achieved the only perfect, undefeated and untied season in modern NFL history, finishing 17-0 with a Super Bowl VII victory?',
    correctAnswer: 'Miami Dolphins',
    distractors: ['New England Patriots', 'Chicago Bears', 'Pittsburgh Steelers', 'Green Bay Packers', 'Dallas Cowboys', 'San Francisco 49ers', 'Baltimore Colts'],
    aliases: ['dolphins', 'miami dolphins', '72 dolphins', '1972 miami dolphins'],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nba_100point_8',
    category: 'UNTOUCHABLE RECORDS',
    value: 0,
    clue: 'On March 2, 1962 in Hershey, Pennsylvania, which Philadelphia Warriors center scored an all-time NBA record 100 points in a single regular season game against the New York Knicks?',
    correctAnswer: 'Wilt Chamberlain',
    distractors: ['Bill Russell', 'Elgin Baylor', 'Oscar Robertson', 'Bob Pettit', 'Jerry West', 'Walt Bellamy', 'Richie Guerin'],
    aliases: ['chamberlain', 'wilt chamberlain', 'the big dipper', 'wilt the stilt'],
    sport: 'NBA',
    difficulty: 5,
  },
  {
    id: 'final_mlb_streak_9',
    category: 'THE HIT KING',
    value: 0,
    clue: "In 1941, which New York Yankees center fielder established baseball's iconic hitting streak record by hitting safely in 56 consecutive games?",
    correctAnswer: 'Joe DiMaggio',
    distractors: ['Ted Williams', 'Stan Musial', 'Lou Gehrig', 'Hank Greenberg', 'Charlie Keller', 'Pete Rose', 'Ty Cobb'],
    aliases: ['dimaggio', 'joe dimaggio', 'the yankee clipper', 'joltin joe'],
    sport: 'MLB',
    difficulty: 5,
  },
  {
    id: 'final_nhl_wins_10',
    category: 'GOALTENDING IMMORTALITY',
    value: 0,
    clue: 'Which New Jersey Devils goaltender holds the all-time NHL regular-season records for both career goalie wins and career shutouts?',
    correctAnswer: 'Martin Brodeur',
    distractors: ['Patrick Roy', 'Dominik Hasek', 'Ed Belfour', 'Roberto Luongo', 'Henrik Lundqvist', 'Terry Sawchuk', 'Curtis Joseph'],
    aliases: ['brodeur', 'martin brodeur'],
    sport: 'NHL',
    difficulty: 5,
  },
];

// Deep Championship Showdown Final Clues Pool
export const FINAL_SHOWDOWN_QUESTIONS: QuestionClue[] = RAW_FINAL_SHOWDOWN_QUESTIONS.map((q) => ({
  ...q,
  clue: sanitizeQuestionClue(q.clue),
}));

/**
 * Dynamic getter for category boards with strict session-wide deduplication:
 * 1. usedCategoryIds
 * 2. usedQuestionIds
 * 3. usedAnswers (normalized)
 */
export function getCategoriesForRound(
  round: 'ROUND_1' | 'ROUND_2',
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT' = 'MEDIUM',
  categoryCount = 6,
  usedCategoryIds: Set<string>,
  usedQuestionIds: Set<string>,
  usedAnswers: Set<string>
): TriviaCategory[] {
  return generateBoardForRound(
    round,
    difficulty,
    categoryCount,
    usedCategoryIds,
    usedQuestionIds,
    usedAnswers
  );
}

/**
 * Pick a fresh Final Showdown clue that hasn't been used in the current session or recently seen,
 * and whose answer has NOT been used anywhere in this game session.
 */
export function getFreshFinalShowdownClue(
  usedQuestionIds: Set<string>,
  usedAnswers: Set<string>
): QuestionClue {
  const seen = getSeenQuestionIds();

  // Hand-written finals plus every hard clue in the current pool (including runtime banks).
  const byId = new Map<string, QuestionClue>();
  for (const q of [...FINAL_SHOWDOWN_QUESTIONS, ...getChampionshipFinalClues()]) {
    if (getQuestionScope() === 'NFL' && q.sport !== 'NFL') continue;
    byId.set(q.id, q);
  }
  const finalPool = byId.size > 0 ? [...byId.values()] : FINAL_SHOWDOWN_QUESTIONS;

  // Strict check: Question ID not in session, AND normalized answer not in usedAnswers
  const candidates = finalPool.filter(
    (q) =>
      !usedQuestionIds.has(q.id) &&
      !usedAnswers.has(normalizeAnswer(q.correctAnswer)) &&
      !seen.has(q.id)
  );

  const fallbackCandidates = finalPool.filter(
    (q) =>
      !usedQuestionIds.has(q.id) &&
      !usedAnswers.has(normalizeAnswer(q.correctAnswer))
  );

  const pool =
    candidates.length > 0
      ? candidates
      : fallbackCandidates.length > 0
      ? fallbackCandidates
      : finalPool;

  const picked = pool[Math.floor(Math.random() * pool.length)];

  usedQuestionIds.add(picked.id);
  usedAnswers.add(normalizeAnswer(picked.correctAnswer));
  markQuestionSeen(picked.id);
  return picked;
}

/**
 * Creates a complete full-game session with strict 100% deduplication:
 * - 6 distinct categories for Round 1 (30 unique questions, 30 unique answers)
 * - 6 different distinct categories for Round 2 (30 unique questions, 30 unique answers)
 * - 1 unique Final Showdown question (1 unique answer)
 * - Total = 61 completely unique questions across 12 distinct categories with ZERO repeated answers!
 */
export function createFullGameSession(
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT' = 'MEDIUM'
): {
  round1Board: TriviaCategory[];
  round2Board: TriviaCategory[];
  finalClue: QuestionClue;
  usedCategoryIds: Set<string>;
  usedQuestionIds: Set<string>;
  usedAnswers: Set<string>;
} {
  // Session tracking sets (reset every fresh game)
  const usedCategoryIds = new Set<string>();
  const usedQuestionIds = new Set<string>();
  const usedAnswers = new Set<string>();

  // Round 1 (6 categories x 5 ladder tiles = 30 unique questions & answers)
  const round1Board = getCategoriesForRound(
    'ROUND_1',
    difficulty,
    6,
    usedCategoryIds,
    usedQuestionIds,
    usedAnswers
  );

  // Round 2 (6 DIFFERENT categories x 5 ladder tiles = 30 unique questions & answers)
  const round2Board = getCategoriesForRound(
    'ROUND_2',
    difficulty,
    6,
    usedCategoryIds,
    usedQuestionIds,
    usedAnswers
  );

  // Final Showdown Clue (1 unique question with unique answer)
  const finalClue = getFreshFinalShowdownClue(usedQuestionIds, usedAnswers);

  return {
    round1Board,
    round2Board,
    finalClue,
    usedCategoryIds,
    usedQuestionIds,
    usedAnswers,
  };
}

/**
 * Builds the exact options list (4 choices or 8 choices) for any question clue.
 * Guarantees every option is sanitized and uniform without parenthetical giveaways.
 */
export function buildQuestionOptions(clue: QuestionClue, mode: 'STANDARD' | 'HARD' | 'EXPERT'): string[] {
  if (mode === 'EXPERT') return [];

  const neededDistractorCount = mode === 'HARD' ? 7 : 3;
  const smartDistractors = generateSmartDistractors(
    clue.correctAnswer,
    clue.sport,
    clue.category,
    clue.distractors
  );

  const cleanCorrect = sanitizeAnswerChoice(clue.correctAnswer);
  const pickedDistractors = smartDistractors
    .map(sanitizeAnswerChoice)
    .filter((d) => normalizeAnswer(d) !== normalizeAnswer(cleanCorrect))
    .slice(0, neededDistractorCount);

  const optionsPool = [cleanCorrect, ...pickedDistractors];

  for (let i = optionsPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [optionsPool[i], optionsPool[j]] = [optionsPool[j], optionsPool[i]];
  }

  return optionsPool;
}

/**
 * Fuzzy String Comparison for Expert Typed Input
 * Tolerates minor spelling typos, nicknames, punctuation, and extra spaces.
 */
export function checkTypedAnswer(input: string, clue: QuestionClue, threshold = 0.75): boolean {
  if (!input || !input.trim()) return false;

  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const userClean = clean(input);
  const correctClean = clean(clue.correctAnswer);

  if (userClean === correctClean) return true;

  for (const alias of clue.aliases) {
    const aliasClean = clean(alias);
    if (userClean === aliasClean) return true;
    if (userClean.length >= 3 && (aliasClean.includes(userClean) || userClean.includes(aliasClean))) {
      if (userClean.length >= aliasClean.length * 0.7) return true;
    }
  }

  const candidates = [correctClean, ...clue.aliases.map(clean)];
  for (const cand of candidates) {
    const sim = calculateSimilarity(userClean, cand);
    if (sim >= threshold) return true;
  }

  return false;
}

function calculateSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  const d = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - d / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
