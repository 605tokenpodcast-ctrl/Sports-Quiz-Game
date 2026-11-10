// Questions the host flags with the "Bad question" button. A flagged question never comes up
// on this device again, and sending the list to GitHub (as an issue) lets the weekly question
// refresh leave it out for everyone.

const KEY = 'sports_arena_flagged_questions_v1';
const REPO = 'https://github.com/605tokenpodcast-ctrl/Sports-Quiz-Game';
/** Issues with this title, opened by the repo owner, are read by the weekly refresh. */
export const REPORT_TITLE = 'Bad questions';

export interface FlaggedQuestion {
  id: string;
  clue: string;
  answer: string;
  category: string;
  /** Already included in an issue sent to GitHub. */
  sent?: boolean;
}

function read(): FlaggedQuestion[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((q) => q && typeof q.id === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: FlaggedQuestion[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-500)));
  } catch {
    // Storage full or blocked: the flag lasts until the page closes.
  }
}

let cache: FlaggedQuestion[] | null = null;
const all = () => (cache ??= read());

export const flaggedQuestions = (): FlaggedQuestion[] => [...all()];
export const flaggedIds = (): Set<string> => new Set(all().map((q) => q.id));
export const isFlagged = (id: string) => all().some((q) => q.id === id);

/** Flags a question (or un-flags it when it is already flagged). Returns whether it is flagged now. */
export function toggleFlag(q: {id: string; clue: string; correctAnswer: string; category: string}): boolean {
  const list = all();
  const at = list.findIndex((x) => x.id === q.id);
  if (at >= 0) {
    cache = list.filter((_, i) => i !== at);
    write(cache);
    return false;
  }
  cache = [...list, {id: q.id, clue: q.clue, answer: q.correctAnswer, category: q.category}];
  write(cache);
  return true;
}

/** Flags not yet sent to GitHub. */
export const unsentFlags = () => all().filter((q) => !q.sent);

/** A link that opens a new GitHub issue listing these questions (at most 25, to keep the link short). */
export function reportUrl(list: FlaggedQuestion[]): string {
  const lines = list.slice(0, 25).map((q) => `- ${q.id} | ${q.category} | ${q.clue} | Answer: ${q.answer}`);
  const body = `Flagged with the Bad question button during a game. The weekly question refresh leaves these out.\n\n${lines.join('\n')}`;
  return `${REPO}/issues/new?title=${encodeURIComponent(REPORT_TITLE)}&body=${encodeURIComponent(body)}`;
}

/** Marks these flags as sent, so the next report only lists new ones. */
export function markSent(list: FlaggedQuestion[]): void {
  const ids = new Set(list.slice(0, 25).map((q) => q.id));
  cache = all().map((q) => (ids.has(q.id) ? {...q, sent: true} : q));
  write(cache);
}
