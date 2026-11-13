// Question freshness: which questions this group has been shown, and when.
//
// Every device (host, phones, stream screen) remembers each question it was shown and the day
// it was shown. When a phone joins, it hands its history to the host, and the host hands the
// group's history back, so whichever device hosts next holds back what the group saw recently.
//
// Dealing prefers, in order: questions never seen, then ones seen more than HOLD_BACK_DAYS ago
// (oldest first), and only then questions seen recently (oldest first), so a board always fills.
//
// The people a question was about are remembered the same way, for PEOPLE_HOLD_BACK_DAYS, so a
// player who came up last week waits a few weeks before the group gets another clue about him.
// And each device remembers the columns of the last game it hosted, so the next one deals others.

const STORAGE_KEY = 'sports_arena_question_history_v1';
// The old per-device list (no dates). Read once and folded in as seen today.
const OLD_SEEN_KEY = 'sports_arena_seen_hashes_v20';
const OLD_COUNT_KEY = 'sports_arena_seen_count_v20';

/** A question seen within this many days is held back while anything fresher fits. */
export const HOLD_BACK_DAYS = 90;
/** History older than this is forgotten. */
const KEEP_DAYS = 365;
/** A person the group was asked about within this many days is held back while a clue about someone else fits. */
export const PEOPLE_HOLD_BACK_DAYS = 21;
/** People are kept in the same history as questions, under this prefix ("p:tombrady"). */
const PERSON = 'p:';
const LAST_COLUMNS_KEY = 'sports_arena_last_columns_v1';
/** The last game's columns stop mattering after this many days. */
const LAST_COLUMNS_DAYS = 30;

/** Day number (days since 1970, local time) a question was last shown, by question id. */
const lastShown = new Map<string, number>();
let hydrated = false;

/** What travels between devices: question ids grouped by the day they were last shown. */
export type SharedHistory = Record<string, string[]>;

export function today(now = Date.now()): number {
  const d = new Date(now);
  return Math.floor((now - d.getTimezoneOffset() * 60000) / 86400000);
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const ls = storage();
  if (!ls) return;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (raw) addShared(JSON.parse(raw));
    const old = ls.getItem(OLD_SEEN_KEY);
    if (old) {
      // We don't know when these were seen, so treat them as seen today: held back for a while.
      const ids: unknown = JSON.parse(old);
      const day = today();
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string' && !lastShown.has(id)) lastShown.set(id, day);
      ls.removeItem(OLD_SEEN_KEY);
      ls.removeItem(OLD_COUNT_KEY);
      save();
    }
  } catch {}
}

function save(): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(exportHistory()));
  } catch {}
}

/** Folds a shared history in, keeping the later day for a question both sides know. Returns how many questions were new or newer. */
function addShared(history: unknown): number {
  if (!history || typeof history !== 'object') return 0;
  const now = today();
  let changed = 0;
  for (const [dayKey, ids] of Object.entries(history as Record<string, unknown>)) {
    const day = Math.min(Number(dayKey), now); // a phone with its clock set ahead can't hold a question back forever
    if (!Number.isFinite(day) || now - day > KEEP_DAYS || !Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== 'string' || id.length > 64) continue;
      const had = lastShown.get(id);
      if (had === undefined || had < day) {
        lastShown.set(id, day);
        changed++;
      }
    }
  }
  return changed;
}

/** Records that these questions were just shown on this device. */
export function markShown(ids: string[], now = Date.now()): void {
  hydrate();
  const day = today(now);
  let changed = false;
  for (const id of ids) {
    if (lastShown.get(id) === day) continue;
    lastShown.set(id, day);
    changed = true;
  }
  if (changed) save();
}

/** This device's history to hand to another device (only the last year). */
export function exportHistory(): SharedHistory {
  hydrate();
  const now = today();
  const out: SharedHistory = {};
  for (const [id, day] of lastShown) {
    if (now - day > (id.startsWith(PERSON) ? PEOPLE_HOLD_BACK_DAYS : KEEP_DAYS)) continue;
    (out[day] ||= []).push(id);
  }
  return out;
}

/** Records that the group was just asked about these people (normalized names). */
export function markPeopleShown(names: string[], now = Date.now()): void {
  markShown(names.map((n) => PERSON + n), now);
}

/** True if the group was asked about this person within PEOPLE_HOLD_BACK_DAYS. */
export function isPersonHeldBack(name: string, now = today()): boolean {
  const day = lastShownDay(PERSON + name);
  return day !== undefined && now - day < PEOPLE_HOLD_BACK_DAYS;
}

/** Remembers the columns of the game being played on this device. */
export function rememberColumns(ids: string[]): void {
  try {
    storage()?.setItem(LAST_COLUMNS_KEY, JSON.stringify({day: today(), ids}));
  } catch {}
}

/** The columns of the last game played on this device (empty when that was long ago). */
export function lastGameColumns(): Set<string> {
  try {
    const saved = JSON.parse(storage()?.getItem(LAST_COLUMNS_KEY) ?? 'null');
    if (saved && Array.isArray(saved.ids) && today() - Number(saved.day) <= LAST_COLUMNS_DAYS) return new Set(saved.ids.filter((id: unknown) => typeof id === 'string'));
  } catch {}
  return new Set();
}

/** Adds another device's history to this one's and saves it. Returns how many questions it added or moved forward. */
export function mergeHistory(history: unknown): number {
  hydrate();
  const changed = addShared(history);
  if (changed) save();
  return changed;
}

/** The day a question was last shown to this group, or undefined if never. */
export function lastShownDay(id: string): number | undefined {
  hydrate();
  return lastShown.get(id);
}

/** True if the group was shown this question within HOLD_BACK_DAYS. */
export function isHeldBack(id: string, now = today()): boolean {
  const day = lastShownDay(id);
  return day !== undefined && now - day < HOLD_BACK_DAYS;
}

/** How many questions this group has been shown (within the last year). */
export function shownCount(): number {
  hydrate();
  const now = today();
  let n = 0;
  for (const [id, day] of lastShown) if (!id.startsWith(PERSON) && now - day <= KEEP_DAYS) n++;
  return n;
}

/** How many questions are being held back right now. */
export function heldBackCount(): number {
  hydrate();
  const now = today();
  let n = 0;
  for (const [id, day] of lastShown) if (!id.startsWith(PERSON) && now - day < HOLD_BACK_DAYS) n++;
  return n;
}

export function resetHistory(): void {
  lastShown.clear();
  hydrated = true;
  const ls = storage();
  try {
    ls?.removeItem(STORAGE_KEY);
    ls?.removeItem(LAST_COLUMNS_KEY);
    ls?.removeItem(OLD_SEEN_KEY);
    ls?.removeItem(OLD_COUNT_KEY);
  } catch {}
}

/**
 * Orders questions freshest first: never seen (in the order given, so pass them shuffled),
 * then seen longest ago. Sorting is stable, so equal days keep the given (shuffled) order.
 */
export function freshestFirst<T extends {id: string}>(items: T[]): T[] {
  hydrate();
  const rank = (q: T) => lastShown.get(q.id) ?? -1;
  return [...items].sort((a, b) => rank(a) - rank(b));
}
