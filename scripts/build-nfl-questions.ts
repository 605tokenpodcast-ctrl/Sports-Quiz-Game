/**
 * Builds the NFL question bank from nflverse open data (CC BY 4.0).
 *
 * Downloads the latest nflverse CSVs (draft picks, game results, player stats,
 * rosters, combine, trades), turns the facts into multiple-choice questions,
 * and writes public/questions/nfl.json for the game to load at runtime.
 *
 * Re-run it each week during the season and the "this season" categories pick
 * up the newest games. Question ids are stable hashes of the underlying fact,
 * so a device's "already seen" memory keeps working across rebuilds.
 *
 *   npx tsx scripts/build-nfl-questions.ts            # download fresh data
 *   npx tsx scripts/build-nfl-questions.ts --offline  # reuse .cache/nflverse
 */

import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { collegeName } from '../colleges';
import { bigPlays, clockText, comebacks, PBP_COLUMNS, type BigPlay, type Play } from './big-plays';
import { seasonHistory, type SeasonHistory } from './history';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'nflverse');
const OUT = join(ROOT, 'public', 'questions', 'nfl.json');
const OFFLINE = process.argv.includes('--offline');
// Big plays and comebacks of finished seasons, boiled down from play-by-play once (see history.ts).
const HISTORY_FILE = join(ROOT, 'scripts', 'data', 'history.json');
const REBUILD_HISTORY = process.argv.includes('--history');

/**
 * Question ids to leave out: flagged with the game's Bad question button. The weekly refresh
 * collects them from the owner's "Bad questions" GitHub issues into .cache/skip-ids.txt;
 * scripts/skip-questions.txt holds any added by hand. Ids are the "nfl_..." ones in nfl.json.
 */
const SKIP_IDS = new Set(
  [join(dirname(fileURLToPath(import.meta.url)), 'skip-questions.txt'), join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'skip-ids.txt')]
    .filter((f) => existsSync(f))
    .flatMap((f) => readFileSync(f, 'utf8').match(/nfl_[0-9a-f]{12}/g) ?? [])
);

const RELEASES = 'https://github.com/nflverse/nflverse-data/releases/download';
const NFLDATA = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data';

type Row = Record<string, string>;

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadCsv(file: string, url: string): Promise<Row[]> {
  const path = join(CACHE, file);
  if (!OFFLINE || !existsSync(path)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return parse(readFileSync(path), { columns: true, skip_empty_lines: true, relax_quotes: true });
}

/** Play-by-play comes gzipped (~10 MB a season); only the columns big-plays.ts uses are kept. */
async function loadPlayByPlay(season: number): Promise<Play[]> {
  const file = `pbp_${season}.csv.gz`;
  const path = join(CACHE, file);
  try {
    if (!OFFLINE || !existsSync(path)) {
      const res = await fetch(`${RELEASES}/pbp/play_by_play_${season}.csv.gz`);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    }
    const keep = new Set<string>(PBP_COLUMNS);
    return parse(gunzipSync(readFileSync(path)), {
      columns: (header: string[]) => header.map((h) => (keep.has(h) ? h : false)),
      skip_empty_lines: true,
      relax_quotes: true,
    });
  } catch (e) {
    // Big plays are a bonus: without play-by-play the weekly column still gets its other storylines.
    console.warn(`No play-by-play for ${season}: ${(e as Error).message}`);
    return [];
  }
}

/** A gzipped CSV, or nothing when it can't be had (these feed bonus columns only). */
async function loadGzCsvIfExists(file: string, url: string): Promise<Row[]> {
  const path = join(CACHE, file);
  try {
    if (!OFFLINE || !existsSync(path)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    }
    return parse(gunzipSync(readFileSync(path)), { columns: true, skip_empty_lines: true, relax_quotes: true });
  } catch (e) {
    console.warn(`No ${file}: ${(e as Error).message}`);
    return [];
  }
}

/**
 * The players fantasy managers added most on Sleeper over the last week, most added first
 * (Sleeper's public API, no key needed). Empty when Sleeper can't be reached, and then the
 * Waiver Wire column is simply left out until the next build.
 */
async function loadSleeperTrending(): Promise<{ player_id: string; count: number }[]> {
  const path = join(CACHE, 'sleeper_trending.json');
  try {
    if (!OFFLINE || !existsSync(path)) {
      const res = await fetch('https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=168&limit=40');
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    }
    const rows = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(rows) ? rows.filter((r) => r && r.player_id).map((r) => ({ player_id: String(r.player_id), count: Number(r.count) || 0 })) : [];
  } catch (e) {
    console.warn(`No Sleeper trending list: ${(e as Error).message}`);
    return [];
  }
}

async function loadCsvIfExists(file: string, url: string): Promise<Row[]> {
  try {
    return await loadCsv(file, url);
  } catch {
    return [];
  }
}

// Stadiums whose newest name in the source data is wrong (it lists the Texans' 2026 games at
// "Reliant Stadium", the name before 2014).
const STADIUM_NAME_NOW: Record<string, string> = { HOU00: 'NRG Stadium' };

// Known spelling mistakes in the source data.
const NAME_FIXES: Record<string, string> = { 'Klint Kubliak': 'Klint Kubiak' };

function fixNames(rows: Row[]): Row[] {
  for (const r of rows) for (const k in r) if (NAME_FIXES[r[k]]) r[k] = NAME_FIXES[r[k]];
  return rows;
}

const num = (s: string | undefined) => (s === undefined || s === '' || s === 'NA' ? NaN : Number(s));

// ---------------------------------------------------------------------------
// Team names by era
// ---------------------------------------------------------------------------

const FIXED_TEAMS: Record<string, string> = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BUF: 'Buffalo Bills', CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers', GNB: 'Green Bay Packers',
  IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs', KAN: 'Kansas City Chiefs',
  MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings', NE: 'New England Patriots', NWE: 'New England Patriots',
  NO: 'New Orleans Saints', NOR: 'New Orleans Saints', NYG: 'New York Giants', NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers',
  SFO: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TAM: 'Tampa Bay Buccaneers',
  LAC: 'Los Angeles Chargers', SD: 'San Diego Chargers', SDG: 'San Diego Chargers',
  LA: 'Los Angeles Rams', LAR: 'Los Angeles Rams', RAM: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders', LVR: 'Las Vegas Raiders', RAI: 'Los Angeles Raiders', PHO: 'Phoenix Cardinals',
};

/** Team name for an nflverse or Pro Football Reference code in a given season. */
function teamName(code: string, season: number): string {
  switch (code) {
    case 'WAS':
      return season <= 2019 ? 'Washington Redskins' : season <= 2021 ? 'Washington Football Team' : 'Washington Commanders';
    case 'OAK':
      return 'Oakland Raiders';
    case 'STL':
      return season <= 1987 ? 'St. Louis Cardinals' : 'St. Louis Rams';
    case 'HOU':
      return season <= 1996 ? 'Houston Oilers' : 'Houston Texans';
    case 'TEN':
      return season <= 1998 ? 'Tennessee Oilers' : 'Tennessee Titans';
    case 'BAL':
      return season <= 1983 ? 'Baltimore Colts' : 'Baltimore Ravens';
    case 'ARI':
      return season <= 1993 ? 'Phoenix Cardinals' : 'Arizona Cardinals';
  }
  const name = FIXED_TEAMS[code];
  if (!name) throw new Error(`Unknown team code ${code} (${season})`);
  return name;
}

/** Teams that moved keep their games: the Rams' data code is LA in every season, but a 1999 home game is listed under STL. */
const FRANCHISE: Record<string, string> = { STL: 'LA', LAR: 'LA', SD: 'LAC', OAK: 'LV' };
const franchise = (code: string) => FRANCHISE[code] ?? code;

const nickname = (full: string) =>
  full === 'Washington Football Team' ? 'Football Team' : full.split(' ').slice(-1)[0];

const AFC = new Set(['BAL', 'BUF', 'CIN', 'CLE', 'DEN', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'OAK', 'LAC', 'SD', 'MIA', 'NE', 'NYJ', 'PIT', 'TEN']);
const conference = (code: string, season: number) => (AFC.has(code) || (code === 'SEA' && season < 2002) ? 'AFC' : 'NFC');

function teamsInSeason(season: number, games: Row[]): string[] {
  const codes = new Set<string>();
  for (const g of games) if (num(g.season) === season) codes.add(g.home_team), codes.add(g.away_team);
  return [...codes].map((c) => teamName(c, season));
}

// ---------------------------------------------------------------------------
// Question building helpers
// ---------------------------------------------------------------------------

interface Entry {
  id: string;
  clue: string;
  answer: string;
  distractors: string[];
  aliases: string[];
  difficulty: number;
  /** Who Am I?: the clue split into hints, hardest first, shown one at a time in a game. */
  hints?: string[];
  /** How hard it is next to the rest of its column (not written to the bank). */
  rank?: number;
}

interface Category {
  id: string;
  title: string;
  sport: 'NFL';
  description: string;
  entries: Entry[];
}

const categories = new Map<string, Category>();

function category(id: string, title: string, description: string): Category {
  let c = categories.get(id);
  if (!c) {
    c = { id: `nfl_${id}`, title, sport: 'NFL', description, entries: [] };
    categories.set(id, c);
  }
  return c;
}

const clamp = (d: number) => Math.max(1, Math.min(5, Math.round(d)));

/** One of a few phrasings, the same one on every rebuild, so a column's clues don't all sound alike. */
const pick = <T,>(key: string, options: T[]): T => options[parseInt(createHash('sha1').update(key).digest('hex').slice(0, 6), 16) % options.length];
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** "an 85-yard", "an 11-yard", "a 90-yard": numbers that start with a vowel sound take "an". */
const fixArticles = (text: string) => text.replace(/\b([Aa]) (8\d*|11|18)(?=[- ])/g, '$1n $2');

// How well known each player and coach is, from 0 (a household name) to 3 (a deep cut).
// Filled in main() from career value, Pro Bowls, starts and seasons coached. A clue about a
// star is an easier clue, so the cheap tiles of a column are its famous names.
const fameByName = new Map<string, number>();
const setFame = (name: string, fame: number) => {
  if (name && fame < (fameByName.get(name) ?? 9)) fameByName.set(name, fame);
};
const fameOf = (name: string) => fameByName.get(name) ?? 2.5;
/** The best-known person a clue names (3 when it names nobody we know). */
function clueFame(clue: string): number {
  let best = 3;
  for (const run of clue.match(/[A-Z][A-Za-z.'\-]+(?: [A-Z][A-Za-z.'\-]+){1,3}/g) ?? []) {
    const words = run.split(' ');
    for (let i = 0; i < words.length; i++)
      for (let j = i + 2; j <= Math.min(words.length, i + 4); j++) {
        const f = fameByName.get(words.slice(i, j).join(' '));
        if (f !== undefined && f < best) best = f;
      }
  }
  return best;
}
const hashId = (key: string) => 'nfl_' + createHash('sha1').update(key).digest('hex').slice(0, 12);

