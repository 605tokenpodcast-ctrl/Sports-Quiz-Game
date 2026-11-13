// Your own column, from a Google Sheet: the host pastes the sheet's link on the start screen,
// and every game on that device deals the column in Round 1.
//
// The sheet needs a header row with Clue and Answer columns. Wrong 1, Wrong 2, ... (wrong
// answers for multiple choice) and Level (1 easy to 5 hard) are optional. Without levels,
// the rows go from easy at the top to hard at the bottom. Share the sheet as "Anyone with
// the link can view" (or File > Share > Publish to web).
import type {CategorySpec} from '../triviaEngine';

export const CUSTOM_COLUMN_ID = 'nfl_custom_column';
const STORAGE_KEY = 'sports_arena_custom_column_v1';

export interface CustomColumnSettings {
  url: string;
  title: string;
}

/** The address that returns the sheet as CSV, or null if this isn't a Google Sheets link. */
export function sheetCsvUrl(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.hostname !== 'docs.google.com' || !u.pathname.startsWith('/spreadsheets/d/')) return null;
  const gid = u.searchParams.get('gid') ?? u.hash.match(/gid=(\d+)/)?.[1];
  // Published to the web: /spreadsheets/d/e/<id>/pubhtml or /pub
  const published = u.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)/);
  if (published) return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
  // Shared with a link: /spreadsheets/d/<id>/edit
  const shared = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
  if (shared) return `https://docs.google.com/spreadsheets/d/${shared[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
  return null;
}

/** Splits CSV text into rows of cells (quoted cells may hold commas, quotes and line breaks). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Turns the sheet's rows into a column. Throws with a message for the host when the sheet can't be used. */
export function columnFromRows(rows: string[][], title: string): CategorySpec {
  if (!rows.length) throw new Error('The sheet is empty.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const clueCol = find('clue', 'question');
  const answerCol = find('answer');
  if (clueCol < 0 || answerCol < 0) throw new Error('The first row needs a Clue column and an Answer column.');
  const levelCol = find('level', 'difficulty');
  const wrongCols = header.map((h, i) => (/^(wrong|distractor|choice|option)/.test(h) ? i : -1)).filter((i) => i >= 0);
  const body = rows.slice(1).filter((r) => (r[clueCol] ?? '').trim() && (r[answerCol] ?? '').trim());
  if (body.length < 3) throw new Error('The sheet needs at least 3 clues (5 for a full game).');
  return {
    id: CUSTOM_COLUMN_ID,
    title: title.trim() || 'Our Column',
    sport: 'NFL',
    description: 'A column written by the host.',
    entries: body.map((r, i) => {
      const level = Number((r[levelCol] ?? '').trim());
      return {
        id: `custom_${hash(`${r[clueCol]}|${r[answerCol]}`)}`,
        clue: r[clueCol].trim(),
        answer: r[answerCol].trim(),
        distractors: wrongCols.map((c) => (r[c] ?? '').trim()).filter(Boolean),
        // No level given: top rows are the cheap tiles, bottom rows the expensive ones.
        difficulty: level >= 1 && level <= 5 ? Math.round(level) : 1 + Math.floor((i * 5) / body.length),
      };
    }),
  };
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Downloads the sheet and turns it into a column. */
export async function loadCustomColumn(settings: CustomColumnSettings): Promise<CategorySpec> {
  const csv = sheetCsvUrl(settings.url);
  if (!csv) throw new Error('That is not a Google Sheets link.');
  let res: Response;
  try {
    res = await fetch(csv, {cache: 'no-cache'});
  } catch {
    throw new Error("Couldn't reach the sheet. Check the link and your connection.");
  }
  if (!res.ok) throw new Error('Google refused the sheet. Share it as "Anyone with the link can view".');
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error('Google sent a sign-in page. Share the sheet as "Anyone with the link can view".');
  return columnFromRows(parseCsv(text), settings.title);
}

export function savedCustomColumn(): CustomColumnSettings | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return saved && typeof saved.url === 'string' ? {url: saved.url, title: String(saved.title ?? '')} : null;
  } catch {
    return null;
  }
}

export function saveCustomColumn(settings: CustomColumnSettings | null): void {
  try {
    if (settings) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
