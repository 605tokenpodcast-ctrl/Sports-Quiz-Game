/**
 * Game sessions (boards and the Final Showdown question), answer options, and answer
 * checking for typed and spoken answers.
 *
 * Within one game no question, category or answer repeats.
 */

export * from './triviaEngine';
import {
  BOARD_LAYOUTS,
  GameLength,
  generateBoardForRound,
  generateSmartDistractors,
  getActiveCategories,
  getChampionshipFinalClues,
  clueOverlaps,
  markClueUsed,
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

// Hand-written Final Showdown questions. Hard questions from the main bank join them at game time.
const RAW_FINAL_SHOWDOWN_QUESTIONS: QuestionClue[] = [
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
    id: 'final_nfl_music_city',
    category: 'FAMOUS FINISHES',
    value: 0,
    clue: "In the January 2000 Wild Card round, the Tennessee Titans won the \"Music City Miracle\" on a kickoff-return lateral against this team.",
    correctAnswer: 'Buffalo Bills',
    distractors: ["Jacksonville Jaguars", "Indianapolis Colts", "Miami Dolphins", "Baltimore Ravens", "Pittsburgh Steelers", "New York Jets", "Kansas City Chiefs"],
    aliases: ["bills", "buffalo", "buffalo bills"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_immaculate',
    category: 'FAMOUS FINISHES',
    value: 0,
    clue: "This Steelers rookie running back scooped up a deflected pass and ran it in for the \"Immaculate Reception\" against the Raiders in 1972.",
    correctAnswer: 'Franco Harris',
    distractors: ["Rocky Bleier", "Lynn Swann", "John Stallworth", "Terry Bradshaw", "Jack Lambert", "Mike Webster", "Frenchy Fuqua"],
    aliases: ["franco harris", "harris", "franco"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_helmet_catch',
    category: 'FAMOUS FINISHES',
    value: 0,
    clue: "In Super Bowl XLII, this Giants receiver pinned an Eli Manning pass against his helmet to keep the game-winning drive alive.",
    correctAnswer: 'David Tyree',
    distractors: ["Plaxico Burress", "Amani Toomer", "Steve Smith", "Kevin Boss", "Jeremy Shockey", "Mario Manningham", "Brandon Jacobs"],
    aliases: ["david tyree", "tyree"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_the_catch',
    category: 'FAMOUS FINISHES',
    value: 0,
    clue: "Joe Montana's pass to this receiver in the 1981 NFC Championship Game became known simply as \"The Catch.\"",
    correctAnswer: 'Dwight Clark',
    distractors: ["Jerry Rice", "Freddie Solomon", "Roger Craig", "John Taylor", "Russ Francis", "Earl Cooper", "Ronnie Lott"],
    aliases: ["dwight clark", "clark"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_minneapolis',
    category: 'FAMOUS FINISHES',
    value: 0,
    clue: "This Vikings receiver caught the last-play, 61-yard \"Minneapolis Miracle\" touchdown to beat the Saints in the January 2018 playoffs.",
    correctAnswer: 'Stefon Diggs',
    distractors: ["Adam Thielen", "Kyle Rudolph", "Jarius Wright", "Laquon Treadwell", "Cordarrelle Patterson", "Jerick McKinnon", "Latavius Murray"],
    aliases: ["stefon diggs", "diggs"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_philly_special',
    category: 'FAMOUS FINISHES',
    value: 0,
    clue: "On the \"Philly Special\" trick play in Super Bowl LII, this Eagles quarterback caught a touchdown pass.",
    correctAnswer: 'Nick Foles',
    distractors: ["Carson Wentz", "Nate Sudfeld", "Jalen Hurts", "Michael Vick", "Donovan McNabb", "Sam Bradford", "Mark Sanchez"],
    aliases: ["nick foles", "foles"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_28_3',
    category: 'EPIC COLLAPSES',
    value: 0,
    clue: "This team led the Patriots 28-3 in the third quarter of Super Bowl LI and lost in overtime.",
    correctAnswer: 'Atlanta Falcons',
    distractors: ["Seattle Seahawks", "Carolina Panthers", "Los Angeles Rams", "Philadelphia Eagles", "New York Giants", "Kansas City Chiefs", "San Francisco 49ers"],
    aliases: ["falcons", "atlanta", "atlanta falcons"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_home_sb',
    category: 'SUPER BOWL FIRSTS',
    value: 0,
    clue: "After the 2020 season, this team became the first to win a Super Bowl in its own home stadium.",
    correctAnswer: 'Tampa Bay Buccaneers',
    distractors: ["Los Angeles Rams", "Kansas City Chiefs", "Miami Dolphins", "New Orleans Saints", "Green Bay Packers", "San Francisco 49ers", "Houston Texans"],
    aliases: ["buccaneers", "bucs", "tampa bay", "tampa bay buccaneers"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_0_16',
    category: 'FEAST OR FAMINE',
    value: 0,
    clue: "In 2008, this team became the first in NFL history to finish a season 0-16.",
    correctAnswer: 'Detroit Lions',
    distractors: ["Cleveland Browns", "St. Louis Rams", "Oakland Raiders", "Kansas City Chiefs", "Miami Dolphins", "Houston Texans", "Cincinnati Bengals"],
    aliases: ["lions", "detroit", "detroit lions"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_shula',
    category: 'SIDELINE LEGENDS',
    value: 0,
    clue: "With 347 wins including the playoffs, this coach holds the NFL record for career victories.",
    correctAnswer: 'Don Shula',
    distractors: ["Bill Belichick", "George Halas", "Tom Landry", "Curly Lambeau", "Andy Reid", "Paul Brown", "Chuck Noll"],
    aliases: ["don shula", "shula"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_pass_td',
    category: 'CHAMPIONSHIP IMMORTALS',
    value: 0,
    clue: "This quarterback retired with 649 regular-season touchdown passes, the most in NFL history.",
    correctAnswer: 'Tom Brady',
    distractors: ["Drew Brees", "Peyton Manning", "Brett Favre", "Aaron Rodgers", "Philip Rivers", "Dan Marino", "Ben Roethlisberger"],
    aliases: ["tom brady", "brady"],
    sport: 'NFL',
    difficulty: 5,
  },
  {
    id: 'final_nfl_guarantee',
    category: 'SUPER BOWL FIRSTS',
    value: 0,
    clue: "Before Super Bowl III, this Jets quarterback guaranteed a win over the heavily favored Baltimore Colts.",
    correctAnswer: 'Joe Namath',
    distractors: ["Johnny Unitas", "Earl Morrall", "Len Dawson", "Bart Starr", "Daryle Lamonica", "Fran Tarkenton", "Bob Griese"],
    aliases: ["joe namath", "namath", "broadway joe"],
    sport: 'NFL',
    difficulty: 5,
  },
];

export const FINAL_SHOWDOWN_QUESTIONS: QuestionClue[] = RAW_FINAL_SHOWDOWN_QUESTIONS.map((q) => ({
  ...q,
  clue: sanitizeQuestionClue(q.clue),
}));

/**
 * Every board gets one current column, so each episode has fresh talking points after the
 * Tuesday question refresh: this week's games in Round 1, the season so far in Round 2.
 */
export const CURRENT_CATEGORY_IDS = {ROUND_1: 'nfl_this_week', ROUND_2: 'nfl_this_season'} as const;

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
  usedAnswers: Set<string>,
  gameLength: GameLength = 'FULL'
): TriviaCategory[] {
  // The board doesn't depend on the AI difficulty: tile values set each clue's difficulty.
  void difficulty;
  return generateBoardForRound(
    round,
    categoryCount,
    usedCategoryIds,
    usedQuestionIds,
    usedAnswers,
    gameLength,
    CURRENT_CATEGORY_IDS[round]
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
    if (q.sport !== 'NFL') continue;
    byId.set(q.id, q);
  }
  const finalPool = byId.size > 0 ? [...byId.values()] : FINAL_SHOWDOWN_QUESTIONS;

  // Strict check: Question ID not in session, AND normalized answer not in usedAnswers
  // Not used this game, and not about anyone already asked about.
  const candidates = finalPool.filter((q) => !usedQuestionIds.has(q.id) && !clueOverlaps(q, usedAnswers) && !seen.has(q.id));
  const fallbackCandidates = finalPool.filter((q) => !usedQuestionIds.has(q.id) && !clueOverlaps(q, usedAnswers));

  // The hand-written Finals are the best ones, so they come up about a third of the time
  // while this device still has some it hasn't seen.
  const handWritten = candidates.filter((q) => q.id.startsWith('final_'));
  const pool =
    handWritten.length > 0 && Math.random() < 0.35
      ? handWritten
      : candidates.length > 0
      ? candidates
      : fallbackCandidates.length > 0
      ? fallbackCandidates
      : finalPool;

  const picked = pool[Math.floor(Math.random() * pool.length)];

  usedQuestionIds.add(picked.id);
  markClueUsed(picked, usedAnswers);
  markQuestionSeen(picked.id);
  return picked;
}

/**
 * Creates a complete game session with strict 100% deduplication:
 * - Full game: 6 categories x 5 clues per round (61 questions with the Final Showdown)
 * - Short game: 5 categories x 3 clues per round (31 questions with the Final Showdown)
 * - Round 2 categories never repeat Round 1's, and no answer repeats anywhere in the game.
 */
export function createFullGameSession(
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT' = 'MEDIUM',
  gameLength: GameLength = 'FULL'
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

  const categoryCount = BOARD_LAYOUTS[gameLength].categories;

  // Round 2's current column (the season so far) is small, so Round 1 leaves its answers alone.
  const reserved = (getActiveCategories().find((c) => c.id === CURRENT_CATEGORY_IDS.ROUND_2)?.clues ?? [])
    .map((q) => normalizeAnswer(q.correctAnswer))
    .filter((a) => !usedAnswers.has(a));
  reserved.forEach((a) => usedAnswers.add(a));

  // Round 1
  const round1Board = getCategoriesForRound(
    'ROUND_1',
    difficulty,
    categoryCount,
    usedCategoryIds,
    usedQuestionIds,
    usedAnswers,
    gameLength
  );

  reserved.forEach((a) => usedAnswers.delete(a));

  // Round 2 (DIFFERENT categories from Round 1)
  const round2Board = getCategoriesForRound(
    'ROUND_2',
    difficulty,
    categoryCount,
    usedCategoryIds,
    usedQuestionIds,
    usedAnswers,
    gameLength
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
    clue.distractors,
    clue.clue
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
      .replace(/\bst\b\.?/g, 'state') // "Ohio St." and "Ohio State" are the same school
      .replace(/\b49ers\b/g, 'niners')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const userClean = clean(input).replace(/^(the|a|an) /, '');
  const correctClean = clean(clue.correctAnswer);

  if (userClean === correctClean) return true;

  // Numeric answers (scores, draft rounds, counts) need the exact numbers: "23-17" is not
  // "23-16" and "Round 3" is not "Round 2", even though the spelling is one character off.
  const numbersIn = (s: string) => (normalizeSpoken(s).match(/\d+/g) || []).join(' ');
  const correctNumbers = numbersIn(clue.correctAnswer);
  if (correctNumbers) return numbersIn(input) === correctNumbers;

  const correctWords = new Set(correctClean.split(' '));
  for (const alias of clue.aliases) {
    const aliasClean = clean(alias);
    if (!aliasClean) continue;
    if (userClean === aliasClean) return true;
    // A partial answer, like "mahome" for "mahomes". Not whole words with one left off, though:
    // "north carolina" is a different school from North Carolina State.
    const aliasWords = aliasClean.split(' ');
    const droppedWholeWord = userClean.split(' ').every((w) => aliasWords.includes(w)) && userClean.split(' ').length < aliasWords.length;
    if (userClean.length >= 3 && aliasClean.includes(userClean) && userClean.length >= aliasClean.length * 0.7 && !droppedWholeWord) return true;
    // Extra words around an alias are fine ("kc chiefs"), but not a different first name
    // ("emmitt smith" when the answer is Malcolm Smith).
    if (userClean.includes(aliasClean) && userClean.length >= 3) {
      const extra = userClean.split(' ').filter((w) => !aliasClean.split(' ').includes(w));
      if (extra.every((w) => correctWords.has(w) || w.length <= 2)) return true;
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

// ===========================================================================
// SPOKEN ANSWERS (voice input)
// ===========================================================================

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12,
};

/** Lowercases, strips punctuation and filler words, and turns number words into digits. */
function normalizeSpoken(s: string): string {
  const words = s
    .toLowerCase()
    .replace(/\b49ers\b/g, 'niners')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['the', 'a', 'an', 'um', 'uh', 'is', 'its', 'i', 'think', 'say', 'round', 'number', 'to', 'and'].includes(w));
  const out: string[] = [];
  for (const w of words) {
    const n = NUMBER_WORDS[w];
    const prev = out.length ? Number(out[out.length - 1]) : NaN;
    // "twenty nine" -> 29
    if (n !== undefined && n < 10 && !isNaN(prev) && prev >= 20 && prev % 10 === 0) {
      out[out.length - 1] = String(prev + n);
    } else if (n !== undefined) {
      out.push(String(n));
    } else {
      out.push(w.replace(/(st|nd|rd|th)$/, (m) => (/^\d+/.test(w) ? '' : m)));
    }
  }
  return out.join(' ');
}

function spokenScore(heard: string, option: string): number {
  const h = normalizeSpoken(heard);
  const o = normalizeSpoken(option);
  if (!h || !o) return 0;
  if (h === o) return 1;
  // Numeric options ("13", "Round 6", "29-13") must match their digits exactly.
  if (/^[\d\s]+$/.test(o)) return h.split(' ').join(' ') === o || h.replace(/\s/g, '') === o.replace(/\s/g, '') ? 1 : 0;
  const hTokens = new Set(h.split(' '));
  const oTokens = o.split(' ').filter((t) => t.length >= 3);
  const tokenHits = oTokens.length ? oTokens.filter((t) => hTokens.has(t)).length / oTokens.length : 0;
  // Saying only a last name or a nickname ("Mahomes", "Chiefs") counts as a strong match.
  const lastWord = o.split(' ').pop() || '';
  const lastHit = lastWord.length >= 3 && hTokens.has(lastWord) ? 0.85 : 0;
  return Math.max(calculateSimilarity(h, o), tokenHits, lastHit);
}

/**
 * Picks the multiple-choice option a player said out loud. `heard` holds the speech
 * recognizer's guesses, best first. Returns null when nothing matches clearly enough.
 */
export function matchSpokenOption(heard: string[], options: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  let runnerUp = 0;
  for (const option of options) {
    const score = Math.max(0, ...heard.map((h) => spokenScore(h, option)));
    if (score > bestScore) {
      runnerUp = bestScore;
      bestScore = score;
      best = option;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }
  return best && bestScore >= 0.6 && bestScore - runnerUp >= 0.1 ? best : null;
}

/**
 * For typed-answer mode: picks which of the recognizer's guesses to submit. Prefers a
 * guess that the fuzzy checker accepts, since recognizers often mishear names on the first try.
 */
export function pickSpokenTypedAnswer(heard: string[], clue: QuestionClue, threshold = 0.75): string {
  const cleaned = heard.map((h) => h.trim()).filter(Boolean);
  const numeric = cleaned.map((h) => normalizeSpoken(h));
  for (let i = 0; i < cleaned.length; i++) {
    if (checkTypedAnswer(cleaned[i], clue, threshold)) return cleaned[i];
    if (checkTypedAnswer(numeric[i], clue, threshold)) return numeric[i];
  }
  return cleaned[0] || '';
}