function shuffle<T>(items: T[], seed: string): T[] {
  // Seeded so rebuilding with the same data gives the same distractors.
  let h = parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Picks up to 7 distractors: preferred ones first, then the rest of the pool. */
function pickDistractors(answer: string, preferred: string[], pool: string[], key: string): string[] {
  const out: string[] = [];
  const seen = new Set([answer.toLowerCase()]);
  for (const d of [...preferred, ...shuffle(pool, key)]) {
    const k = d.toLowerCase();
    if (!d || seen.has(k)) continue;
    seen.add(k);
    out.push(d);
    if (out.length === 7) break;
  }
  return out;
}

function nameAliases(name: string): string[] {
  const parts = name.replace(/\b(Jr\.|Sr\.|II|III|IV)$/, '').trim().split(' ');
  return [name, parts[parts.length - 1]];
}

// Cities with more than one team: "New York" alone doesn't say Giants or Jets.
const SHARED_CITIES = new Set(['New York', 'Los Angeles']);

function teamAliases(full: string): string[] {
  const city = full.replace(` ${nickname(full)}`, '');
  return [full, nickname(full), ...(SHARED_CITIES.has(city) ? [] : [city])];
}

/** A wrong answer the clue already names is a free elimination ("beat the Titans" offering the Titans). */
function namedInClue(clue: string, d: string): boolean {
  const words = (x: string) => ` ${x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const shown = words(clue);
  if (d.length > 3 && shown.includes(words(d))) return true;
  // A team the clue calls by its nickname ("beating the Eagles").
  const nick = d.split(' ').slice(-1)[0];
  return d.includes(' ') && TEAM_WORDS.has(nick) && shown.includes(words(nick));
}
const TEAM_WORDS = new Set(['Cardinals', 'Falcons', 'Ravens', 'Bills', 'Panthers', 'Bears', 'Bengals', 'Browns', 'Cowboys', 'Broncos', 'Lions', 'Packers', 'Texans', 'Colts', 'Jaguars', 'Chiefs', 'Raiders', 'Chargers', 'Rams', 'Dolphins', 'Vikings', 'Patriots', 'Saints', 'Giants', 'Jets', 'Eagles', 'Steelers', '49ers', 'Seahawks', 'Buccaneers', 'Titans', 'Commanders', 'Redskins', 'Oilers']);

function add(
  cat: Category,
  key: string,
  clue: string,
  answer: string,
  distractors: string[],
  difficulty: number,
  aliases: string[] = [answer]
) {
  // Questions flagged as bad in a game (see SKIP_IDS) are left out, and so is anything the data has no answer for.
  if (SKIP_IDS.has(hashId(key)) || !answer || !answer.trim()) return;
  // Nothing the clue names, and no Round 1 for a player who "lasted until" a later round.
  distractors = distractors.filter((d) => !namedInClue(clue, d) && !(/lasted until this round/.test(clue) && d === 'Round 1'));
  if (distractors.length < 3) return; // not enough plausible wrong answers to ask it fairly
  // A star's name is easier to come up with than a role player's, and a clue that names a
  // star ("Tom Brady and this team") is easier than one that names nobody.
  const answerFame = fameByName.get(answer);
  const rank = difficulty + (answerFame !== undefined ? (answerFame - 1.5) * 0.9 : (clueFame(clue) - 2) * 0.4);
  // Tidy what the data leaves behind: "Orlando Brown Jr..", a name with a trailing space.
  clue = fixArticles(clue).replace(/\s{2,}/g, ' ').replace(/ ([.,])/g, '$1').replace(/\.\.(?!\.)/g, '.');
  answer = answer.trim();
  cat.entries.push({
    id: hashId(key),
    clue,
    answer,
    distractors,
    aliases: [...new Set(aliases.map((a) => a.toLowerCase()))],
    difficulty: clamp(difficulty),
    rank,
  });
}

/** "the Georgia Dome", "the Rose Bowl", but "Raymond James Stadium". */
function theStadium(name: string): string {
  return /(Dome|Superdome|Metrodome|Bowl|Coliseum)$/.test(name) && !/^The /.test(name) ? `the ${name}` : name;
}

function roman(n: number): string {
  if (n === 50) return '50';
  const map: [number, string][] = [[90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) (out += s), (n -= v);
  return out;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Older facts are harder. */
function ageDifficulty(season: number, latest: number, base: number): number {
  const age = latest - season;
  return base + (age <= 5 ? 0 : age <= 12 ? 1 : 2);
}

/** Sorted leaders for a stat; returns null when the top spot is tied or too close to call. */
function leaders<T>(rows: T[], value: (r: T) => number, minGap: number): T[] | null {
  const sorted = rows.filter((r) => value(r) > 0).sort((a, b) => value(b) - value(a));
  if (sorted.length < 4 || value(sorted[0]) - value(sorted[1]) < minGap) return null;
  return sorted;
}

// ---------------------------------------------------------------------------
// Jeopardy-style wording
// ---------------------------------------------------------------------------

// Clues are statements with a "this" in them, like a game-show board, and they
// give two or three hints (team, college, numbers) instead of a bare fact.

const POSITION_WORDS: Record<string, string> = {
  QB: 'quarterback', RB: 'running back', FB: 'fullback', WR: 'receiver', TE: 'tight end',
  T: 'tackle', G: 'guard', C: 'center', OL: 'offensive lineman', DE: 'defensive end', DT: 'defensive tackle',
  NT: 'nose tackle', DL: 'defensive lineman', LB: 'linebacker', OLB: 'linebacker', ILB: 'linebacker',
  DB: 'defensive back', CB: 'cornerback', S: 'safety', SAF: 'safety', FS: 'safety', SS: 'safety',
  K: 'kicker', P: 'punter', LS: 'long snapper',
};
const posWord = (pos: string) => POSITION_WORDS[pos] ?? 'player';

/** Positions that make fair wrong answers for each other. */
const POSITION_GROUPS: Record<string, string> = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', T: 'OL', G: 'OL', C: 'OL', OL: 'OL',
  DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', LB: 'LB', OLB: 'LB', ILB: 'LB',
  DB: 'DB', CB: 'DB', S: 'DB', SAF: 'DB', FS: 'DB', SS: 'DB',
};
const posGroup = (pos: string) => POSITION_GROUPS[pos] ?? pos;

const fmt = (n: number) => n.toLocaleString('en-US');
const times = (n: number, what: string) => (n === 1 ? `a ${what}` : `${n}-time ${what}`);
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/** "a first-round pick (10th overall)" and friends. */
const ROUND_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
function draftSlot(round: number, pick: number): string {
  if (pick === 1) return 'the No. 1 overall pick';
  const r = ROUND_WORDS[round - 1] ?? ordinal(round);
  return `${r === 'eighth' || r === 'eleventh' ? 'an' : 'a'} ${r}-round pick (${ordinal(pick)} overall)`;
}

/** The headline numbers of a drafted player's career, for "he went on to..." hints. */
function careerFeats(d: Row): string[] {
  const feats: string[] = [];
  const pb = num(d.probowls), ap = num(d.allpro);
  if (d.hof === 'TRUE') feats.push('reached the Hall of Fame');
  if (ap >= 2) feats.push(`was named first-team All-Pro ${ap === 2 ? 'twice' : `${ap} times`}`);
  else if (pb >= 2) feats.push(`made ${pb} Pro Bowls`);
  const group = posGroup(d.position);
  if (group === 'QB' && num(d.pass_yards) >= 15000) feats.push(`threw for ${fmt(num(d.pass_yards))} yards`);
  if (group === 'RB' && num(d.rush_yards) >= 5000) feats.push(`ran for ${fmt(num(d.rush_yards))} yards`);
  if ((group === 'WR' || group === 'TE') && num(d.rec_yards) >= 5000) feats.push(`caught passes for ${fmt(num(d.rec_yards))} yards`);
  if (num(d.def_sacks) >= 40) feats.push(`piled up ${num(d.def_sacks)} sacks`);
  if (num(d.def_ints) >= 25) feats.push(`picked off ${num(d.def_ints)} passes`);
  return feats.slice(0, 2);
}

const joinAnd = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(OFFLINE ? 'Using cached nflverse data' : 'Downloading nflverse data...');
  const [games, draft, combine, trades] = await Promise.all([
    loadCsv('games.csv', `${NFLDATA}/games.csv`),
    loadCsv('draft_picks.csv', `${RELEASES}/draft_picks/draft_picks.csv`),
    loadCsv('combine.csv', `${RELEASES}/combine/combine.csv`),
    loadCsv('trades.csv', `${NFLDATA}/trades.csv`),
  ]);

  fixNames(games);
  // Schools the way a host says them: "Boston College", "Ohio State", "Miami of Ohio".
  for (const d of draft) d.college = collegeName(d.college);
  for (const c of combine) c.school = collegeName(c.school);
  const played = games.filter((g) => g.home_score !== '' && g.away_score !== '');
  const currentSeason = Math.max(...games.map((g) => num(g.season)));
  const lastComplete = Math.max(...played.filter((g) => g.game_type === 'SB').map((g) => num(g.season)));
  const currentWeeks = played.filter((g) => num(g.season) === currentSeason && g.game_type === 'REG').map((g) => num(g.week));
  const throughWeek = currentWeeks.length ? Math.max(...currentWeeks) : 0;
  // Only count the latest week once every game in it is final.
  const weekDone = (w: number) =>
    games.filter((g) => num(g.season) === currentSeason && num(g.week) === w).every((g) => g.home_score !== '');
  const latestFullWeek = weekDone(throughWeek) ? throughWeek : throughWeek - 1;

  const [pbp, rosters, weekStats, ...seasonStats] = await Promise.all([
    currentSeason !== lastComplete ? loadPlayByPlay(currentSeason) : Promise.resolve([] as Play[]),
    loadCsvIfExists(`roster_${currentSeason}.csv`, `${RELEASES}/rosters/roster_${currentSeason}.csv`),
    loadCsvIfExists(`stats_player_week_${currentSeason}.csv`, `${RELEASES}/stats_player/stats_player_week_${currentSeason}.csv`),
    ...Array.from({ length: currentSeason - 1999 + 1 }, (_, i) =>
      loadCsvIfExists(`stats_player_reg_${1999 + i}.csv`, `${RELEASES}/stats_player/stats_player_reg_${1999 + i}.csv`)
    ),
  ]);
  const statsBySeason = new Map<number, Row[]>();
  seasonStats.forEach((rows, i) => statsBySeason.set(1999 + i, rows));
  // Season rosters for every finished season since 1980 (linemen included), used to find the
  // team each player spent most of his career with.
  const ROSTER_FROM = 1980;
  const pastRosters = await Promise.all(
    Array.from({ length: lastComplete - ROSTER_FROM + 1 }, (_, i) =>
      loadCsvIfExists(`roster_${ROSTER_FROM + i}.csv`, `${RELEASES}/rosters/roster_${ROSTER_FROM + i}.csv`)
    )
  );

  // ---- Fame: who the cheap tiles should be about ---------------------------
  for (const d of draft) {
    const av = num(d.w_av) || 0, pb = num(d.probowls) || 0;
    let f = d.hof === 'TRUE' || av >= 100 || pb >= 7 ? 0 : av >= 75 || pb >= 5 ? 0.5 : av >= 55 || pb >= 3 ? 1 : av >= 40 || pb >= 2 ? 1.5 : av >= 25 || pb >= 1 ? 2 : av >= 12 ? 2.5 : 3;
    const group = posGroup(d.position);
    if (group === 'QB' && av >= 25) f -= 0.5;
    else if (group === 'OL') f += 1;
    else if (!['RB', 'WR', 'TE'].includes(group)) f += 0.5;
    if (num(d.season) < 1995) f += 0.5;
    setFame(d.pfr_player_name, Math.max(0, Math.min(3, f)));
  }
  // Undrafted stars and anyone whose name is spelled differently in the draft data.
  const careerPoints = new Map<string, number>();
  for (const rows of seasonStats) for (const r of rows) careerPoints.set(r.player_display_name, (careerPoints.get(r.player_display_name) ?? 0) + (num(r.fantasy_points_ppr) || 0));
  for (const [who, pts] of careerPoints) setFame(who, pts >= 3000 ? 0 : pts >= 2000 ? 0.5 : pts >= 1300 ? 1 : pts >= 800 ? 1.5 : pts >= 400 ? 2 : pts >= 150 ? 2.5 : 3);
  // This season's stars are on everyone's mind.
  [...(seasonStats[seasonStats.length - 1] ?? [])]
    .sort((a, b) => (num(b.fantasy_points_ppr) || 0) - (num(a.fantasy_points_ppr) || 0))
    .slice(0, 40)
    .forEach((r, i) => setFame(r.player_display_name, i < 15 ? 0.5 : 1));
  // Quarterbacks by starts, coaches by seasons on a sideline (a Super Bowl ring helps).
  const startsBy = new Map<string, number>(), coachGames = new Map<string, number>();
  for (const g of games.filter((g) => g.home_score !== '')) {
    for (const side of ['home', 'away']) {
      const qb = g[`${side}_qb_name`], coach = g[`${side}_coach`];
      if (qb) startsBy.set(qb, (startsBy.get(qb) ?? 0) + 1);
      if (coach) coachGames.set(coach, (coachGames.get(coach) ?? 0) + 1);
    }
  }
  for (const [qb, n] of startsBy) setFame(qb, n >= 150 ? 0 : n >= 100 ? 0.5 : n >= 60 ? 1 : n >= 30 ? 1.5 : n >= 12 ? 2 : 2.5);
  const ringCoaches = new Set(games.filter((g) => g.game_type === 'SB' && g.home_score !== '').map((g) => (num(g.home_score) > num(g.away_score) ? g.home_coach : g.away_coach)));
  for (const [coach, n] of coachGames) {
    const f = n >= 240 ? 0 : n >= 160 ? 0.5 : n >= 100 ? 1 : n >= 64 ? 1.5 : n >= 32 ? 2 : 2.5;
    setFame(coach, ringCoaches.has(coach) ? Math.max(0, f - 0.5) : f);
  }

  const name = (g: Row, side: 'home' | 'away') => teamName(g[`${side}_team`], num(g.season));
  const stadiumGames = new Map<string, number>();
  for (const g of played) if (g.stadium) stadiumGames.set(g.stadium, (stadiumGames.get(g.stadium) ?? 0) + 1);

  // Who started at QB and who coached each team, per season, for hints.
  const regGames = played.filter((g) => g.game_type === 'REG');
  const mostCommon = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };
  const sideOf = (g: Row, code: string) => (g.home_team === code ? 'home' : g.away_team === code ? 'away' : null);
  const teamSeasonGames = (s: number, code: string) => regGames.filter((g) => num(g.season) === s && sideOf(g, code));
  const starterOf = (s: number, code: string) => mostCommon(teamSeasonGames(s, code).map((g) => g[`${sideOf(g, code)}_qb_name`]));
  const coachOfSeason = (s: number, code: string) => mostCommon(teamSeasonGames(s, code).map((g) => g[`${sideOf(g, code)}_coach`]))[0]?.[0];

  // ---- Super Bowls --------------------------------------------------------
  const sbCat = category('super_bowl', 'Super Bowl Sunday', 'Champions, quarterbacks, coaches and venues of every Super Bowl since 2000.');
  const sbCoachCat = category('super_bowl_details', 'Big Game Deep Cuts', 'Losing teams, winning coaches, stadiums and final scores.');
  for (const g of played.filter((g) => g.game_type === 'SB')) {
    const season = num(g.season);
    const sb = `Super Bowl ${roman(season - 1965)}`;
    const homeWon = num(g.home_score) > num(g.away_score);
    const [w, l] = homeWon ? ['home', 'away'] as const : ['away', 'home'] as const;
    const winner = name(g, w), loser = name(g, l);
    const ws = num(g[`${w}_score`]), ls = num(g[`${l}_score`]);
    const playoffTeams = [...new Set(played.filter((x) => num(x.season) === season && x.game_type !== 'REG').flatMap((x) => [name(x, 'home'), name(x, 'away')]))];
    const allTeams = teamsInSeason(season, games);
    const key = `sb_${season}`;
    const at = g.stadium ? ` at ${theStadium(g.stadium)}` : '';

    const winQb = g[`${w}_qb_name`], loseQb = g[`${l}_qb_name`];
    add(sbCat, `${key}_winner`, pick(`${key}w`, [
      `This team capped the ${season} season by beating the ${loser} ${ws}-${ls} in ${sb}${at}.`,
      `${sb}${at} ended with this team lifting the Lombardi Trophy after a ${ws}-${ls} win over the ${loser}.`,
      `${winQb ? `${winQb} and this team` : 'This team'} won it all in the ${season} season, topping the ${loser} ${ws}-${ls} in ${sb}.`,
    ]), winner,
      pickDistractors(winner, [], playoffTeams.concat(allTeams).filter((t) => t !== loser), key + 'w'), ageDifficulty(season, lastComplete, 1), teamAliases(winner));
    add(sbCoachCat, `${key}_loser`, pick(`${key}l`, [
      `The ${winner} beat this team ${ws}-${ls} in ${sb}.`,
      `This team came up short in ${sb}, falling ${ws}-${ls} to the ${winner}.`,
      `${loseQb ? `${loseQb} and this team` : 'This team'} lost ${sb} to the ${nickname(winner)}, ${ws}-${ls}.`,
    ]), loser,
      pickDistractors(loser, [], playoffTeams.concat(allTeams), key + 'l'), ageDifficulty(season, lastComplete, 2), teamAliases(loser));

    const qbs = [...new Set(played.filter((x) => num(x.season) === season).flatMap((x) => [x.home_qb_name, x.away_qb_name]).filter(Boolean))];
    if (winQb) add(sbCat, `${key}_qb`, pick(`${key}q`, [
      `He quarterbacked the ${season} ${nickname(winner)} to a ${ws}-${ls} win over the ${nickname(loser)}${loseQb ? ` and ${loseQb}` : ''} in ${sb}.`,
      `${sb} belonged to this quarterback, who led the ${nickname(winner)} past the ${nickname(loser)}, ${ws}-${ls}.`,
    ]), winQb,
      pickDistractors(winQb, [], qbs.filter((q) => q !== loseQb), key + 'q'), ageDifficulty(season, lastComplete, 2), nameAliases(winQb));

    const coaches = [...new Set(played.filter((x) => num(x.season) === season).flatMap((x) => [x.home_coach, x.away_coach]).filter(Boolean))];
    const winCoach = g[`${w}_coach`];
    if (winCoach) add(sbCoachCat, `${key}_coach`,
      pick(`${key}c`, [
        `He was the head coach on the winning sideline when the ${winner} beat the ${nickname(loser)} in ${sb}.`,
        `He got the Gatorade bath after his ${nickname(winner)} won ${sb}, ${ws}-${ls} over the ${nickname(loser)}.`,
      ]), winCoach,
      pickDistractors(winCoach, [g[`${l}_coach`]], coaches, key + 'c'), ageDifficulty(season, lastComplete, 2), nameAliases(winCoach));

    const stadiums = [...stadiumGames.entries()].filter(([, n]) => n >= 40).map(([s]) => s);
    if (g.stadium) add(sbCoachCat, `${key}_venue`, pick(`${key}s`, [
      `${sb}, a ${ws}-${ls} win for the ${nickname(winner)} over the ${nickname(loser)}, was played in this stadium.`,
      `The ${nickname(winner)} and ${nickname(loser)} met for ${sb} in this building, where the ${nickname(winner)} won ${ws}-${ls}.`,
    ]), g.stadium,
      pickDistractors(g.stadium, [], stadiums, key + 's'), ageDifficulty(season, lastComplete, 3));

    const score = (a: number, b: number) => `${a}-${b}`;
    const fakeScores = [[ws + 3, ls], [ws, ls + 7], [ws - 3, ls - 3], [ws + 7, ls + 3], [ws + 4, ls - 3], [ws - 4, ls + 1], [ws + 10, ls + 7]]
      .filter(([a, b]) => b >= 0 && a > b).map(([a, b]) => score(a, b));
    add(sbCoachCat, `${key}_score`, pick(`${key}x`, [
      `The final score of ${sb}, won by the ${winner}${winQb ? ` behind ${winQb}` : ''} over the ${loser}.`,
      `The ${winner} beat the ${loser} in ${sb} by this final score.`,
    ]), score(ws, ls),
      pickDistractors(score(ws, ls), fakeScores, [], key + 'x'), ageDifficulty(season, lastComplete, 4));
  }

  // ---- Conference championships ------------------------------------------
  const conCat = category('conference_title', 'Championship Weekend', 'AFC and NFC Championship Game winners and losers.');
  for (const g of played.filter((g) => g.game_type === 'CON')) {
    const season = num(g.season);
    const homeWon = num(g.home_score) > num(g.away_score);
    const [w, l] = homeWon ? ['home', 'away'] as const : ['away', 'home'] as const;
    const winner = name(g, w), loser = name(g, l);
    const hi = num(g[`${w}_score`]), lo = num(g[`${l}_score`]);
    const conf = conference(g.home_team, season);
    const confTeams = [...new Set(games.filter((x) => num(x.season) === season).flatMap((x) => [x.home_team, x.away_team]))]
      .filter((c) => conference(c, season) === conf).map((c) => teamName(c, season));
    const key = `con_${season}_${conf}`;
    const winQb = g[`${w}_qb_name`];
    add(conCat, `${key}_w`, pick(`${key}w`, [
      `${winQb ? `With ${winQb} at quarterback, this` : 'This'} team won the ${conf} title after the ${season} season, beating the ${nickname(loser)} ${hi}-${lo}.`,
      `The ${conf} Championship Game after the ${season} season went to this team, ${hi}-${lo} winners over the ${nickname(loser)}${winQb ? ` behind ${winQb}` : ''}.`,
    ]), winner,
      pickDistractors(winner, [], confTeams.filter((t) => t !== loser), key + 'w'), ageDifficulty(season, currentSeason, 2), teamAliases(winner));
    add(conCat, `${key}_l`, pick(`${key}l`, [
      `The ${winner} punched their Super Bowl ticket after the ${season} season with a ${hi}-${lo} ${conf} Championship win over this team.`,
      `One win from the Super Bowl, this team lost the ${conf} Championship Game after the ${season} season to the ${winner}, ${hi}-${lo}.`,
    ]), loser,
      pickDistractors(loser, [], confTeams.filter((t) => t !== winner), key + 'l'), ageDifficulty(season, currentSeason, 3), teamAliases(loser));
  }

  // ---- Regular-season records --------------------------------------------
  const recCat = category('records', 'Feast or Famine', 'The best and worst regular seasons of the last 25 years.');
  const records = new Map<string, { w: number; l: number; t: number }>();
  for (const g of regGames) {
    const s = num(g.season);
    for (const side of ['home', 'away'] as const) {
      const k = `${s}|${g[`${side}_team`]}`;
      const r = records.get(k) ?? { w: 0, l: 0, t: 0 };
      const diff = (num(g.home_score) - num(g.away_score)) * (side === 'home' ? 1 : -1);
      diff > 0 ? r.w++ : diff < 0 ? r.l++ : r.t++;
      records.set(k, r);
    }
  }
  /** How a team's season ended: "and went on to win Super Bowl LII", "but lost in the Divisional round", "but missed the playoffs". */
  const playoffFate = (s: number, code: string): string => {
    const post = played.filter((g) => num(g.season) === s && g.game_type !== 'REG' && (g.home_team === code || g.away_team === code));
    if (!post.length) return s <= lastComplete ? 'but missed the playoffs' : '';
    const order = ['WC', 'DIV', 'CON', 'SB'];
    const last = post.sort((a, b) => order.indexOf(a.game_type) - order.indexOf(b.game_type))[post.length - 1];
    const won = (num(last.home_score) > num(last.away_score)) === (last.home_team === code);
    const sb = `Super Bowl ${roman(s - 1965)}`;
    if (last.game_type === 'SB') return won ? `and went on to win ${sb}` : `but lost ${sb}`;
    if (won) return ''; // season not finished
    return last.game_type === 'CON' ? `but fell one win short of the Super Bowl` : last.game_type === 'DIV' ? 'but lost in the Divisional round' : 'but lost in the Wild Card round';
  };
  const recordText = (r: { w: number; l: number; t: number }) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;
  /** "With Tom Brady at QB and Bill Belichick on the sideline, " (or less, when unclear). */
  const leadIn = (s: number, code: string) => {
    const qb = starterOf(s, code);
    const coach = coachOfSeason(s, code);
    const clearQb = qb[0] && (!qb[1] || qb[1][1] < qb[0][1] - 2) ? qb[0][0] : '';
    if (clearQb && coach) return `With ${clearQb} at quarterback and ${coach} on the sideline, `;
    if (coach) return `Coached by ${coach}, `;
    return '';
  };
  for (let s = 1999; s <= currentSeason; s++) {
    const rows = [...records.entries()].filter(([k]) => k.startsWith(`${s}|`)).map(([k, r]) => ({ code: k.split('|')[1], ...r, pct: (r.w + r.t / 2) / (r.w + r.l + r.t) }));
    if (!rows.length) continue;
    const live = s === currentSeason && s !== lastComplete;
    if (live && latestFullWeek < 4) continue;
    const cat = live ? category('this_season', `${s} Season So Far`, 'Fresh questions from this season, updated every week.') : recCat;
    const byPct = [...rows].sort((a, b) => b.pct - a.pct);
    // A live question keeps its id while its answer is the same, so the game knows the group has
    // already had it. When the answer changes (a new best team), it is a new question.
    const keySuffix = (code: string) => (live ? `_now_${code}` : '');
    if (byPct[0].pct > byPct[1].pct) {
      const best = teamName(byPct[0].code, s);
      const clue = live
        ? `${leadIn(s, byPct[0].code)}this team has the NFL's best record through Week ${latestFullWeek} of ${s}, at ${recordText(byPct[0])}.`
        : `${leadIn(s, byPct[0].code)}this team went ${recordText(byPct[0])} for the NFL's best record in ${s}.`;
      add(cat, `best_${s}${keySuffix(byPct[0].code)}`, clue.charAt(0).toUpperCase() + clue.slice(1), best,
        pickDistractors(best, byPct.slice(1, 8).map((r) => teamName(r.code, s)), [], `best${s}`), live ? 1 : ageDifficulty(s, currentSeason, 2), teamAliases(best));
    }
    const worst = byPct[byPct.length - 1];
    if (worst.pct < byPct[byPct.length - 2].pct) {
      const team = teamName(worst.code, s);
      const clue = live
        ? `${leadIn(s, worst.code)}this team has the NFL's worst record through Week ${latestFullWeek} of ${s}, at ${recordText(worst)}.`
        : `${leadIn(s, worst.code)}this team stumbled to a league-worst ${recordText(worst)} in ${s}.`;
      add(cat, `worst_${s}${keySuffix(worst.code)}`, clue.charAt(0).toUpperCase() + clue.slice(1), team,
        pickDistractors(team, byPct.slice(-8, -1).reverse().map((r) => teamName(r.code, s)), [], `worst${s}`), live ? 2 : ageDifficulty(s, currentSeason, 2), teamAliases(team));
    }
    if (live) continue;
    // The other great and awful seasons. The team or its coach is the answer; a bare win total
    // ("13") is a guessing game, so only the seasons everyone remembers ask for the number.
    const seasonCoaches = [...new Set(regGames.filter((g) => num(g.season) === s).flatMap((g) => [g.home_coach, g.away_coach]).filter(Boolean))];
    for (const r of rows.filter((r) => r.w >= 13 || r.w <= 3)) {
      const team = teamName(r.code, s);
      const coach = coachOfSeason(s, r.code);
      const qb = starterOf(s, r.code);
      const clearQb = qb[0] && (!qb[1] || qb[1][1] < qb[0][1] - 2) ? qb[0][0] : '';
      const good = r.w >= 13;
      const rec = recordText(r);
      const fate = good ? playoffFate(s, r.code) : '';
      const isTop = r.code === byPct[0].code && byPct[0].pct > byPct[1].pct;
      const isBottom = r.code === worst.code && worst.pct < byPct[byPct.length - 2].pct;
      const peers = rows.filter((x) => (good ? x.w >= 10 : x.w <= 6) && x.code !== r.code).map((x) => teamName(x.code, s));
      // The league's best and worst records already have their own team clue above.
      if (!isTop && !isBottom) {
        const hint = pick(`ff${s}${r.code}`, clearQb && coach ? [`With ${clearQb} under center`, `Coached by ${coach}`] : coach ? [`Coached by ${coach}`] : ['In a season to remember']);
        const clue = good
          ? `${hint}, this team went ${rec} in ${s}${fate ? ` ${fate}` : ''}.`
          : `${hint}, this team limped to a ${rec} finish in ${s}.`;
        add(recCat, `ffteam_${s}_${r.code}`, clue, team,
          pickDistractors(team, peers, rows.map((x) => teamName(x.code, s)), `fft${s}${r.code}`), ageDifficulty(s, currentSeason, 2), teamAliases(team));
      }
      if (coach) {
        const clue = good
          ? `He was the head coach of the ${s} ${team}, who went ${rec}${fate ? ` ${fate}` : ''}.`
          : `He was on the sideline as the ${s} ${team} went ${rec}.`;
        add(recCat, `ffcoach_${s}_${r.code}`, clue, coach,
          pickDistractors(coach, [], seasonCoaches, `ffc${s}${r.code}`), ageDifficulty(s, currentSeason, 3), nameAliases(coach));
      }
      if (r.w >= 15 || r.w <= 1) {
        const opts = [r.w - 2, r.w - 1, r.w + 1, r.w + 2, r.w - 3, r.w + 3].filter((n) => n >= 0 && n <= r.w + r.l + r.t).map(String);
        add(recCat, `wins_${s}_${r.code}`,
          `The number of regular-season games won by the ${s} ${team}${coach ? `, coached by ${coach}` : ''}.`, String(r.w),
          pickDistractors(String(r.w), opts, [], `wins${s}${r.code}`), ageDifficulty(s, currentSeason, 3));
      }
    }
  }

  // ---- Starting quarterbacks of playoff teams -----------------------------
  const qbCat = category('playoff_qbs', 'Under Center', 'Who was under center for the playoff teams of the past 25 years.');
  for (let s = 1999; s <= lastComplete; s++) {
    const seasonGames = regGames.filter((g) => num(g.season) === s);
    const playoffCodes = new Set(played.filter((g) => num(g.season) === s && g.game_type !== 'REG').flatMap((g) => [g.home_team, g.away_team]));
    const allQbs = [...new Set(seasonGames.flatMap((g) => [g.home_qb_name, g.away_qb_name]).filter(Boolean))];
    for (const code of playoffCodes) {
      const [top, second] = starterOf(s, code);
      if (!top || top[1] < 9 || (second && second[1] >= top[1] - 2)) continue; // only clear-cut starters
      const team = teamName(code, s);
      const rec = records.get(`${s}|${code}`);
      const coach = coachOfSeason(s, code);
      add(qbCat, `qb_${s}_${code}`, pick(`qb${s}${code}`, [
        `He started ${top[1]} games at quarterback for the ${s} ${team}, who went ${rec ? recordText(rec) : 'on'}${coach ? ` under ${coach}` : ''} and made the playoffs.`,
        `The ${s} ${team}${rec ? ` went ${recordText(rec)} and` : ''} made the playoffs${coach ? ` under ${coach}` : ''} with this quarterback starting ${top[1]} games.`,
        `${coach ? `${coach}'s` : 'The'} ${s} ${nickname(team)} rode this quarterback to the playoffs: he started ${top[1]} games${rec ? ` in a ${recordText(rec)} season` : ''}.`,
      ]), top[0],
        pickDistractors(top[0], [], allQbs, `qb${s}${code}`), ageDifficulty(s, lastComplete, 2), nameAliases(top[0]));
    }
  }

  // ---- Season stat leaders ------------------------------------------------
  const statDefs = [
    { col: 'passing_yards', label: 'passing yards', gap: 25, cat: 'passing_leaders', title: 'Air It Out', base: 2 },
    { col: 'passing_tds', label: 'touchdown passes', gap: 1, cat: 'passing_leaders', title: 'Air It Out', base: 2 },
    { col: 'rushing_yards', label: 'rushing yards', gap: 15, cat: 'rushing_leaders', title: 'Ground and Pound', base: 2 },
    { col: 'rushing_tds', label: 'rushing touchdowns', gap: 1, cat: 'rushing_leaders', title: 'Ground and Pound', base: 3 },
    { col: 'receiving_yards', label: 'receiving yards', gap: 15, cat: 'receiving_leaders', title: 'Catch of the Day', base: 2 },
    { col: 'receptions', label: 'catches', gap: 1, cat: 'receiving_leaders', title: 'Catch of the Day', base: 3 },
    { col: 'receiving_tds', label: 'touchdown catches', gap: 1, cat: 'receiving_leaders', title: 'Catch of the Day', base: 3 },
  ];
  /** "Broncos quarterback" from a stats row, when the team code is known. */
  const whoTag = (r: Row, s: number) => {
    const code = r.recent_team || r.team;
    let team = '';
    try { team = code ? nickname(teamName(code, s)) : ''; } catch { team = ''; }
    return `${team ? `${team} ` : ''}${posWord(r.position)}`;
  };
  for (const [s, rows] of statsBySeason) {
    if (!rows.length) continue;
    const live = s === currentSeason && s !== lastComplete;
    if (live && latestFullWeek < 3) continue;
    for (const d of statDefs) {
      const top = leaders(rows.filter((r) => r.player_display_name && r.position), (r) => num(r[d.col]), d.gap);
      if (!top) continue;
      const leader = top[0].player_display_name;
      const value = num(top[0][d.col]);
      const others = top.slice(1, 8).map((r) => r.player_display_name);
      if (live) {
        add(category('this_season', `${s} Season So Far`, ''), `lead_${s}_${d.col}_now_${top[0].player_id}`,
          `Through Week ${latestFullWeek} of ${s}, this ${whoTag(top[0], s)} leads the NFL with ${fmt(value)} ${d.label}.`, leader,
          pickDistractors(leader, others, [], `l${s}${d.col}`), d.base, nameAliases(leader));
      } else {
        add(category(d.cat, d.title, `Single-season NFL leaders in ${d.label} and more, 1999 to now.`),
          `lead_${s}_${d.col}`, pick(`lead${s}${d.col}`, [
            `This ${whoTag(top[0], s)} led the NFL with ${fmt(value)} ${d.label} in ${s}.`,
            `Nobody had more ${d.label} in ${s} than this ${whoTag(top[0], s)}, who finished with ${fmt(value)}.`,
            `In ${s}, this ${whoTag(top[0], s)} topped the league with ${fmt(value)} ${d.label}, ahead of ${others[0]}.`,
          ]), leader,
          pickDistractors(leader, others, [], `l${s}${d.col}`), ageDifficulty(s, lastComplete, d.base), nameAliases(leader));
      }
    }
  }

  // ---- This season: weekly standouts, coaches, homes, players -------------
  if (currentSeason !== lastComplete && latestFullWeek >= 1) {
    const cs = currentSeason;
    const weeklyCat = category('this_week', 'This Week in the NFL', 'Big performances and results from the latest weeks of games.');
    const allTeamsNow = teamsInSeason(cs, games);

    // Each recent week becomes a handful of storylines (upsets, overtime, game-winning kicks,
    // big stat lines, sack parties), ranked by how notable they are. Plain "this team beat the
    // Cowboys 24-16" results made dull questions, so ordinary games are left out.
    const NEUTRAL_CITIES: Record<string, string> = {
      'Tottenham Hotspur Stadium': 'London', 'Wembley Stadium': 'London', 'Stade de France': 'Paris',
      'FC Bayern Munich Stadium': 'Munich', 'Allianz Arena': 'Munich', 'Deutsche Bank Park': 'Frankfurt',
      'Olympiastadion Berlin': 'Berlin', 'Bernabeu': 'Madrid', 'Maracana Stadium': 'Rio de Janeiro',
      'Arena Corinthians': 'Sao Paulo', 'Estadio Banorte': 'Mexico City', 'Estadio Azteca': 'Mexico City',
      'Melbourne Cricket Ground': 'Melbourne', 'Croke Park': 'Dublin',
    };
    /** "On Monday Night Football in Week 5", "In London in Week 6", or "In Week 7". */
    const whenOf = (g: Row, w: number) => {
      const night = g.gametime >= '19:00';
      const show = g.weekday === 'Thursday' ? 'Thursday Night Football'
        : g.weekday === 'Monday' ? 'Monday Night Football'
        : g.weekday === 'Sunday' && night ? 'Sunday Night Football' : '';
      if (show) return `On ${show} in Week ${w}`;
      const city = g.location === 'Neutral' ? NEUTRAL_CITIES[g.stadium] : '';
      return city ? `In ${city} in Week ${w}` : `In Week ${w}`;
    };
    const nick = (code: string) => { try { return nickname(teamName(code, cs)); } catch { return ''; } };
    /** A week's row in a few words ("ran for 112 yards and a touchdown"), or '' for a quiet day. */
    const statLineLite = (r: Row) => {
      const n = (k: string) => num(r[k]) || 0;
      const tds = (t: number) => (t === 1 ? ' and a touchdown' : t ? ` and ${t} touchdowns` : '');
      if (n('passing_yards') >= 200) return `threw for ${fmt(n('passing_yards'))} yards${tds(n('passing_tds'))}`;
      if (n('rushing_yards') >= 60 || n('rushing_tds') >= 1) return `ran for ${fmt(n('rushing_yards'))} yards${tds(n('rushing_tds'))}`;
      if (n('receiving_yards') >= 50 || n('receiving_tds') >= 1) return `caught ${plural(n('receptions'), 'pass', 'passes')} for ${fmt(n('receiving_yards'))} yards${tds(n('receiving_tds'))}`;
      if (n('fg_made') >= 3) return `made ${n('fg_made')} field goals`;
      return '';
    };
    const num0 = (s: string | undefined) => num(s) || 0;
    const timesWord = (n: number) => (n === 2 ? 'twice' : n === 3 ? 'three times' : `${n} times`);
    const ydsTds = (yds: number, tds: number) => `${fmt(yds)} yards${tds === 1 ? ' and a touchdown' : tds ? ` and ${tds} touchdowns` : ''}`;

    // Big plays from play-by-play: long touchdowns, pick-sixes, return TDs, Hail Marys, late
    // game-winners, and the comebacks behind them.
    const plays = bigPlays(pbp);
    const comebackOf = new Map(comebacks(pbp).map((c) => [c.gameId, c]));
    /** One of a few phrasings, the same one on every rebuild, so a week's clues don't all sound alike. */
    const variant = (key: string, options: string[]) => options[parseInt(createHash('sha1').update(key).digest('hex').slice(0, 6), 16) % options.length];

    for (let w = Math.max(1, latestFullWeek - 2); w <= latestFullWeek; w++) {
      const weekGames = played.filter((g) => num(g.season) === cs && num(g.week) === w && g.game_type === 'REG');
      const gameById = new Map(weekGames.map((g) => [g.game_id, g]));
      const weekTeams = weekGames.flatMap((g) => [name(g, 'home'), name(g, 'away')]);
      const wk = weekStats.filter((r) => num(r.week) === w && r.season_type === 'REG' && gameById.has(r.game_id));
      type Story = { gameId: string; score: number; emit: () => void; kicker?: boolean; team?: boolean; player?: string; kind?: string };
      const stories: Story[] = [];
      const story = (gameId: string, score: number, emit: () => void, o: Omit<Story, 'gameId' | 'score' | 'emit'> = {}) =>
        stories.push({ gameId, score, emit, ...o });
      const diff = latestFullWeek - w; // older weeks are a little harder

      // ---- Team storylines: one per notable game, the best angle wins ----
      const decided = weekGames.filter((g) => g.home_score !== g.away_score);
      const info = decided.map((g) => {
        const homeWon = num(g.home_score) > num(g.away_score);
        const [ws, ls] = homeWon ? ['home', 'away'] as const : ['away', 'home'] as const;
        const hi = num(g[`${ws}_score`]), lo = num(g[`${ls}_score`]);
        const spread = num0(g.spread_line); // > 0 means the home team was favored
        const dogBy = homeWon ? -spread : spread; // how many points the winner was getting
        return { g, winnerCode: g[`${ws}_team`], winner: name(g, ws), loser: name(g, ls), wQb: g[`${ws}_qb_name`], lQb: g[`${ls}_qb_name`], hi, lo, margin: hi - lo, total: hi + lo, dogBy, ot: g.overtime === '1' };
      });
      const biggestUpset = Math.max(0, ...info.map((i) => i.dogBy));
      const biggestRout = Math.max(0, ...info.map((i) => i.margin));
      const mostPoints = Math.max(0, ...info.map((i) => i.total));
      for (const i of info) {
        const when = whenOf(i.g, w);
        const by = i.wQb ? `${i.wQb} and this team` : 'this team';
        const angles: { score: number; clue: string; kind: string }[] = [];
        if (i.dogBy >= 3.5) angles.push({
          score: 45 + i.dogBy * 4, kind: 'upset',
          clue: `${when}, ${by} pulled off ${i.dogBy === biggestUpset ? 'the upset of the week' : 'an upset'}, knocking off ${i.lQb ? `${i.lQb} and ` : ''}the ${nickname(i.loser)} ${i.hi}-${i.lo} as ${i.dogBy}-point underdogs.`,
        });
        const cb = comebackOf.get(i.g.game_id);
        if (cb && cb.winner === i.winnerCode && cb.deficit >= 14) angles.push({
          score: 50 + cb.deficit * 2, kind: 'comeback',
          clue: `${when}, ${by} erased a ${cb.deficit}-point deficit to stun the ${i.loser}, ${i.hi}-${i.lo}.`,
        });
        if (i.ot) angles.push({ score: 62, kind: 'ot', clue: `${when}, it took overtime, but ${by} finally outlasted the ${i.loser}, ${i.hi}-${i.lo}.` });
        if (i.lo === 0) angles.push({ score: 58, kind: 'shutout', clue: `${when}, this team's defense pitched a shutout, blanking ${i.lQb ? `${i.lQb} and ` : ''}the ${nickname(i.loser)} ${i.hi}-0.` });
        if (i.margin >= 21 && i.margin === biggestRout) angles.push({ score: 40 + i.margin, kind: 'rout', clue: `${when}, nobody rolled harder: ${by} hung ${i.hi} points on the ${i.loser} in a ${i.margin}-point rout.` });
        if (i.total >= 55 && i.total === mostPoints) angles.push({ score: 35 + i.total / 2, kind: 'shootout', clue: `${when}, ${by} survived the highest-scoring game of the week, a ${i.hi}-${i.lo} shootout with the ${i.loser}.` });
        const best = angles.sort((a, b) => b.score - a.score)[0];
        if (!best) continue;
        story(i.g.game_id, best.score, () => add(weeklyCat, `wkteam_${i.g.game_id}`, best.clue, i.winner,
          pickDistractors(i.winner, [], weekTeams.filter((t) => t !== i.loser), `wt${i.g.game_id}`), diff + 1, teamAliases(i.winner)), { team: true, kind: best.kind });
      }

      // ---- Player storylines ----
      const resultFor = (r: Row) => {
        const g = gameById.get(r.game_id)!;
        const side = franchise(g.home_team) === franchise(r.team) ? 'home' : 'away';
        const us = num(g[`${side}_score`]), them = num(g[`${side === 'home' ? 'away' : 'home'}_score`]);
        const opp = nick(r.opponent_team);
        const oppQb = g[`${side === 'home' ? 'away' : 'home'}_qb_name`];
        const ourQb = g[`${side}_qb_name`] !== r.player_display_name ? g[`${side}_qb_name`] : '';
        const res = us > them ? `in a ${us}-${them} win over the ${opp}` : us < them ? `in a ${them}-${us} loss to the ${opp}` : `in a ${us}-${them} tie with the ${opp}`;
        /** The result without the opponent, for clues that already name it. */
        const score = us > them ? `in a ${us}-${them} win` : us < them ? `in a ${them}-${us} loss` : `in a ${us}-${them} tie`;
        return { g, opp, oppQb, ourQb, res, score, won: us > them, us, them };
      };
      /** Wrong answers: same position group that week, busiest players first. */
      const peers = (r: Row, rank: (x: Row) => number) => wk
        .filter((x) => x.player_id !== r.player_id && posGroup(x.position) === posGroup(r.position))
        .sort((a, b) => rank(b) - rank(a)).map((x) => x.player_display_name);
      const playerQ = (r: Row, kind: string, score: number, clue: string, rank: (x: Row) => number, extra = 0) =>
        story(r.game_id, score, () => add(weeklyCat, `wk_${cs}_${w}_${kind}_${r.player_id}`, clue, r.player_display_name,
          pickDistractors(r.player_display_name, peers(r, rank).slice(0, 4), peers(r, rank).slice(4, 30), `wp${w}${kind}${r.player_id}`),
          diff + 1 + extra, nameAliases(r.player_display_name)), { kicker: r.position === 'K', player: r.player_id, kind });
      const fp = (x: Row) => num0(x.fantasy_points_ppr);
      const defRank = (x: Row) => num0(x.def_sacks) * 3 + num0(x.def_interceptions) * 3 + num0(x.def_tackles_solo);
      const kRank = (x: Row) => num0(x.fg_made) + num0(x.fg_long) / 10;

      let longestKick: Row | null = null;
      for (const r of wk) {
        if (!r.team || !nick(r.team)) continue;
        const { opp, oppQb, ourQb, res, score, us, them } = resultFor(r);
        const v = (kind: string, options: string[]) => variant(`${w}${kind}${r.player_id}`, options);
        const team = nick(r.team);
        const when = whenOf(gameById.get(r.game_id)!, w);
        const pos = posWord(r.position);

        const gw = num0(r.gwfg_made);
        if (gw > 0) {
          const dist = num0(r.gwfg_distance) || num0(r.fg_long);
          playerQ(r, 'gwfg', 70 + dist / 2,
            `${when}, this ${team} kicker drilled a ${dist ? `${dist}-yard ` : ''}game-winning field goal to beat the ${opp} ${us}-${them}.`, kRank, 1);
        } else if (num0(r.fg_long) >= 56 && (!longestKick || num0(r.fg_long) > num0(longestKick.fg_long))) longestKick = r;

        const pTd = num0(r.passing_tds), pYd = num0(r.passing_yards);
        if (pTd >= 4) playerQ(r, 'pass', 45 + pTd * 6 + pYd / 50,
          v('pass', [
            `${when}, this ${team} quarterback carved up the ${opp} for ${pTd} touchdown passes and ${fmt(pYd)} yards.`,
            `${when}, the ${opp} secondary had no answer for this ${team} quarterback, who threw ${pTd} touchdown passes ${score}.`,
          ]), fp);
        else if (pYd >= 350) playerQ(r, 'pass', 40 + (pYd - 300) / 5,
          `${when}, this ${team} quarterback lit up the ${opp} for ${fmt(pYd)} passing yards ${res}.`, fp);

        const rYd = num0(r.rushing_yards), rTd = num0(r.rushing_tds);
        if (rYd >= 140 || rTd >= 3) playerQ(r, 'rush', 40 + rYd / 10 + rTd * 8,
          `${when}, this ${team} ${r.position === 'QB' ? 'quarterback took off and ran' : `${pos} ran wild`} for ${ydsTds(rYd, rTd)} ${res}.`, fp);
        else if (r.position === 'QB' && rYd >= 80) playerQ(r, 'qbrun', 45 + rYd / 10,
          `${when}, this ${team} quarterback did it with his legs, running for ${fmt(rYd)} yards ${res}.`, fp);

        const cYd = num0(r.receiving_yards), cTd = num0(r.receiving_tds), rec = num0(r.receptions);
        if (cYd >= 140 || cTd >= 3) playerQ(r, 'rec', 40 + cYd / 10 + cTd * 8, ourQb
          ? v('rec', [
            `${when}, ${ourQb} kept going back to this ${team} ${pos}, who piled up ${ydsTds(cYd, cTd)} ${res}.`,
            `${when}, the ${opp} couldn't cover this ${team} ${pos}: ${plural(rec, 'catch', 'catches')} from ${ourQb} for ${ydsTds(cYd, cTd)} ${score}.`,
          ])
          : `${when}, this ${team} ${pos} hauled in ${plural(rec, 'catch', 'catches')} for ${ydsTds(cYd, cTd)} ${res}.`, fp);

        const sacks = num0(r.def_sacks);
        if (sacks >= 3) playerQ(r, 'sacks', 50 + sacks * 5,
          `${when}, this ${team} ${pos} made life miserable for ${oppQb || `the ${opp} quarterback`}, racking up ${fmt(sacks)} sacks.`, defRank, 1);
        const ints = num0(r.def_interceptions);
        if (ints >= 2) playerQ(r, 'ints', 48 + ints * 6,
          `${when}, this ${team} ${pos} picked off ${oppQb || `the ${opp} quarterback`} ${timesWord(ints)} ${res}.`, defRank, 1);
        if (num0(r.def_tds) > 0) playerQ(r, 'deftd', 60,
          `${when}, this ${team} ${pos} took one to the house for a defensive touchdown ${res}.`, defRank, 1);
        if (num0(r.special_teams_tds) > 0) playerQ(r, 'sttd', 58,
          `${when}, this ${team} ${pos} found the end zone on special teams ${res}.`, defRank, 1);
      }
      if (longestKick) {
        const r = longestKick, { opp } = resultFor(r);
        playerQ(r, 'longfg', 40 + (num0(r.fg_long) - 55) * 4,
          `${whenOf(gameById.get(r.game_id)!, w)}, this ${nick(r.team)} kicker hit the longest field goal of the week, a ${num0(r.fg_long)}-yarder against the ${opp}.`, kRank, 1);
      }

      // ---- Big plays ----
      const statRow = (id: string) => (id ? wk.find((x) => x.player_id === id) : undefined);
      const weekPlays = plays.filter((b) => b.week === w && gameById.has(b.gameId));
      const longestTd = Math.max(0, ...weekPlays.filter((b) => b.kind === 'longTd').map((b) => b.yards));
      for (const b of weekPlays) {
        const r = statRow(b.playerId);
        const team = nick(b.team), opp = nick(b.opp);
        if (!r || !team || !opp) continue;
        const g = gameById.get(b.gameId)!;
        const side = g.home_team === b.team ? 'home' : 'away';
        const us = num(g[`${side}_score`]), them = num(g[`${side === 'home' ? 'away' : 'home'}_score`]);
        const when = whenOf(g, w);
        const pos = posWord(r.position);
        const qb = b.qbId !== b.playerId ? statRow(b.qbId)?.player_display_name ?? '' : '';
        const yds = b.yards;
        const key = `${b.gameId}_${b.playId}`;
        const v = (options: string[]) => variant(key, options);
        let clue = '', score = 0, extra = 1;
        const atTheGun = b.beatTheClock ? ` as the ${b.qtr === 2 ? 'first half' : 'game'} ran out` : '';
        switch (b.kind) {
          case 'longTd':
            if (yds < 60 && yds !== longestTd) break;
            score = 42 + (yds - 50) * 0.8 + (yds === longestTd ? 8 : 0);
            extra = 0;
            if (b.via === 'run') {
              const lane = b.detail === 'middle' ? 'up the middle' : b.detail ? `around the ${b.detail} side` : 'through a hole';
              clue = r.position === 'QB'
                ? `${when}, this ${team} quarterback tucked it and ran, ${yds} yards for a touchdown against the ${opp}.`
                : v([
                  `${when}, this ${team} ${pos} burst ${lane} and was gone, ${yds} yards to the end zone against the ${opp}.`,
                  `${when}, nobody on the ${opp} could catch this ${team} ${pos} on a ${yds}-yard touchdown run.`,
                ]);
            } else if (!qb) {
              clue = `${when}, this ${team} ${pos} took a pass ${yds} yards to the end zone against the ${opp}.`;
            } else if (b.detail === 'deep') {
              clue = v([
                `${when}, ${qb} let it fly, and this ${team} ${pos} ran under it for a ${yds}-yard touchdown against the ${opp}.`,
                `${when}, this ${team} ${pos} got behind the ${opp} defense and hauled in a ${yds}-yard touchdown bomb from ${qb}.`,
              ]);
            } else {
              clue = v([
                `${when}, ${qb} threw a short pass to this ${team} ${pos}, who turned it into a ${yds}-yard touchdown against the ${opp}${atTheGun}.`,
                `${when}, this ${team} ${pos} caught a quick one from ${qb} and outran the whole ${opp} defense, ${yds} yards for a touchdown${atTheGun}.`,
              ]);
            }
            break;
          case 'hailMary':
            score = 95;
            clue = `${when}, with time running out in the ${b.qtr === 2 ? 'first half' : 'game'}, ${qb || `the ${team} quarterback`} heaved a Hail Mary and this ${team} ${pos} came down with it, a ${yds}-yard touchdown against the ${opp}.`;
            break;
          case 'pickSix': {
            const victim = statRow(b.qbId)?.player_display_name || `the ${opp} quarterback`;
            score = 70 + yds / 10;
            clue = yds >= 5
              ? v([
                `${when}, this ${team} ${pos} jumped a ${victim} pass and took it ${yds} yards the other way for a pick-six.`,
                `${when}, ${victim} threw one right to this ${team} ${pos}, who returned it ${yds} yards for a touchdown.`,
              ])
              : `${when}, this ${team} ${pos} picked off ${victim} and took it back for a touchdown.`;
            break;
          }
          case 'fumbleTd': {
            const victim = statRow(b.qbId)?.player_display_name;
            score = 66 + yds / 10;
            clue = yds >= 5
              ? `${when}, this ${team} ${pos} scooped up a fumble${victim ? ` by ${victim}` : ''} and ran it back ${yds} yards for a touchdown against the ${opp}.`
              : `${when}, this ${team} ${pos} pounced on a fumble${victim ? ` by ${victim}` : ''} for a defensive touchdown against the ${opp}.`;
            break;
          }
          case 'kickReturnTd':
            score = 70 + yds / 10;
            clue = v([
              `${when}, this ${team} ${pos} took a kickoff ${yds} yards to the house against the ${opp}.`,
              `${when}, the ${opp} kicked off, and this ${team} ${pos} brought it back ${yds} yards for a touchdown.`,
            ]);
            break;
          case 'puntReturnTd':
            score = 70 + yds / 10;
            clue = `${when}, the ${opp} punted to this ${team} ${pos}, who weaved ${yds} yards for a touchdown.`;
            break;
          case 'clutchTd': {
            const how = b.via === 'pass'
              ? `caught a ${yds}-yard touchdown${qb ? ` from ${qb}` : ''}`
              : yds <= 2 ? `punched it in from ${yds === 1 ? 'a yard' : '2 yards'} out` : `ran in a ${yds}-yard touchdown`;
            if (b.qtr >= 5) {
              score = 85;
              clue = `${when}, this ${team} ${pos} won it in overtime: he ${how} to beat the ${opp} ${us}-${them}.`;
            } else {
              score = 78 + b.trailedBy;
              const spot = b.trailedBy ? `trailed by ${b.trailedBy}` : 'were tied';
              clue = `${when}, the ${team} ${spot} with ${clockText(b.secondsLeft)} left until this ${pos} ${how}. They held on to beat the ${opp} ${us}-${them}.`;
            }
            break;
          }
        }
        if (!clue) continue;
        const rank = ['DL', 'LB', 'DB'].includes(posGroup(r.position)) ? defRank : fp;
        const ps = peers(r, rank);
        story(b.gameId, score, () => add(weeklyCat, `wkplay_${key}`, clue, r.player_display_name,
          pickDistractors(r.player_display_name, ps.slice(0, 4), ps.slice(4, 30), `wb${key}`), diff + extra, nameAliases(r.player_display_name)),
        { player: r.player_id, kind: b.kind });
      }

      // Keep the best of the week. One question per player. From any one game: either one team
      // question or up to two player ones (a player clue names the result, which would give away a
      // "this team" clue about the same game). At most two kickers a week, and no more than three of
      // any one kind (three 140-yard rushing days is plenty).
      const perGame = new Map<string, { team: number; player: number }>();
      const players = new Set<string>();
      const kinds = new Map<string, number>();
      let kept = 0, kickers = 0;
      for (const s of stories.sort((a, b) => b.score - a.score)) {
        const pg = perGame.get(s.gameId) ?? { team: 0, player: 0 };
        if (kept >= 18 || (s.kicker && kickers >= 2) || (s.player && players.has(s.player))) continue;
        // Ties can make two "biggest rout of the week" games; ask about one.
        if (s.kind && (kinds.get(s.kind) ?? 0) >= (s.kind === 'rout' || s.kind === 'shootout' ? 1 : 3)) continue;
        if (s.team ? pg.team + pg.player > 0 : pg.team > 0 || pg.player >= 2) continue;
        if (s.kicker) kickers++;
        if (s.player) players.add(s.player);
        if (s.kind) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
        if (s.team) pg.team++; else pg.player++;
        perGame.set(s.gameId, pg);
        s.emit();
        kept++;
      }
    }

    // Each team's leading passer, rusher and receiver so far, so this column doesn't run dry.
    const seasonSoFar = statsBySeason.get(cs) ?? [];
    if (latestFullWeek >= 3) {
      const thisCat = category('this_season', `${cs} Season So Far`, 'Fresh questions from this season, updated every week.');
      const teamLeaderDefs = [
        { col: 'passing_yards', label: 'passing yards', min: 600 },
        { col: 'rushing_yards', label: 'rushing yards', min: 250 },
        { col: 'receiving_yards', label: 'receiving yards', min: 250 },
      ];
      for (const code of new Set(seasonSoFar.map((r) => r.recent_team).filter(Boolean))) {
        let team = '';
        try { team = teamName(code, cs); } catch { continue; }
        const teamRows = seasonSoFar.filter((r) => r.recent_team === code);
        for (const d of teamLeaderDefs) {
          const top = leaders(teamRows, (r) => num(r[d.col]), 1);
          if (!top || num(top[0][d.col]) < d.min) continue;
          const p = top[0];
          const pool = leaders(seasonSoFar, (r) => num(r[d.col]), 0) ?? [];
          add(thisCat, `teamlead_${cs}_${code}_${d.col}_now_${p.player_id}`,
            `Through Week ${latestFullWeek}, this ${posWord(p.position)} leads the ${team} with ${fmt(num(p[d.col]))} ${d.label}.`, p.player_display_name,
            pickDistractors(
              p.player_display_name,
              top.slice(1, 3).filter((r) => posGroup(r.position) === posGroup(p.position)).map((r) => r.player_display_name),
              pool.filter((r) => posGroup(r.position) === posGroup(p.position)).slice(0, 24).map((r) => r.player_display_name),
              `tl${code}${d.col}`
            ),
            // A team's leader who is also near the top of the league is easier to name.
            (() => { const r = pool.indexOf(p); return r >= 0 && r < 6 ? 1 : r >= 0 && r < 16 ? 2 : r >= 0 && r < 28 ? 3 : 4; })(),
            nameAliases(p.player_display_name));
        }
      }
    }

    // Head coaches and home stadiums as of the latest game.
    const latestByTeam = new Map<string, Row>();
    for (const g of played.filter((g) => num(g.season) === cs).sort((a, b) => a.gameday.localeCompare(b.gameday)))
      for (const side of ['home', 'away']) latestByTeam.set(g[`${side}_team`], g);
    const coachOf = new Map<string, string>();
    for (const [code, g] of latestByTeam) coachOf.set(code, g.home_team === code ? g.home_coach : g.away_coach);
    const coachCat = category('head_coaches', 'Sideline Bosses', 'Who is running each sideline this season.');
    // A coach with many seasons on a sideline is easier than a first-year coach.
    const coachSeasons = (coach: string) => new Set(regGames.filter((g) => g.home_coach === coach || g.away_coach === coach).map((g) => g.season)).size;
    for (const [code, coach] of coachOf) {
      if (!coach) continue;
      const seasons = coachSeasons(coach);
      const coachDiff = seasons >= 10 ? 1 : seasons >= 5 ? 2 : seasons >= 2 ? 3 : 4;
      const team = teamName(code, cs);
      const rec = records.get(`${cs}|${code}`);
      add(coachCat, `coach_${cs}_${code}_${coach}`, pick(`coach${code}`, [
        `He's the head coach of the ${team}${rec ? `, ${recordText(rec)} so far this season` : ' this season'}.`,
        `The ${team}${rec ? `, ${recordText(rec)} so far,` : ''} take their orders from this head coach in ${cs}.`,
      ]), coach,
        pickDistractors(coach, [], [...coachOf.values()], `coach${code}`), coachDiff + 1, nameAliases(coach));
      add(coachCat, `coachteam_${cs}_${code}_${coach}`, pick(`coacht${code}`, [
        `${coach} runs the sideline for this team in ${cs}.`,
        `In ${cs}, this team's head coach is ${coach}.`,
      ]), team,
        pickDistractors(team, [], allTeamsNow, `coacht${code}`), coachDiff, teamAliases(team));
    }

    // Grouped by stadium id, because one building shows up under old and new names. The
    // newest name is the answer and older names still count as right.
    const homeGames = played
      .filter((g) => num(g.season) >= cs - 1 && g.location === 'Home' && g.stadium)
      .sort((a, b) => a.gameday.localeCompare(b.gameday));
    const venues = new Map<string, { tenants: Map<string, number>; names: string[]; roof: string }>();
    for (const g of homeGames) {
      const id = g.stadium_id || g.stadium;
      const v = venues.get(id) ?? { tenants: new Map<string, number>(), names: [], roof: '' };
      v.tenants.set(g.home_team, (v.tenants.get(g.home_team) ?? 0) + 1);
      v.names = [...v.names.filter((n) => n !== g.stadium), g.stadium]; // newest last
      if (g.roof) v.roof = g.roof;
      venues.set(id, v);
    }
    const venueName = (id: string, v: { names: string[] }) => STADIUM_NAME_NOW[id] ?? v.names[v.names.length - 1];
    const stadiumCat = category('stadiums', "There's No Place Like Home", 'Which team plays where.');
    const stadiumNames = [...venues].map(([id, v]) => venueName(id, v));
    for (const [id, v] of venues) {
      const tenants = [...v.tenants.entries()].filter(([, n]) => n >= 3);
      if (tenants.length !== 1) continue; // skip shared stadiums like MetLife
      const stadium = venueName(id, v);
      const team = teamName(tenants[0][0], cs);
      const roofHint = v.roof === 'dome' ? 'under a dome ' : v.roof === 'outdoors' ? 'outdoors ' : '';
      add(stadiumCat, `stadium_${stadium}_${tenants[0][0]}`, pick(`st${stadium}`, [
        `This team plays its home games ${roofHint}at ${stadium}.`,
        `${cap(theStadium(stadium))} is where this team plays ${roofHint}on Sundays.`,
      ]), team,
        pickDistractors(team, [], allTeamsNow, `st${stadium}`), 2, teamAliases(team));
      add(stadiumCat, `stadiumq_${stadium}_${tenants[0][0]}`, pick(`stq${stadium}`, [
        `The ${team} call this stadium home.`,
        `Home games for the ${team} are played ${roofHint}in this building.`,
      ]), stadium,
        pickDistractors(stadium, [], stadiumNames, `stq${stadium}`), 3, [...new Set([stadium, ...v.names])]);
    }

    // Star players this season: which team they play for.
    const seasonRows = statsBySeason.get(cs) ?? [];
    const stars = [...seasonRows].sort((a, b) => num(b.fantasy_points_ppr) - num(a.fantasy_points_ppr)).slice(0, 100);
    const latestWeek = Math.max(0, ...rosters.map((r) => num(r.week)).filter((n) => !isNaN(n)));
    const rosterNow = new Map(rosters.filter((r) => num(r.week) === latestWeek).map((r) => [r.gsis_id, r]));
    const playersCat = category('stars_now', 'Stars of Today', 'Which team the league\'s top players suit up for this season.');
    for (const [rank, p] of stars.entries()) {
      const r = rosterNow.get(p.player_id);
      if (!r || !r.team) continue;
      const team = teamName(r.team, cs);
      // Transfers are listed newest first ("LSU; Ohio State" for Joe Burrow): name that school only.
      const school = collegeName((r.college || '').split(';').map((c) => c.trim()).filter((c) => c && c !== 'NA')[0] ?? '');
      const college = school ? `, who played college ball at ${school},` : '';
      add(playersCat, `team_${cs}_${p.player_id}_${r.team}`, pick(`pt${p.player_id}`, [
        `${cap(posWord(r.position))} ${p.player_display_name}${college} suits up for this team in ${cs}.`,
        `In ${cs}, you'll find ${posWord(r.position)} ${p.player_display_name}${school ? `, a ${school} product,` : ''} on this team's roster.`,
      ]), team,
        // The league's biggest names are the cheap tiles; deeper down the list costs more.
        pickDistractors(team, [], allTeamsNow, `pt${p.player_id}`), rank < 20 ? 1 : rank < 45 ? 2 : rank < 70 ? 3 : 4, teamAliases(team));
    }

    // Waiver Wire: the players fantasy managers are adding this week, from Sleeper.
    const trending = await loadSleeperTrending();
    const bySleeperId = new Map([...rosterNow.values()].filter((r) => r.sleeper_id && r.sleeper_id !== 'NA').map((r) => [r.sleeper_id, r]));
    const waiverCat = category('waiver_wire', 'Waiver Wire', "This week's hottest fantasy football pickups.");
    const hot = trending.map((t) => bySleeperId.get(t.player_id)).filter((r): r is Row => Boolean(r && r.team && ['QB', 'RB', 'WR', 'TE', 'K'].includes(r.position)));
    hot.slice(0, 20).forEach((r, i) => {
      const who = r.full_name || `${r.first_name} ${r.last_name}`;
      const last = weekStats.filter((x) => x.player_id === r.gsis_id && x.season_type === 'REG').sort((a, b) => num(b.week) - num(a.week))[0];
      const line = last ? statLineLite(last) : '';
      const after = line && last ? ` after he ${line} against the ${nick(last.opponent_team)} in Week ${num(last.week)}` : '';
      const school = collegeName((r.college || '').split(';').map((c) => c.trim()).filter((c) => c && c !== 'NA')[0] ?? '');
      const tag = `${nick(r.team)} ${posWord(r.position)}`;
      // Where he came from, so two pickups at one position on one team can't be confused.
      const picked = draft.find((d) => d.gsis_id && d.gsis_id === r.gsis_id);
      const origin = picked ? `${draftSlot(num(picked.round), num(picked.pick))} in ${num(picked.season)}` : !isNaN(num(r.rookie_year)) ? `undrafted in ${num(r.rookie_year)}` : '';
      const bio = origin ? `, ${origin}${school ? ` out of ${school}` : ''}` : school ? ` out of ${school}` : '';
      if (!bio && !after) return;
      const peers = hot.filter((x) => x !== r && x.position === r.position).map((x) => x.full_name);
      const others = seasonRows.filter((x) => x.position === r.position && x.player_display_name !== who)
        .sort((a, b) => num(b.fantasy_points_ppr) - num(a.fantasy_points_ppr)).slice(20, 60).map((x) => x.player_display_name);
      add(waiverCat, `waiver_${cs}_${r.gsis_id || who}`, pick(`waiver${r.gsis_id}`, [
        `Fantasy managers raced to the waiver wire for this ${tag}${bio}${bio.startsWith(',') && after ? ',' : ''}${after}. He is one of the most-added players on Sleeper this week.`,
        `One of the hottest pickups in fantasy football right now is this ${tag}${bio}${bio.startsWith(',') && after ? ',' : ''}${after}.`,
      ]), who, pickDistractors(who, peers.slice(0, 4), others, `waiver${r.gsis_id}`), 1 + i / 4, nameAliases(who));
    });
  }

  // ---- Game moments: playoff heroes, monster games, Thanksgiving --------
  // From every finished season's game-by-game player stats, so the board isn't mostly draft trivia.
  const gameById = new Map(played.map((g) => [g.game_id, g]));
  const z = (s: string | undefined) => num(s) || 0;
  const roundName = (g: Row) => {
    const s = num(g.season);
    if (g.game_type === 'SB') return `Super Bowl ${roman(s - 1965)}`;
    if (g.game_type === 'CON') return `${conference(g.home_team, s)} Championship Game after the ${s} season`;
    if (g.game_type === 'DIV') return `Divisional round after the ${s} season`;
    return `Wild Card round after the ${s} season`;
  };
  const sideResult = (g: Row, team: string) => {
    // By franchise, so a moved team's old home games (STL, SD, OAK) aren't read as road games.
    const side = franchise(g.home_team) === franchise(team) ? 'home' : 'away';
    const other = side === 'home' ? 'away' : 'home';
    const us = num(g[`${side}_score`]), them = num(g[`${other}_score`]);
    const opp = nickname(name(g, other));
    const res = us > them ? `in a ${us}-${them} win over the ${opp}` : us < them ? `in a ${them}-${us} loss to the ${opp}` : `in a ${us}-${them} tie with the ${opp}`;
    return { us, them, opp, res, won: us > them, oppQb: g[`${other}_qb_name`] };
  };
  /** One player's best line in a game, in words, and how big a moment it was (0 = not notable). */
  const statLine = (r: Row): { line: string; score: number } => {
    const pY = z(r.passing_yards), pT = z(r.passing_tds), rY = z(r.rushing_yards), rT = z(r.rushing_tds);
    const cY = z(r.receiving_yards), cT = z(r.receiving_tds), rec = z(r.receptions), sk = z(r.def_sacks), int = z(r.def_interceptions);
    const ydsTds = (yds: number, tds: number) => `${fmt(yds)} yards${tds === 1 ? ' and a touchdown' : tds ? ` and ${tds} touchdowns` : ''}`;
    const options = [
      { score: pT >= 3 || pY >= 300 ? pT * 12 + pY / 20 : 0, line: `threw for ${ydsTds(pY, pT)}` },
      { score: rY >= 120 || rT >= 2 ? rY / 6 + rT * 12 : 0, line: `ran for ${ydsTds(rY, rT)}` },
      { score: cY >= 120 || cT >= 2 ? cY / 6 + cT * 12 : 0, line: `caught ${plural(rec, 'pass', 'passes')} for ${ydsTds(cY, cT)}` },
      { score: sk >= 2 ? sk * 18 : 0, line: `racked up ${fmt(sk)} sacks` },
      { score: int >= 2 ? int * 20 : 0, line: `picked off ${int} passes` },
    ];
    return options.sort((a, b) => b.score - a.score)[0];
  };

  const historyBySeason = new Map<number, SeasonHistory>();
  if (existsSync(HISTORY_FILE) && !REBUILD_HISTORY) {
    for (const h of JSON.parse(readFileSync(HISTORY_FILE, 'utf8')).seasons as SeasonHistory[]) historyBySeason.set(h.season, h);
  }
  let historyChanged = false;
  /** "Monday Night Football" for a regular-season game under the lights ('' for an afternoon game). */
  const primeShow = (g: Row) => {
    if (g.game_type !== 'REG') return '';
    if (g.weekday === 'Monday') return 'Monday Night Football';
    if (g.weekday === 'Thursday' && !/-11-2[2-8]$/.test(g.gameday)) return 'Thursday Night Football';
    if (g.weekday === 'Sunday' && g.gametime >= '19:00') return 'Sunday Night Football';
    return '';
  };
  const primeCat = category('prime_time', 'Prime Time', 'Big nights under the lights on Monday, Thursday and Sunday Night Football.');
  const reelCat = category('highlight_reel', 'Highlight Reel', 'The longest touchdowns, wildest returns and last-second winners of each season.');
  const comebackCat = category('comeback_kings', 'Comeback Kings', 'The biggest holes teams have climbed out of.');
  const heroCat = category('playoff_heroes', 'Playoff Heroes', 'Big postseason performances, from the Wild Card round to the Super Bowl.');
  const monsterCat = category('monster_games', 'Monster Games', 'The biggest single-game performances of each regular season.');
  for (let s = 1999; s <= lastComplete; s++) {
    // One season at a time, keeping only the columns used here, so memory stays small.
    const week = (await loadCsvIfExists(`stats_player_week_${s}.csv`, `${RELEASES}/stats_player/stats_player_week_${s}.csv`)).filter((r) => r.team && gameById.has(r.game_id));
    if (!week.length) continue;
    const teamOf = (r: Row) => { try { return teamName(r.team, s); } catch { return ''; } };

    // Playoff heroes: the five biggest postseason performances, one per game.
    const post = week.filter((r) => r.season_type === 'POST');
    const postByGroup = (pos: string) => [...new Set(post.filter((x) => posGroup(x.position) === posGroup(pos)).sort((a, b) => z(b.fantasy_points_ppr) - z(a.fantasy_points_ppr)).map((x) => x.player_display_name))];
    // A big game in a win makes a better story than one in a loss.
    const heroes = post
      .map((r) => {
        const { line, score } = statLine(r);
        return { r, line, score: score * (sideResult(gameById.get(r.game_id)!, r.team).won ? 1.4 : 1) };
      })
      .filter((h) => h.score > 0 && teamOf(h.r))
      .sort((a, b) => b.score - a.score);
    const usedGames = new Set<string>();
    let kept = 0;
    for (const { r, line } of heroes) {
      if (kept >= 5 || usedGames.has(r.game_id)) continue;
      const g = gameById.get(r.game_id)!;
      const { res } = sideResult(g, r.team);
      const who = `${nickname(teamOf(r))} ${posWord(r.position)}`;
      const clue = pick(`hero${r.game_id}${r.player_id}`, [
        `In the ${roundName(g)}, this ${who} ${line} ${res}.`,
        `This ${who} ${line} ${res} in the ${roundName(g)}.`,
        `January football brings out the best: this ${who} ${line} ${res} in the ${roundName(g)}.`,
      ]);
      const peers = postByGroup(r.position).filter((n) => n !== r.player_display_name);
      const before = heroCat.entries.length;
      add(heroCat, `hero_${r.game_id}_${r.player_id}`, clue, r.player_display_name,
        pickDistractors(r.player_display_name, peers.slice(0, 4), peers.slice(4, 30), `h${r.game_id}${r.player_id}`),
        ageDifficulty(s, lastComplete, g.game_type === 'SB' ? 2 : 3), nameAliases(r.player_display_name));
      if (heroCat.entries.length > before) { usedGames.add(r.game_id); kept++; }
    }

    // Monster games: the season's single biggest passing, rushing, receiving and sack games.
    const reg = week.filter((r) => r.season_type === 'REG');
    const monsterKeys = new Set<string>();
    const monsterDefs = [
      { col: 'passing_yards', what: 'passing game', min: 400, verb: (r: Row) => `threw for ${fmt(z(r.passing_yards))} yards` },
      { col: 'rushing_yards', what: 'rushing game', min: 180, verb: (r: Row) => `ran for ${fmt(z(r.rushing_yards))} yards` },
      { col: 'receiving_yards', what: 'receiving game', min: 180, verb: (r: Row) => `piled up ${fmt(z(r.receiving_yards))} receiving yards` },
      { col: 'def_sacks', what: 'sack game', min: 4, verb: (r: Row) => `sacked the quarterback ${fmt(z(r.def_sacks))} times` },
    ];
    for (const d of monsterDefs) {
      const top = leaders(reg, (r) => z(r[d.col]), d.col === 'def_sacks' ? 0.5 : 1);
      if (!top || z(top[0][d.col]) < d.min || !teamOf(top[0])) continue;
      const r = top[0];
      const g = gameById.get(r.game_id)!;
      const { res } = sideResult(g, r.team);
      const others = [...new Set(top.slice(1, 12).map((x) => x.player_display_name))].filter((n) => n !== r.player_display_name);
      add(monsterCat, `monster_${s}_${d.col}`,
        pick(`monster${s}${d.col}`, [
          `In Week ${num(r.week)} of ${s}, this ${nickname(teamOf(r))} ${posWord(r.position)} ${d.verb(r)} ${res}, the biggest ${d.what} of that season.`,
          `The biggest ${d.what} of ${s} came in Week ${num(r.week)}, when this ${nickname(teamOf(r))} ${posWord(r.position)} ${d.verb(r)} ${res}.`,
        ]),
        r.player_display_name, pickDistractors(r.player_display_name, others.slice(0, 7), [], `m${s}${d.col}`),
        ageDifficulty(s, lastComplete, 3), nameAliases(r.player_display_name));
      monsterKeys.add(`${r.game_id}|${r.player_id}`);
    }

    // Wrong answers for a player: the busiest players at his position that season.
    const groupCache = new Map<string, string[]>();
    const seasonPeers = (pos: string, not: string) => {
      const group = posGroup(pos);
      if (!groupCache.has(group)) {
        const totals = new Map<string, number>();
        for (const x of week) {
          if (posGroup(x.position) !== group) continue;
          const v = z(x.fantasy_points_ppr) + z(x.def_sacks) * 4 + z(x.def_interceptions) * 4 + z(x.def_tackles_solo) * 0.5 + z(x.punt_return_yards) / 10 + z(x.kickoff_return_yards) / 20;
          totals.set(x.player_display_name, (totals.get(x.player_display_name) ?? 0) + v);
        }
        groupCache.set(group, [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n));
      }
      return groupCache.get(group)!.filter((n) => n !== not);
    };

    // Prime Time: the season's five biggest nights under the lights, one per game.
    const nights = reg
      .filter((r) => primeShow(gameById.get(r.game_id)!) && !monsterKeys.has(`${r.game_id}|${r.player_id}`) && teamOf(r))
      .map((r) => {
        const { line, score } = statLine(r);
        return { r, line, score: score * (sideResult(gameById.get(r.game_id)!, r.team).won ? 1.3 : 1) };
      })
      .filter((n) => n.score > 0)
      .sort((a, b) => b.score - a.score);
    const nightGames = new Set<string>();
    for (const { r, line } of nights) {
      if (nightGames.size >= 5 || nightGames.has(r.game_id)) continue;
      const g = gameById.get(r.game_id)!;
      const show = primeShow(g);
      const { res } = sideResult(g, r.team);
      const who = `${nickname(teamOf(r))} ${posWord(r.position)}`;
      const peers = seasonPeers(r.position, r.player_display_name);
      const before = primeCat.entries.length;
      add(primeCat, `prime_${r.game_id}_${r.player_id}`, pick(`prime${r.game_id}`, [
        `On ${show} in Week ${num(r.week)} of ${s}, this ${who} ${line} ${res}.`,
        `The ${show} lights were on in Week ${num(r.week)} of ${s} when this ${who} ${line} ${res}.`,
        `A national TV audience watched this ${who} put on a show on ${show} in Week ${num(r.week)} of ${s}: he ${line} ${res}.`,
      ]), r.player_display_name, pickDistractors(r.player_display_name, peers.slice(0, 5), peers.slice(5, 30), `prime${r.game_id}`),
        ageDifficulty(s, lastComplete, 2), nameAliases(r.player_display_name));
      if (primeCat.entries.length > before) nightGames.add(r.game_id);
    }

    // Highlight Reel and Comeback Kings, from the season's play-by-play (kept in history.json).
    let hist = historyBySeason.get(s);
    if (!hist) {
      const seasonPlays = await loadPlayByPlay(s);
      if (seasonPlays.length) {
        hist = seasonHistory(s, seasonPlays, week);
        historyBySeason.set(s, hist);
        historyChanged = true;
      }
    }
    const sideOfCode = (g: Row, code: string) => (franchise(g.home_team) === franchise(code) ? 'home' : 'away') as 'home' | 'away';
    const whenOfGame = (g: Row) => (g.game_type === 'REG' ? `Week ${num(g.week)} of ${s}` : `the ${roundName(g)}`);
    const longestTd = Math.max(0, ...(hist?.plays ?? []).filter((b) => b.kind === 'longTd').map((b) => b.yards));
    for (const b of hist?.plays ?? []) {
      const g = gameById.get(b.gameId);
      if (!g) continue;
      const side = sideOfCode(g, b.team), other = side === 'home' ? 'away' : 'home';
      const team = nickname(name(g, side)), opp = nickname(name(g, other));
      const us = num(g[`${side}_score`]), them = num(g[`${other}_score`]);
      const when = whenOfGame(g), pos = posWord(b.pos), yds = b.yards;
      const v = (options: string[]) => pick(`reel${b.gameId}${b.playId}`, options);
      let clue = '', base = 3;
      switch (b.kind) {
        case 'longTd': {
          const tag = yds === longestTd ? ', the longest touchdown of that season' : '';
          if (b.via === 'run') clue = v([
            `In ${when}, this ${team} ${pos} broke loose for a ${yds}-yard touchdown run against the ${opp}${tag}.`,
            `Nobody on the ${opp} could catch this ${team} ${pos} in ${when}: ${yds} yards to the end zone${tag}.`,
          ]);
          else clue = v([
            `In ${when}, this ${team} ${pos} caught a ${yds}-yard touchdown pass${b.qb ? ` from ${b.qb}` : ''} against the ${opp}${tag}.`,
            `${b.qb ? `${b.qb} found` : 'A pass found'} this ${team} ${pos} for a ${yds}-yard touchdown against the ${opp} in ${when}${tag}.`,
          ]);
          break;
        }
        case 'pickSix':
          clue = v([
            `In ${when}, this ${team} ${pos} picked off ${b.qb || 'a pass'} and went ${yds} yards the other way for a touchdown against the ${opp}.`,
            `${b.qb ? `${b.qb} threw` : `The ${opp} threw`} one right to this ${team} ${pos}, who returned it ${yds} yards for a pick-six in ${when}.`,
          ]);
          base = 4;
          break;
        case 'fumbleTd':
          clue = `In ${when}, this ${team} ${pos} scooped up a fumble and ran it back ${yds} yards for a touchdown against the ${opp}.`;
          base = 4;
          break;
        case 'kickReturnTd':
          clue = v([
            `In ${when}, this ${team} ${pos} took a kickoff ${yds} yards to the house against the ${opp}.`,
            `The ${opp} kicked off in ${when}, and this ${team} ${pos} brought it back ${yds} yards for a touchdown.`,
          ]);
          break;
        case 'puntReturnTd':
          clue = `In ${when}, the ${opp} punted to this ${team} ${pos}, who weaved ${yds} yards for a touchdown.`;
          break;
        case 'hailMary':
          clue = `With time running out in the ${b.qtr === 2 ? 'first half' : 'game'}, ${b.qb || `the ${team} quarterback`} heaved a Hail Mary and this ${team} ${pos} came down with it, a ${yds}-yard touchdown against the ${opp} in ${when}.`;
          base = b.qtr === 2 ? 4 : 2;
          break;
        case 'clutchTd': {
          const how = b.via === 'pass'
            ? `caught a ${yds}-yard touchdown${b.qb ? ` from ${b.qb}` : ''}`
            : yds <= 2 ? `punched it in from ${yds === 1 ? 'a yard' : '2 yards'} out` : `ran in a ${yds}-yard touchdown`;
          clue = b.qtr >= 5
            ? `In overtime of ${when}, this ${team} ${pos} ${how} to beat the ${opp} ${us}-${them}.`
            : `With ${clockText(b.secondsLeft)} left in ${when}, this ${team} ${pos} ${how} to put the ${team} ahead for good. They beat the ${opp} ${us}-${them}.`;
          base = b.playoff ? 2 : 3;
          break;
        }
      }
      if (!clue) continue;
      const peers = seasonPeers(b.pos, b.player);
      add(reelCat, `reel_${b.gameId}_${b.playId}`, clue, b.player,
        pickDistractors(b.player, peers.slice(0, 5), peers.slice(5, 30), `reel${b.gameId}${b.playId}`), ageDifficulty(s, lastComplete, base), nameAliases(b.player));
    }
    for (const c of hist?.comebacks ?? []) {
      const g = gameById.get(c.gameId);
      if (!g) continue;
      const side = sideOfCode(g, c.winner), other = side === 'home' ? 'away' : 'home';
      const winner = name(g, side), loser = name(g, other);
      const hi = num(g[`${side}_score`]), lo = num(g[`${other}_score`]);
      const qb = g[`${side}_qb_name`];
      const when = whenOfGame(g);
      const seasonTeams = teamsInSeason(s, games).filter((t) => t !== loser);
      // The bigger the hole and the bigger the game, the better it is remembered.
      const base = (g.game_type !== 'REG' ? 1 : 2) + (c.deficit >= 24 ? 0 : 1);
      add(comebackCat, `comeback_${c.gameId}`, pick(`cb${c.gameId}`, [
        `Down ${c.deficit} points to the ${loser}, ${qb ? `${qb} and ` : ''}this team roared back to win ${hi}-${lo} in ${when}.`,
        `The ${loser} led by ${c.deficit} in ${when}, but ${qb ? `${qb} and ` : ''}this team stormed all the way back to win ${hi}-${lo}.`,
      ]), winner, pickDistractors(winner, [], seasonTeams, `cb${c.gameId}`), ageDifficulty(s, lastComplete, base), teamAliases(winner));
      if (qb && (c.deficit >= 21 || g.game_type !== 'REG')) {
        const qbs = [...new Set(regGames.filter((x) => num(x.season) === s).flatMap((x) => [x.home_qb_name, x.away_qb_name]).filter(Boolean))];
        add(comebackCat, `comebackqb_${c.gameId}`,
          `He was at quarterback when the ${nickname(winner)} erased a ${c.deficit}-point deficit to beat the ${nickname(loser)} ${hi}-${lo} in ${when}.`, qb,
          pickDistractors(qb, [], qbs.filter((q) => q !== g[`${other}_qb_name`]), `cbq${c.gameId}`), ageDifficulty(s, lastComplete, base + 1), nameAliases(qb));
      }
    }
  }
  if (historyChanged) {
    mkdirSync(dirname(HISTORY_FILE), { recursive: true });
    writeFileSync(HISTORY_FILE, JSON.stringify({ seasons: [...historyBySeason.values()].sort((a, b) => a.season - b.season) }));
    console.log(`Updated ${HISTORY_FILE}`);
  }

  // Thanksgiving: every game played on the fourth Thursday of November.
  const turkeyCat = category('thanksgiving', 'Turkey Day', 'Thanksgiving Day football, from Detroit and Dallas to the night game.');
  const turkeyGames = regGames.filter((g) => g.weekday === 'Thursday' && /^\d{4}-11-(2[2-8])$/.test(g.gameday));
  for (const g of turkeyGames.filter((g) => g.home_score !== g.away_score)) {
    const s = num(g.season);
    const homeWon = num(g.home_score) > num(g.away_score);
    const [w, l] = homeWon ? ['home', 'away'] as const : ['away', 'home'] as const;
    const winner = name(g, w), loser = name(g, l);
    const hi = num(g[`${w}_score`]), lo = num(g[`${l}_score`]);
    const qb = g[`${w}_qb_name`];
    const where = homeWon ? 'at home' : `on the road`;
    add(turkeyCat, `turkey_${g.game_id}`,
      pick(`turkey${g.game_id}`, [
        `On Thanksgiving ${g.gameday.slice(0, 4)}, ${qb ? `${qb} and ` : ''}this team beat the ${loser} ${hi}-${lo} ${where}.`,
        `The turkey tasted better for this team on Thanksgiving ${g.gameday.slice(0, 4)}: a ${hi}-${lo} win over the ${loser} ${where}${qb ? `, with ${qb} at quarterback` : ''}.`,
      ]), winner,
      // Wrong answers: other teams that played on Thanksgiving within a few years.
      pickDistractors(winner, [], [...new Set(turkeyGames.filter((x) => Math.abs(num(x.season) - s) <= 4).flatMap((x) => [name(x, 'home'), name(x, 'away')]))].filter((t) => t !== loser), `tg${g.game_id}`),
      ageDifficulty(s, currentSeason, 2), teamAliases(winner));
  }

  // ---- Draft ---------------------------------------------------------------
  const latestDraft = Math.max(...draft.map((d) => num(d.season)));
  const picksBy = (year: number) => draft.filter((d) => num(d.season) === year);
  const collegeCounts = new Map<string, number>();
  for (const d of draft.filter((d) => num(d.round) === 1 && d.college)) collegeCounts.set(d.college, (collegeCounts.get(d.college) ?? 0) + 1);
  const allColleges = [...collegeCounts.entries()].filter(([, n]) => n >= 5).map(([c]) => c);
  const no1Cat = category('number_one_picks', 'No. 1 Overall', 'Every first pick of the NFL Draft since 1980.');
  for (let y = 1980; y <= latestDraft; y++) {
    const firsts = picksBy(y).filter((d) => num(d.round) === 1);
    const top = firsts.find((d) => num(d.pick) === 1);
    if (!top) continue;
    const player = top.pfr_player_name, team = teamName(top.team, y);
    const from = top.college ? ` out of ${top.college}` : '';
    const feats = careerFeats(top);
    const later = feats.length ? `, then ${joinAnd(feats)}` : '';
    const samePos = firsts.filter((d) => d.position === top.position && d !== top).map((d) => d.pfr_player_name);
    add(no1Cat, `no1_${y}`, pick(`no1${y}`, [
      `The ${nickname(team)} made this ${posWord(top.position)}${from} the first pick of the ${y} draft${later}.`,
      `With the first pick of the ${y} draft, the ${nickname(team)} selected this ${posWord(top.position)}${from}${feats.length ? `, who ${joinAnd(feats)}` : ''}.`,
    ]), player,
      pickDistractors(player, samePos, firsts.slice(1, 12).map((d) => d.pfr_player_name), `no1${y}`), ageDifficulty(y, latestDraft, 1), nameAliases(player));
    add(no1Cat, `no1team_${y}`, pick(`no1t${y}`, [
      `This team used the No. 1 pick of the ${y} draft on ${top.college ? `${top.college} ` : ''}${posWord(top.position)} ${player}.`,
      cap(`${top.college ? `${top.college} ` : ''}${posWord(top.position)} ${player} was the first name called in the ${y} draft, by this team.`),
    ]), team,
      pickDistractors(team, firsts.slice(1, 6).map((d) => teamName(d.team, y)), [...new Set(picksBy(y).map((d) => teamName(d.team, y)))], `no1t${y}`),
      ageDifficulty(y, latestDraft, 2), teamAliases(team));
  }

  // Mr. Irrelevant: the last pick of every draft.
  const lastCat = category('mr_irrelevant', 'Mr. Irrelevant', 'The final pick of each NFL Draft, and who made it.');
  for (let y = 1980; y <= latestDraft; y++) {
    const picks = picksBy(y);
    if (!picks.length) continue;
    const last = picks.reduce((a, b) => (num(b.pick) > num(a.pick) ? b : a));
    const team = teamName(last.team, y);
    const famous = num(last.probowls) >= 1 || num(last.games) >= 50;
    add(lastCat, `lastpick_${y}`,
      pick(`lp${y}`, [
        `This team made ${last.college ? `${last.college} ` : ''}${posWord(last.position)} ${last.pfr_player_name} "Mr. Irrelevant," the ${ordinal(num(last.pick))} and final pick of the ${y} draft.`,
        `The ${y} draft ended when this team took ${last.college ? `${last.college} ` : ''}${posWord(last.position)} ${last.pfr_player_name} with pick No. ${num(last.pick)}, making him "Mr. Irrelevant."`,
      ]), team,
      pickDistractors(team, [], [...new Set(picks.map((d) => teamName(d.team, y)))], `lp${y}`), famous ? 3 : 4, teamAliases(team));
  }

  // Notable players: Pro Bowlers, All-Pros and Hall of Famers.
  const notable = draft.filter(
    (d) => !['K', 'P', 'LS'].includes(d.position) && (num(d.probowls) >= 3 || d.hof === 'TRUE' || (num(d.allpro) >= 1 && num(d.probowls) >= 1))
  );
  const teamsByYear = (y: number) => [...new Set(picksBy(y).map((d) => teamName(d.team, y)))];

  // The team each player spent the most seasons with, from season rosters since 1980, for
  // "made his name with the Saints" hints. A season on two teams counts for both.
  const seasonsWith = new Map<string, Map<string, number>>();
  const rosterSeen = new Set<string>();
  pastRosters.forEach((rows, i) => {
    const s = ROSTER_FROM + i;
    for (const r of rows) {
      if (!r.gsis_id || !r.team) continue;
      let team = '';
      try { team = nickname(teamName(r.team, s)); } catch { continue; }
      const key = `${r.gsis_id}|${s}|${team}`;
      if (rosterSeen.has(key)) continue;
      rosterSeen.add(key);
      const m = seasonsWith.get(r.gsis_id) ?? new Map<string, number>();
      m.set(team, (m.get(team) ?? 0) + 1);
      seasonsWith.set(r.gsis_id, m);
    }
  });
  const mainTeam = (d: Row) => {
    const m = d.gsis_id ? seasonsWith.get(d.gsis_id) : undefined;
    const ranked = m ? [...m.entries()].sort((a, b) => b[1] - a[1]) : [];
    const best = ranked[0];
    // Only name a team he clearly made his name with: 4+ seasons and more than any other team.
    return best && best[1] >= 4 && (!ranked[1] || best[1] > ranked[1][1]) ? best[0] : '';
  };

  const whoCat = category('who_am_i', 'Who Am I?', 'Guess the star from the clues: college, draft slot and what he did in the NFL.');
  for (const d of notable) {
    const y = num(d.season), player = d.pfr_player_name, team = teamName(d.team, y);
    const fame = d.hof === 'TRUE' || num(d.probowls) >= 6 ? 0 : num(d.probowls) >= 3 || num(d.pick) <= 10 ? 1 : 2;
    const decade = `${Math.floor(y / 10) * 10}s`;
    const pos = posWord(d.position);
    const from = d.college ? `${d.college} ` : '';
    const slot = draftSlot(num(d.round), num(d.pick));
    const feats = careerFeats(d);
    const starred = mainTeam(d);
    const pid = d.pfr_player_id || player;
    const peers = notable
      .filter((x) => x !== d && posGroup(x.position) === posGroup(d.position) && Math.abs(num(x.season) - y) <= 6)
      .map((x) => x.pfr_player_name);

    // Who Am I: two or three hints, the player is the answer.
    if (feats.length) {
      const where = starred && starred !== nickname(team) ? ` but made his name with the ${starred}` : '';
      const before = whoCat.entries.length;
      add(whoCat, `who_${pid}_${y}`,
        `This ${from}${pos} was ${slot} of the ${nickname(team)} in ${y}${where}, then ${joinAnd(feats)}.`, player,
        pickDistractors(player, shuffle(peers, `whop${pid}`).slice(0, 7), [], `who${pid}`), 2 + fame, nameAliases(player));
      // Hardest first: what he did, then when he was drafted, then by whom and from where.
      if (whoCat.entries.length > before) {
        whoCat.entries[before].hints = [
          `This ${pos} ${joinAnd(feats)}.`,
          `He was ${slot} in ${y}${where ? `, and${where.replace(' but', '')}` : ''}.`,
          `The ${nickname(team)} drafted him${d.college ? ` out of ${d.college}` : ''}.`,
        ];
      }
    }

    const cat = category(`drafted_by_${decade}`, `Draft Day: ${decade}`, `Which team drafted the stars of the ${decade}.`);
    const nth = num(d.pick) === 1 ? 'first' : ordinal(num(d.pick));
    add(cat, `draftteam_${pid}_${y}`, pick(`dt${pid}${y}`, [
      `In ${y}, this team drafted ${from}${pos} ${player} ${num(d.pick) === 1 ? 'first overall' : `with the ${ordinal(num(d.pick))} pick`}.`,
      cap(`${from}${pos} ${player} heard his name called by this team, ${nth} overall in ${y}.`),
      `This team spent the ${nth} pick of the ${y} draft on ${from}${pos} ${player}.`,
    ]), team,
      pickDistractors(team, [], teamsByYear(y), `dt${player}${y}`), 2 + fame, teamAliases(team));

    // Draft Steals: stars who went in Round 3 or later. The player is the answer; "which round"
    // is kept only for the biggest names taken late, since most steals went in Round 2 or 3.
    const pb = num(d.probowls);
    if (num(d.round) >= 3 && (d.hof === 'TRUE' || pb >= 3)) {
      const stealCat = category('draft_steals', 'Draft Steals', 'Stars who slipped to the third round or later.');
      const future = d.hof === 'TRUE' ? 'a future Hall of Famer' : `a future ${times(pb, 'Pro Bowler')}`;
      const pickNo = ordinal(num(d.pick));
      const waited = num(d.pick) - 1;
      const clue = pick(`steal${pid}`, [
        `${waited} players came off the board in ${y} before the ${nickname(team)} took this ${from}${pos}, ${future}, in Round ${d.round}.`,
        `The ${nickname(team)} waited until Round ${d.round} of the ${y} draft (${pickNo} overall) to take this ${from}${pos}, ${future}.`,
        `The first ${num(d.round) - 1} rounds of the ${y} draft came and went without this ${from}${pos}. The ${nickname(team)} got ${future} with the ${pickNo} pick.`,
      ]);
      add(stealCat, `steal_${pid}_${y}`, clue, player,
        pickDistractors(player, shuffle(peers, `stealp${pid}`).slice(0, 7), [], `steal${pid}`), 2 + fame + (num(d.round) >= 5 ? 0 : 1), nameAliases(player));
      if (num(d.round) >= 4 && (d.hof === 'TRUE' || pb >= 5)) {
        const round = `Round ${d.round}`;
        const rounds = Array.from({ length: Math.max(7, ...picksBy(y).map((p) => num(p.round))) }, (_, i) => `Round ${i + 1}`).filter((r) => r !== 'Round 1');
        add(stealCat, `draftround_${pid}_${y}`,
          `${from}${pos} ${player}, ${future}, lasted until this round of the ${y} draft before the ${nickname(team)} took him.`.replace(/^./, (c) => c.toUpperCase()), round,
          pickDistractors(round, [], rounds, `dr${player}${y}`), 3 + fame, [round, d.round, ordinal(num(d.round))]);
      }
    }
    if (d.college) {
      const career = starred || nickname(team);
      const accolade = num(d.probowls) >= 2 ? `${num(d.probowls)} Pro Bowls` : d.hof === 'TRUE' ? 'a Hall of Fame career' : num(d.probowls) === 1 ? 'a Pro Bowl nod' : 'a standout career';
      add(category(`colleges_${y >= 2005 ? 'modern' : 'classic'}`, y >= 2005 ? 'Before They Were Pros' : 'Before They Were Pros: Classics', 'Where NFL stars played their college football.'),
        `college_${pid}`, pick(`col${pid}`, [
          `Before ${accolade} with the ${career}, ${pos} ${player} played his college ball here.`,
          `This school sent ${pos} ${player} to the NFL, where he earned ${accolade} with the ${career}.`,
          cap(`${pos} ${player} wore this school's colors before ${accolade} with the ${career}.`),
        ]), d.college,
        pickDistractors(d.college, [], allColleges, `col${player}`), 3 + fame, [d.college]);
    }
  }

  // ---- Combine -------------------------------------------------------------
  const combineCat = category('combine', 'Speed Kills', 'Fastest 40-yard dashes at the NFL Scouting Combine.');
  for (const y of [...new Set(combine.map((c) => num(c.season)))]) {
    const runs = combine.filter((c) => num(c.season) === y && !isNaN(num(c.forty))).sort((a, b) => num(a.forty) - num(b.forty));
    if (runs.length < 8 || num(runs[0].forty) === num(runs[1].forty)) continue;
    const p = runs[0];
    let drafted = '';
    try { drafted = p.draft_team && p.draft_team !== 'NA' ? `, later drafted by the ${nickname(teamName(p.draft_team, y))},` : ''; } catch { drafted = ''; }
    // COVID canceled the 2021 Combine, so that year's times are from pro days.
    const where = y === 2021 ? `of any 2021 draft prospect (the Combine was canceled that year)` : `at the ${y} Combine`;
    add(combineCat, `forty_${y}`, pick(`forty${y}`, [
      `This ${p.school ? `${p.school} ` : ''}${posWord(p.pos)}${drafted} ran the fastest 40 ${where}: ${num(p.forty).toFixed(2)} seconds.`,
      `A ${num(p.forty).toFixed(2)}-second 40-yard dash made this ${p.school ? `${p.school} ` : ''}${posWord(p.pos)}${drafted} the fastest man ${where}.`,
    ]), p.player_name,
      pickDistractors(p.player_name, runs.slice(1, 8).map((r) => r.player_name), [], `f${y}`), ageDifficulty(y, latestDraft, 3), nameAliases(p.player_name));
  }

  // ---- Trades of notable players ------------------------------------------
  const notableById = new Map(notable.filter((d) => d.pfr_player_id).map((d) => [d.pfr_player_id, d]));
  const tradeCat = category('blockbuster_trades', 'Trade Winds', 'Where big-name players landed in trades.');
  // Rows with a pick_season are draft picks that changed hands; the player named is whoever was
  // later picked with them, not someone who was traded. Only players traded as players count.
  const playerTrades = trades.filter((t) => !t.pick_season && !t.pick_round && t.pfr_id && notableById.has(t.pfr_id) && t.pfr_name);
  for (const t of playerTrades) {
    const y = num(t.season);
    const to = teamName(t.received, y), from = teamName(t.gave, y);
    const d = notableById.get(t.pfr_id)!;
    add(tradeCat, `trade_${t.trade_id}_${t.pfr_id}`, pick(`trade${t.trade_id}${t.pfr_id}`, [
      `In ${y}, the ${from} shipped ${posWord(d.position)} ${t.pfr_name} to this team.`,
      cap(`${posWord(d.position)} ${t.pfr_name} changed addresses in ${y}, going from the ${from} to this team in a trade.`),
      `This team swung a ${y} trade with the ${from} to land ${posWord(d.position)} ${t.pfr_name}.`,
    ]), to,
      pickDistractors(to, [], teamsInSeason(y, games).filter((n) => n !== from), `tr${t.trade_id}${t.pfr_id}`), ageDifficulty(y, currentSeason, 2), teamAliases(to));
  }

  // =========================================================================
  // More kinds of column, so boards don't keep dealing the same dozen.
  // =========================================================================
  const seasonTeamRows = (s: number) =>
    [...records.entries()].filter(([k]) => k.startsWith(`${s}|`)).map(([k, r]) => ({ code: k.split('|')[1], ...r, pct: (r.w + r.t / 2) / (r.w + r.l + r.t) }));
  const clearStarter = (s: number, code: string) => {
    const qb = starterOf(s, code);
    return qb[0] && (!qb[1] || qb[1][1] < qb[0][1] - 2) ? qb[0][0] : '';
  };
  const coachesOfSeason = (s: number) => [...new Set(regGames.filter((g) => num(g.season) === s).flatMap((g) => [g.home_coach, g.away_coach]).filter(Boolean))];

  // ---- Division Champs (the eight divisions since 2002) --------------------
  const DIVISIONS: Record<string, string[]> = {
    'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'], 'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'], 'AFC South': ['HOU', 'IND', 'JAX', 'TEN'], 'AFC West': ['DEN', 'KC', 'LV', 'LAC'],
    'NFC East': ['DAL', 'NYG', 'PHI', 'WAS'], 'NFC North': ['CHI', 'DET', 'GB', 'MIN'], 'NFC South': ['ATL', 'CAR', 'NO', 'TB'], 'NFC West': ['ARI', 'LA', 'SF', 'SEA'],
  };
  const divCat = category('division_champs', 'Division Champs', 'Who won each division, season by season since 2002.');
  for (let s = 2002; s <= lastComplete; s++) {
    const rows = seasonTeamRows(s);
    for (const [div, codes] of Object.entries(DIVISIONS)) {
      const table = rows.filter((r) => codes.includes(franchise(r.code))).sort((a, b) => b.pct - a.pct);
      if (table.length < 4 || table[0].pct === table[1].pct) continue; // tiebreakers aren't in the data
      const champ = table[0];
      const team = teamName(champ.code, s), rec = recordText(champ);
      const qb = clearStarter(s, champ.code), coach = coachOfSeason(s, champ.code);
      const fate = playoffFate(s, champ.code);
      const rivals = table.slice(1).map((r) => teamName(r.code, s));
      const conf = rows.filter((r) => conference(r.code, s) === conference(champ.code, s)).map((r) => teamName(r.code, s));
      add(divCat, `div_${s}_${div}`, pick(`div${s}${div}`, [
        `${qb ? `${qb} and this team` : 'This team'} went ${rec} to win the ${s} ${div}${fate ? ` ${fate}` : ''}.`,
        `The ${s} ${div} crown went to this team, ${rec}${coach ? ` under ${coach}` : ''}.`,
        `In ${s}, this team finished on top of the ${div} at ${rec}${fate ? ` ${fate}` : ''}.`,
      ]), team, pickDistractors(team, rivals, conf, `div${s}${div}`), ageDifficulty(s, lastComplete, 1), teamAliases(team));
    }
  }

  // ---- Coaching Carousel ---------------------------------------------------
  const carouselCat = category('coaching_carousel', 'Coaching Carousel', 'Head coaches hired, fired and remembered since 1999.');
  const franchises = [...new Set(regGames.flatMap((g) => [franchise(g.home_team), franchise(g.away_team)]))];
  for (const f of franchises) {
    // Each season's head coach (whoever coached the most games), and the code the team played under.
    const bySeason: { s: number; coach: string; code: string; games: number }[] = [];
    for (let s = 1999; s <= currentSeason; s++) {
      const code = [...new Set(regGames.filter((g) => num(g.season) === s).flatMap((g) => [g.home_team, g.away_team]))].find((c) => franchise(c) === f);
      if (!code) continue;
      const top = mostCommon(teamSeasonGames(s, code).map((g) => g[`${sideOf(g, code)}_coach`]))[0];
      if (top) bySeason.push({ s, coach: top[0], code, games: top[1] });
    }
    const stints: { coach: string; from: number; to: number; code: string }[] = [];
    for (const row of bySeason) {
      const last = stints[stints.length - 1];
      if (last && last.coach === row.coach && last.to === row.s - 1) { last.to = row.s; last.code = row.code; }
      else stints.push({ coach: row.coach, from: row.s, to: row.s, code: row.code });
    }
    stints.forEach((st, i) => {
      const done = Math.min(st.to, lastComplete); // only finished seasons count toward a record
      const years = done - st.from + 1;
      const team = teamName(st.code, st.to), nickN = nickname(team);
      let w = 0, l = 0, trips = 0, rings = 0;
      for (let s = st.from; s <= done; s++) {
        const code = bySeason.find((r) => r.s === s)?.code ?? st.code;
        const r = records.get(`${s}|${code}`);
        if (r) { w += r.w; l += r.l; }
        const fate = playoffFate(s, code);
        if (fate !== 'but missed the playoffs' && fate !== '') trips++;
        if (fate.startsWith('and went on to win')) rings++;
      }
      const ring = rings ? ` and ${rings === 1 ? 'a Super Bowl title' : `${rings} Super Bowl titles`}` : '';
      const tripText = `${trips === 0 ? 'no' : trips} playoff ${trips === 1 ? 'trip' : 'trips'}`;
      const ongoing = st.to === currentSeason && currentSeason !== lastComplete;
      const openStart = st.from === 1999; // the data starts in 1999, so his first year isn't known
      const span = ongoing ? `since ${st.from}` : openStart ? `through ${st.to}` : `from ${st.from} to ${st.to}`;
      const coaches = [...new Set([...coachesOfSeason(st.from), ...coachesOfSeason(Math.min(st.to, lastComplete))])];
      const teams = teamsInSeason(Math.min(st.to, lastComplete), games);
      if (years >= 3 && !(ongoing && openStart)) {
        add(carouselCat, `stint_${f}_${st.coach}_${st.from}`, pick(`stint${f}${st.coach}`, ongoing ? [
          `He has run the ${nickN} sideline since ${st.from}, with ${w} wins, ${tripText}${ring} through ${lastComplete}.`,
          `Hired in ${st.from}, he is still the head coach of the ${team}, with ${tripText}${ring} so far.`,
        ] : [
          `He was the head coach of the ${team} ${span}, going ${w}-${l} with ${tripText}${ring}.`,
          `The ${nickN} went ${w}-${l} with him as head coach ${span}, with ${tripText}${ring}.`,
        ]), st.coach, pickDistractors(st.coach, [], coaches, `stint${f}${st.coach}`), 2 + (years >= 8 ? 0 : years >= 5 ? 1 : 2), nameAliases(st.coach));
        if (!ongoing) add(carouselCat, `stintteam_${f}_${st.coach}_${st.from}`, pick(`stintt${f}${st.coach}`, [
          `${st.coach} was this team's head coach ${span}.`,
          `This team gave ${st.coach} ${years} seasons as head coach, ${openStart ? `the last of them in ${st.to}` : `starting in ${st.from}`}.`,
        ]), team, pickDistractors(team, [], teams, `stintt${f}${st.coach}`), ageDifficulty(st.to, currentSeason, 2 + (years >= 6 ? 0 : 1)), teamAliases(team));
      }
      // The handoff: who took over from whom. Short-term fill-ins on either side are skipped.
      const prev = stints[i - 1];
      const firstYear = bySeason.find((r) => r.s === st.from);
      if (prev && prev.to === st.from - 1 && firstYear && firstYear.games >= 9 && st.from <= lastComplete) {
        add(carouselCat, `hired_${f}_${st.coach}_${st.from}`, pick(`hired${f}${st.coach}`, [
          `He took over the ${nickname(teamName(st.code, st.from))} in ${st.from}, replacing ${prev.coach}.`,
          `When the ${nickname(teamName(st.code, st.from))} moved on from ${prev.coach}, they handed the job to this coach in ${st.from}.`,
        ]), st.coach, pickDistractors(st.coach, [], coachesOfSeason(st.from), `hired${f}${st.coach}`), ageDifficulty(st.from, currentSeason, 3), nameAliases(st.coach));
      }
    });
  }

  // ---- Defense Wins Championships -----------------------------------------
  const defCat = category('defense_wins', 'Defense Wins Championships', 'Sack artists, ball hawks and the stingiest defenses of each season.');
  const defDefs = [
    { col: 'def_sacks', gap: 0.5, base: 2, clues: (who: string, v: string, s: number) => [`This ${who} led the NFL with ${v} sacks in ${s}.`, `Quarterbacks saw far too much of this ${who} in ${s}: a league-high ${v} sacks.`] },
    { col: 'def_interceptions', gap: 1, base: 3, clues: (who: string, v: string, s: number) => [`This ${who} led the NFL with ${v} interceptions in ${s}.`, `This ${who} was the league's top ball hawk in ${s}, picking off ${v} passes.`] },
    { col: 'def_fumbles_forced', gap: 1, base: 4, clues: (who: string, v: string, s: number) => [`This ${who} forced ${v} fumbles in ${s}, the most in the NFL.`, `Ball carriers beware: this ${who} punched out a league-high ${v} fumbles in ${s}.`] },
  ];
  for (const [s, rows] of statsBySeason) {
    if (!rows.length || s > lastComplete) continue;
    for (const d of defDefs) {
      const top = leaders(rows.filter((r) => r.player_display_name && r.position), (r) => num(r[d.col]), d.gap);
      if (!top) continue;
      const leader = top[0].player_display_name;
      add(defCat, `deflead_${s}_${d.col}`, pick(`def${s}${d.col}`, d.clues(whoTag(top[0], s), fmt(num(top[0][d.col])), s)), leader,
        pickDistractors(leader, top.slice(1, 8).map((r) => r.player_display_name), [], `def${s}${d.col}`), ageDifficulty(s, lastComplete, d.base), nameAliases(leader));
    }
    // The stingiest defense: fewest points allowed.
    const allowed = new Map<string, number>();
    for (const g of regGames.filter((g) => num(g.season) === s)) {
      allowed.set(g.home_team, (allowed.get(g.home_team) ?? 0) + num(g.away_score));
      allowed.set(g.away_team, (allowed.get(g.away_team) ?? 0) + num(g.home_score));
    }
    const stingy = [...allowed.entries()].sort((a, b) => a[1] - b[1]);
    if (stingy.length > 8 && stingy[0][1] < stingy[1][1]) {
      const [code, pts] = stingy[0];
      const team = teamName(code, s), coach = coachOfSeason(s, code), fate = playoffFate(s, code);
      add(defCat, `stingy_${s}`, pick(`stingy${s}`, [
        `This team's defense allowed just ${pts} points in ${s}, the fewest in the NFL${fate ? `, ${fate.replace(/^(and|but) /, (m) => (m === 'and ' ? 'and it ' : 'but it '))}` : ''}.`,
        `No defense was stingier in ${s} than this team's, which gave up only ${pts} points all season${coach ? ` under ${coach}` : ''}.`,
      ]), team, pickDistractors(team, stingy.slice(1, 8).map(([c]) => teamName(c, s)), [], `stingy${s}`), ageDifficulty(s, lastComplete, 2), teamAliases(team));
    }
  }

  // ---- Rookie Report -------------------------------------------------------
  const rookieCat = category('rookie_report', 'Rookie Report', 'First-year players who made a splash right away.');
  const rookieDefs: { col: string; min: number; line: (r: Row) => string }[] = [
    { col: 'passing_yards', min: 2200, line: (r) => `threw for ${fmt(num(r.passing_yards))} yards and ${num(r.passing_tds)} touchdowns` },
    { col: 'rushing_yards', min: 800, line: (r) => `ran for ${fmt(num(r.rushing_yards))} yards and ${num(r.rushing_tds)} touchdowns` },
    { col: 'receiving_yards', min: 800, line: (r) => `caught ${num(r.receptions)} passes for ${fmt(num(r.receiving_yards))} yards` },
    { col: 'def_sacks', min: 8, line: (r) => `racked up ${fmt(num(r.def_sacks))} sacks` },
    { col: 'def_interceptions', min: 5, line: (r) => `picked off ${num(r.def_interceptions)} passes` },
  ];
  const rookieLines: { y: number; d: Row; r: Row; def: (typeof rookieDefs)[number] }[] = [];
  for (let y = 1999; y <= lastComplete; y++) {
    const byId = new Map((statsBySeason.get(y) ?? []).map((r) => [r.player_id, r]));
    const rookies = picksBy(y).filter((d) => d.gsis_id && byId.has(d.gsis_id)).map((d) => ({ d, r: byId.get(d.gsis_id)! }));
    for (const def of rookieDefs) {
      rookies.filter((x) => num(x.r[def.col]) >= def.min).sort((a, b) => num(b.r[def.col]) - num(a.r[def.col])).slice(0, 2)
        .forEach((x) => rookieLines.push({ y, ...x, def }));
    }
  }
  for (const { y, d, r, def } of rookieLines) {
    const player = d.pfr_player_name;
    const slot = draftSlot(num(d.round), num(d.pick));
    const from = d.college ? ` out of ${d.college}` : '';
    const peers = rookieLines.filter((x) => x.d !== d && posGroup(x.d.position) === posGroup(d.position) && Math.abs(x.y - y) <= 4).map((x) => x.d.pfr_player_name);
    const classmates = picksBy(y).filter((x) => x !== d && posGroup(x.position) === posGroup(d.position) && num(x.round) <= 3).map((x) => x.pfr_player_name);
    add(rookieCat, `rookie_${y}_${def.col}_${d.pfr_player_id || player}`, pick(`rookie${y}${player}`, [
      `${cap(slot)}${from}, this ${whoTag(r, y)} ${def.line(r)} as a rookie in ${y}.`,
      `As a rookie in ${y}, this ${whoTag(r, y)} ${def.line(r)}. He had been ${slot}${from}.`,
    ]), player, pickDistractors(player, [...new Set(peers)].slice(0, 4), classmates, `rookie${y}${player}`), ageDifficulty(y, lastComplete, 2), nameAliases(player));
  }

  // ---- Fantasy Studs -------------------------------------------------------
  const fantasyCat = category('fantasy_studs', 'Fantasy Studs', 'The players who won fantasy football leagues, season by season.');
  const fantasyLine = (r: Row) => {
    const n = (k: string) => num(r[k]) || 0;
    if (r.position === 'QB') return `${fmt(n('passing_yards'))} passing yards and ${n('passing_tds') + n('rushing_tds')} total touchdowns`;
    if (r.position === 'RB') return `${fmt(n('rushing_yards') + n('receiving_yards'))} yards from scrimmage and ${n('rushing_tds') + n('receiving_tds')} touchdowns`;
    return `${n('receptions')} catches for ${fmt(n('receiving_yards'))} yards and ${n('receiving_tds')} touchdowns`;
  };
  const posPlural: Record<string, string> = { QB: 'quarterbacks', RB: 'running backs', WR: 'receivers', TE: 'tight ends' };
  for (const [s, rows] of statsBySeason) {
    if (!rows.length || s > lastComplete) continue;
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      const ranked = rows.filter((r) => r.position === pos && num(r.fantasy_points_ppr) > 0).sort((a, b) => num(b.fantasy_points_ppr) - num(a.fantasy_points_ppr));
      if (ranked.length < 8 || num(ranked[0].fantasy_points_ppr) - num(ranked[1].fantasy_points_ppr) < 1) continue;
      const names = ranked.slice(0, 10).map((r) => r.player_display_name);
      const [first, second] = ranked;
      add(fantasyCat, `fantasy_${s}_${pos}_1`, pick(`fan${s}${pos}`, [
        `Fantasy managers who drafted this ${whoTag(first, s)} in ${s} cashed in: nobody at his position scored more, thanks to ${fantasyLine(first)}.`,
        `The No. 1 fantasy ${posWord(pos)} of ${s} ${whoTag(first, s) === posWord(pos) ? '' : `played for the ${whoTag(first, s).slice(0, -posWord(pos).length - 1)} and `}put up ${fantasyLine(first)}.`,
      ]), first.player_display_name, pickDistractors(first.player_display_name, names.slice(1, 8), [], `fan${s}${pos}`),
        ageDifficulty(s, lastComplete, pos === 'TE' ? 2 : 1), nameAliases(first.player_display_name));
      if (num(second.fantasy_points_ppr) - num(ranked[2].fantasy_points_ppr) >= 1) add(fantasyCat, `fantasy_${s}_${pos}_2`,
        `Only ${first.player_display_name} scored more fantasy points at the position in ${s} than this ${whoTag(second, s)}. His line: ${fantasyLine(second)}.`,
        second.player_display_name, pickDistractors(second.player_display_name, names.filter((n) => n !== second.player_display_name).slice(1, 8), [], `fan2${s}${pos}`),
        ageDifficulty(s, lastComplete, pos === 'TE' ? 3 : 2), nameAliases(second.player_display_name));
    }
  }

  // ---- Suitcase Club -------------------------------------------------------
  const suitCat = category('suitcase_club', 'Suitcase Club', 'Well-traveled players, and the strange uniforms stars finished in.');
  // (a) Journeymen: five or more teams, from each season's stats since 1999.
  const travels = new Map<string, { name: string; pos: string; stops: { s: number; team: string }[]; pts: number }>();
  for (const [s, rows] of statsBySeason) {
    if (s > lastComplete) continue;
    for (const r of rows) {
      const code = r.recent_team;
      if (!code || !r.player_id) continue;
      let team = '';
      try { team = nickname(teamName(code, s)); } catch { continue; }
      if (team === 'Football Team' || team === 'Redskins') team = 'Washington';
      const t = travels.get(r.player_id) ?? { name: r.player_display_name, pos: r.position, stops: [], pts: 0 };
      t.stops.push({ s, team });
      t.pts += num(r.fantasy_points_ppr) || 0;
      travels.set(r.player_id, t);
    }
  }
  const journeymen = [...travels.values()]
    .map((t) => ({ ...t, teams: [...new Set(t.stops.sort((a, b) => a.s - b.s).map((x) => x.team))] }))
    .filter((t) => t.teams.length >= 5 && t.pts >= 500 && ['QB', 'RB', 'WR', 'TE'].includes(t.pos));
  for (const t of journeymen) {
    const y1 = t.stops[0].s, y2 = t.stops[t.stops.length - 1].s;
    const list = joinAnd(t.teams.map((n) => (n === 'Washington' ? n : `the ${n}`))).replace(/^the /, '');
    const peers = journeymen.filter((x) => x !== t && x.pos === t.pos).map((x) => x.name);
    add(suitCat, `suitcase_${t.name}_${y1}`, pick(`suit${t.name}`, [
      `This ${posWord(t.pos)} kept a bag packed: between ${y1} and ${y2}, his stops included the ${list}.`,
      `The ${list} all had this well-traveled ${posWord(t.pos)} on the roster between ${y1} and ${y2}.`,
    ]), t.name, pickDistractors(t.name, shuffle(peers, `suit${t.name}`).slice(0, 7), [], `suit${t.name}`), 3, nameAliases(t.name));
  }
  // (b) Strange uniforms: a longtime star's final season, spent somewhere else.
  const lastSeasonOf = new Map<string, { s: number; teams: Set<string> }>();
  pastRosters.forEach((rows, i) => {
    const s = ROSTER_FROM + i;
    for (const r of rows) {
      if (!r.gsis_id || !r.team) continue;
      const cur = lastSeasonOf.get(r.gsis_id);
      if (!cur || cur.s < s) lastSeasonOf.set(r.gsis_id, { s, teams: new Set([r.team]) });
      else if (cur.s === s) cur.teams.add(r.team);
    }
  });
  const stillActive = new Set(rosters.map((r) => r.gsis_id));
  for (const d of notable) {
    const last = d.gsis_id ? lastSeasonOf.get(d.gsis_id) : undefined;
    const m = d.gsis_id ? seasonsWith.get(d.gsis_id) : undefined;
    if (!last || !m || last.teams.size !== 1 || last.s >= lastComplete || stillActive.has(d.gsis_id)) continue;
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const [home, seasons] = ranked[0];
    let finalTeam = '';
    try { finalTeam = teamName([...last.teams][0], last.s); } catch { continue; }
    if (seasons < 7 || nickname(finalTeam) === home || (ranked[1] && ranked[1][1] >= seasons - 2)) continue;
    const spent = m.get(nickname(finalTeam)) ?? 0;
    if (spent > 2) continue; // a short last stop is the surprise
    const player = d.pfr_player_name, pos = posWord(d.position);
    const label = d.hof === 'TRUE' ? `Hall of Fame ${pos}` : num(d.probowls) === 1 ? `Pro Bowl ${pos}` : `${times(num(d.probowls), 'Pro Bowl')} ${pos}`;
    add(suitCat, `laststop_${d.pfr_player_id || player}`, pick(`laststop${player}`, [
      `After ${seasons} seasons with the ${home}, ${label} ${player} played his final season, ${last.s}, in this team's uniform.`,
      `It still looks strange: ${label} ${player}, a ${home} mainstay for ${seasons} seasons, finished his career in ${last.s} with this team.`,
    ]), finalTeam, pickDistractors(finalTeam, [], teamsInSeason(Math.max(1999, last.s), games), `laststop${player}`), 3, teamAliases(finalTeam));
  }

  // ---- Common Thread -------------------------------------------------------
  const threadCat = category('common_thread', 'Common Thread', 'Three stars with one thing in common.');
  const starValue = (d: Row) => (num(d.w_av) || 0) + (d.hof === 'TRUE' ? 40 : 0);
  const trioNames = (t: Row[]) => `${t[0].pfr_player_name}, ${t[1].pfr_player_name} and ${t[2].pfr_player_name}`;
  // Same school.
  const bySchool = new Map<string, Row[]>();
  for (const d of notable) if (d.college) bySchool.set(d.college, [...(bySchool.get(d.college) ?? []), d]);
  for (const [school, list] of bySchool) {
    const best = [...list].sort((a, b) => starValue(b) - starValue(a));
    for (let i = 0; i + 2 < best.length && i < 9; i += 3) {
      const trio = best.slice(i, i + 3);
      add(threadCat, `thread_school_${school}_${i}`, pick(`ths${school}${i}`, [
        `${trioNames(trio)} all played their college ball at this school.`,
        `The common thread for ${trioNames(trio)} is this school, where each of them starred before the NFL.`,
      ]), school, pickDistractors(school, [], allColleges, `ths${school}${i}`), 2 + i / 3, [school]);
    }
  }
  // Drafted by the same team within a few years.
  const byDraftTeam = new Map<string, Row[]>();
  for (const d of notable) byDraftTeam.set(franchise(d.team), [...(byDraftTeam.get(franchise(d.team)) ?? []), d]);
  for (const [f, list] of byDraftTeam) {
    const inOrder = [...list].filter((d) => starValue(d) >= 45).sort((a, b) => num(a.season) - num(b.season));
    let made = 0;
    for (let i = 0; i + 2 < inOrder.length && made < 5; i += 3) {
      const trio = inOrder.slice(i, i + 3);
      if (num(trio[2].season) - num(trio[0].season) > 8) { i -= 2; continue; }
      let team = '';
      try { team = teamName(trio[2].team, num(trio[2].season)); } catch { continue; }
      const text = trio.map((d) => `${d.pfr_player_name} in ${d.season}`);
      add(threadCat, `thread_team_${f}_${trio[0].pfr_player_id}`, pick(`tht${f}${i}`, [
        `This team's draft room hit on ${text[0]}, ${text[1]} and ${text[2]}.`,
        `${trioNames(trio)} were all drafted by this team, between ${trio[0].season} and ${trio[2].season}.`,
      ]), team, pickDistractors(team, [], teamsByYear(num(trio[2].season)), `tht${f}${i}`), ageDifficulty(num(trio[2].season), latestDraft, 2), teamAliases(team));
      made++;
    }
  }
  // The same first round.
  for (let y = 1980; y <= latestDraft - 4; y++) {
    const firsts = picksBy(y).filter((d) => num(d.round) === 1 && starValue(d) >= 60).sort((a, b) => starValue(b) - starValue(a)).slice(0, 3);
    if (firsts.length < 3) continue;
    const years = [1, -1, 2, -2, 3, -3, 4].map((k) => String(y + k));
    add(threadCat, `thread_class_${y}`, pick(`thc${y}`, [
      `${trioNames(firsts)} were all first-round picks in this year's draft.`,
      `One first round produced ${trioNames(firsts)}. It was the draft of this year.`,
    ]), String(y), pickDistractors(String(y), years, [], `thc${y}`), 4);
  }

  // ---- Frozen Tundra -------------------------------------------------------
  const coldCat = category('frozen_tundra', 'Frozen Tundra', 'The coldest games of the last 25 years.');
  const COLD_TOWNS = new Set(['GB', 'CHI', 'BUF', 'NE', 'KC', 'CLE', 'PIT', 'DEN', 'MIN', 'CIN', 'NYG', 'NYJ', 'PHI', 'BAL', 'WAS', 'IND', 'DET', 'SEA', 'TEN']);
  for (const g of played.filter((g) => !isNaN(num(g.temp)) && num(g.temp) <= 20 && (g.roof === 'outdoors' || g.roof === 'open') && g.home_score !== g.away_score)) {
    const s = num(g.season), t = num(g.temp);
    const cold = t < 0 ? `${-t} below zero` : t === 0 ? 'zero degrees' : `${t} degrees`;
    const coldAdj = t < 0 ? `${-t}-below-zero` : t === 0 ? 'zero-degree' : `${t}-degree`;
    const homeWon = num(g.home_score) > num(g.away_score);
    const [w, l] = homeWon ? ['home', 'away'] as const : ['away', 'home'] as const;
    const winner = name(g, w), loser = name(g, l);
    const hi = num(g[`${w}_score`]), lo = num(g[`${l}_score`]);
    const qb = g[`${w}_qb_name`];
    const when = g.game_type === 'REG' ? `Week ${num(g.week)} of ${s}` : `the ${roundName(g)}`;
    const chilly = [...new Set(games.filter((x) => num(x.season) === s).map((x) => x.home_team))].filter((c) => COLD_TOWNS.has(c)).map((c) => teamName(c, s)).filter((n) => n !== loser);
    const big = g.game_type !== 'REG';
    add(coldCat, `cold_${g.game_id}`, pick(`cold${g.game_id}`, [
      `It was ${cold} at kickoff when ${qb ? `${qb} and ` : ''}this team beat the ${loser} ${hi}-${lo} ${homeWon ? 'at home' : 'on the road'} in ${when}.`,
      `In ${when}, ${qb ? `${qb} and ` : ''}this team won a ${coldAdj} deep freeze, beating the ${loser} ${hi}-${lo} ${homeWon ? 'at home' : 'on the road'}.`,
    ]), winner, pickDistractors(winner, [], chilly.concat(teamsInSeason(s, games).filter((n) => n !== loser)), `cold${g.game_id}`), ageDifficulty(s, currentSeason, big ? 1 : 3), teamAliases(winner));
    if (qb && (big || t <= 5)) {
      const qbs = [...new Set(regGames.filter((x) => num(x.season) === s).flatMap((x) => [x.home_qb_name, x.away_qb_name]).filter(Boolean))];
      add(coldCat, `coldqb_${g.game_id}`,
        `He was the winning quarterback in ${when}, played in ${coldAdj} cold${g.stadium ? ` at ${theStadium(g.stadium)}` : ''}: ${nickname(winner)} ${hi}, ${nickname(loser)} ${lo}.`, qb,
        pickDistractors(qb, [], qbs.filter((q) => q !== g[`${l}_qb_name`]), `coldq${g.game_id}`), ageDifficulty(s, currentSeason, big ? 2 : 3), nameAliases(qb));
    }
  }

  // ---- Show Me the Money ---------------------------------------------------
  const moneyCat = category('show_me_the_money', 'Show Me the Money', 'The biggest contracts in the game, and who signed them.');
  const contracts = await loadGzCsvIfExists('historical_contracts.csv.gz', `${RELEASES}/contracts/historical_contracts.csv.gz`);
  const OTC_POSITIONS: Record<string, string> = {
    QB: 'quarterback', RB: 'running back', FB: 'fullback', WR: 'receiver', TE: 'tight end', LT: 'tackle', RT: 'tackle', LG: 'guard', RG: 'guard', C: 'center',
    ED: 'edge rusher', IDL: 'defensive tackle', LB: 'linebacker', CB: 'cornerback', S: 'safety', K: 'kicker', P: 'punter',
  };
  const millions = (v: number) => `$${v >= 100e6 ? Math.round(v / 1e6) : (Math.round(v / 1e5) / 10).toString().replace(/\.0$/, '')} million`;
  // The same deal listed under two teams means the player was moved: which team signed it isn't clear, so skip it.
  const dealTeams = new Map<string, Set<string>>();
  const dealKey = (c: Row) => `${c.otc_id || c.player}|${c.year_signed}|${c.value}`;
  for (const c of contracts) dealTeams.set(dealKey(c), (dealTeams.get(dealKey(c)) ?? new Set<string>()).add(c.team));
  const deals = contracts.filter((c) => c.player && c.team && !c.team.includes('/') && dealTeams.get(dealKey(c))!.size === 1 && OTC_POSITIONS[c.position] && num(c.years) >= 2 && num(c.value) >= 30e6 && !isNaN(num(c.year_signed)));
  const dealTeam = (c: Row) => (c.team === 'Commanders' ? nickname(teamName('WAS', num(c.year_signed))) : c.team);
  const topDeals: Row[] = [];
  for (const y of [...new Set(deals.map((c) => num(c.year_signed)))].sort()) {
    const seen = new Set<string>();
    for (const c of deals.filter((c) => num(c.year_signed) === y).sort((a, b) => num(b.value) - num(a.value))) {
      if (seen.has(c.player) || seen.size >= 10) continue;
      seen.add(c.player);
      topDeals.push(c);
    }
  }
  for (const c of topDeals) {
    const y = num(c.year_signed), pos = OTC_POSITIONS[c.position];
    const money = millions(num(c.value)), sure = num(c.guaranteed) >= 10e6 ? millions(num(c.guaranteed)) : '';
    const peers = topDeals.filter((x) => x.player !== c.player && OTC_POSITIONS[x.position] === pos && Math.abs(num(x.year_signed) - y) <= 3).map((x) => x.player);
    const sameYear = topDeals.filter((x) => x.player !== c.player && num(x.year_signed) === y).map((x) => x.player);
    // The size of the deal is the fame of the deal: the record-setters are the cheap tiles.
    add(moneyCat, `deal_${c.otc_id || c.player}_${y}`, pick(`deal${c.player}${y}`, [
      `In ${y}, the ${dealTeam(c)} gave this ${pos} a ${num(c.years)}-year, ${money} contract${sure ? `, ${sure} of it guaranteed` : ''}.`,
      `Show him the money: this ${dealTeam(c)} ${pos} signed for ${money} over ${num(c.years)} years in ${y}.`,
    ]), c.player, pickDistractors(c.player, [...new Set(peers)].slice(0, 5), [...new Set(sameYear)], `deal${c.player}${y}`), num(c.value) >= 100e6 ? 2 : num(c.value) >= 60e6 ? 3 : 4, nameAliases(c.player));
  }

  // ---- Write ---------------------------------------------------------------
  const out = [...categories.values()].filter((c) => c.entries.length >= 5);
  // Drop accidental duplicates (same id from two templates).
  for (const c of out) c.entries = c.entries.filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i);
  // Grade each column on a curve: its easiest fifth are the cheap tiles and its hardest fifth
  // the expensive ones, so every column can fill a board row by row at the right level.
  for (const c of out) {
    const ranked = [...c.entries].sort((a, b) => (a.rank ?? a.difficulty) - (b.rank ?? b.difficulty) || a.id.localeCompare(b.id));
    ranked.forEach((e, i) => {
      e.difficulty = 1 + Math.floor((i * 5) / ranked.length);
      delete e.rank;
    });
  }
  const total = out.reduce((n, c) => n + c.entries.length, 0);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    dataThrough: currentSeason !== lastComplete ? `${currentSeason} season, Week ${latestFullWeek}` : `${lastComplete} season`,
    source: 'nflverse (https://github.com/nflverse), CC BY 4.0',
    questionCount: total,
    categories: out,
  }));
  console.log(`Wrote ${total} questions in ${out.length} categories to ${OUT}`);
  for (const c of out) {
    const byDiff = [1, 2, 3, 4, 5].map((d) => c.entries.filter((e) => e.difficulty === d).length).join('/');
    console.log(`  ${c.title.padEnd(36)} ${String(c.entries.length).padStart(4)}  (difficulty 1-5: ${byDiff})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
