// Daily Drive: five questions a day, $200 to $1,000, the same five for everyone on the same
// day, played solo on any device. One try per day; the result and the streak are kept on
// this device, and the share text shows how the drive went without giving the answers away.

const STORAGE_KEY = 'sports_arena_daily_drive_v1';
export const DAILY_DRIVE_LENGTH = 5;

/** The day as YYYY-MM-DD in this device's time zone. */
export function dayKey(date = new Date()): string {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DailyResult {
  day: string;
  /** Right or wrong for each of the five questions, cheapest first. */
  right: boolean[];
}

type Saved = Record<string, boolean[]>;

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

export function savedDailyResult(day = dayKey()): DailyResult | null {
  const right = load()[day];
  return Array.isArray(right) && right.length === DAILY_DRIVE_LENGTH ? {day, right: right.map(Boolean)} : null;
}

export function saveDailyResult(result: DailyResult): void {
  try {
    const all = load();
    all[result.day] = result.right;
    // Keep about a year.
    const keys = Object.keys(all).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete all[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

/** Days in a row played, up to and including `day` (or ending yesterday, if today isn't played yet). */
export function dailyStreak(day = dayKey()): number {
  const all = load();
  const d = new Date(`${day}T12:00:00`);
  if (!all[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (all[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Money won: $200 for the first question up to $1,000 for the fifth. */
export const dailyMoney = (right: boolean[]) => right.reduce((sum, ok, i) => sum + (ok ? (i + 1) * 200 : 0), 0);

/** "Daily Drive Nov 13 · 🟩🟩🟥🟩⬛ · $2,200 of $3,000 · 4-day streak" plus the link. */
export function dailyShareText(result: DailyResult, streak: number, link: string): string {
  const date = new Date(`${result.day}T12:00:00`).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  const squares = result.right.map((ok) => (ok ? '🟩' : '🟥')).join('');
  const lines = [
    `🏈 Daily Drive ${date}`,
    `${squares}  $${dailyMoney(result.right).toLocaleString()} of $3,000`,
    ...(streak > 1 ? [`🔥 ${streak}-day streak`] : []),
    link,
  ];
  return lines.join('\n');
}
