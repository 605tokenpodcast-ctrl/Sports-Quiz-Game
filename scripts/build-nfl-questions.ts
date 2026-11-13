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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'nflverse');
const OUT = join(ROOT, 'public', 'questions', 'nfl.json');
const OFFLINE = process.argv.includes('--offline');

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
  // Questions flagged as bad in a game (see SKIP_IDS) are left out.
  if (SKIP_IDS.has(hashId(key))) return;
  // Nothing the clue names, and no Round 1 for a player who "lasted until" a later round.
  distractors = distractors.filter((d) => !namedInClue(clue, d) && !(/lasted until this round/.test(clue) && d === 'Round 1'));
  if (distractors.length < 3) return; // not enough plausible wrong answers to ask it fairly
  cat.entries.push({
    id: hashId(key),
    clue,
    answer,
    distractors,
    aliases: [...new Set(aliases.map((a) => a.toLowerCase()))],
    difficulty: clamp(difficulty),
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

    add(sbCat, `${key}_winner`, `This team capped the ${season} season by beating the ${loser} ${ws}-${ls} in ${sb}${at}.`, winner,
      pickDistractors(winner, [], playoffTeams.concat(allTeams).filter((t) => t !== loser), key + 'w'), ageDifficulty(season, lastComplete, 1), teamAliases(winner));
    add(sbCoachCat, `${key}_loser`, `The ${winner} beat this team ${ws}-${ls} in ${sb}.`, loser,
      pickDistractors(loser, [], playoffTeams.concat(allTeams), key + 'l'), ageDifficulty(season, lastComplete, 2), teamAliases(loser));

    const qbs = [...new Set(played.filter((x) => num(x.season) === season).flatMap((x) => [x.home_qb_name, x.away_qb_name]).filter(Boolean))];
    const winQb = g[`${w}_qb_name`], loseQb = g[`${l}_qb_name`];
    if (winQb) add(sbCat, `${key}_qb`,
      `He quarterbacked the ${season} ${nickname(winner)} to a ${ws}-${ls} win over the ${nickname(loser)}${loseQb ? ` and ${loseQb}` : ''} in ${sb}.`, winQb,
      pickDistractors(winQb, [], qbs.filter((q) => q !== loseQb), key + 'q'), ageDifficulty(season, lastComplete, 2), nameAliases(winQb));

    const coaches = [...new Set(played.filter((x) => num(x.season) === season).flatMap((x) => [x.home_coach, x.away_coach]).filter(Boolean))];
    const winCoach = g[`${w}_coach`];
    if (winCoach) add(sbCoachCat, `${key}_coach`,
      `He was the head coach on the winning sideline when the ${winner} beat the ${nickname(loser)} in ${sb}.`, winCoach,
      pickDistractors(winCoach, [g[`${l}_coach`]], coaches, key + 'c'), ageDifficulty(season, lastComplete, 2), nameAliases(winCoach));

    const stadiums = [...stadiumGames.entries()].filter(([, n]) => n >= 40).map(([s]) => s);
    if (g.stadium) add(sbCoachCat, `${key}_venue`, `${sb}, a ${ws}-${ls} win for the ${nickname(winner)} over the ${nickname(loser)}, was played in this stadium.`, g.stadium,
      pickDistractors(g.stadium, [], stadiums, key + 's'), ageDifficulty(season, lastComplete, 3));

    const score = (a: number, b: number) => `${a}-${b}`;
    const fakeScores = [[ws + 3, ls], [ws, ls + 7], [ws - 3, ls - 3], [ws + 7, ls + 3], [ws + 4, ls - 3], [ws - 4, ls + 1], [ws + 10, ls + 7]]
      .filter(([a, b]) => b >= 0 && a > b).map(([a, b]) => score(a, b));
    add(sbCoachCat, `${key}_score`, `The final score of ${sb}, won by the ${winner}${winQb ? ` behind ${winQb}` : ''} over the ${loser}.`, score(ws, ls),
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
    add(conCat, `${key}_w`, `${winQb ? `With ${winQb} at quarterback, this` : 'This'} team won the ${conf} title after the ${season} season, beating the ${nickname(loser)} ${hi}-${lo}.`, winner,
      pickDistractors(winner, [], confTeams.filter((t) => t !== loser), key + 'w'), ageDifficulty(season, currentSeason, 2), teamAliases(winner));
    add(conCat, `${key}_l`, `The ${winner} punched their Super Bowl ticket after the ${season} season with a ${hi}-${lo} ${conf} Championship win over this team.`, loser,
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
    const keySuffix = live ? `_wk${latestFullWeek}` : '';
    if (byPct[0].pct > byPct[1].pct) {
      const best = teamName(byPct[0].code, s);
      const clue = live
        ? `${leadIn(s, byPct[0].code)}this team has the NFL's best record through Week ${latestFullWeek} of ${s}, at ${recordText(byPct[0])}.`
        : `${leadIn(s, byPct[0].code)}this team went ${recordText(byPct[0])} for the NFL's best record in ${s}.`;
      add(cat, `best_${s}${keySuffix}`, clue.charAt(0).toUpperCase() + clue.slice(1), best,
        pickDistractors(best, byPct.slice(1, 8).map((r) => teamName(r.code, s)), [], `best${s}`), live ? 1 : ageDifficulty(s, currentSeason, 2), teamAliases(best));
    }
    const worst = byPct[byPct.length - 1];
    if (worst.pct < byPct[byPct.length - 2].pct) {
      const team = teamName(worst.code, s);
      const clue = live
        ? `${leadIn(s, worst.code)}this team has the NFL's worst record through Week ${latestFullWeek} of ${s}, at ${recordText(worst)}.`
        : `${leadIn(s, worst.code)}this team stumbled to a league-worst ${recordText(worst)} in ${s}.`;
      add(cat, `worst_${s}${keySuffix}`, clue.charAt(0).toUpperCase() + clue.slice(1), team,
        pickDistractors(team, byPct.slice(-8, -1).reverse().map((r) => teamName(r.code, s)), [], `worst${s}`), live ? 2 : ageDifficulty(s, currentSeason, 2), teamAliases(team));
    }
    if (live) continue;
    for (const r of rows.filter((r) => r.w >= 13 || r.w <= 3)) {
      const team = teamName(r.code, s);
      const coach = coachOfSeason(s, r.code);
      const opts = [r.w - 2, r.w - 1, r.w + 1, r.w + 2, r.w - 3, r.w + 3].filter((n) => n >= 0 && n <= r.w + r.l + r.t).map(String);
      add(recCat, `wins_${s}_${r.code}`,
        `The number of regular-season games won by the ${s} ${team}${coach ? `, coached by ${coach}` : ''}.`, String(r.w),
        pickDistractors(String(r.w), opts, [], `wins${s}${r.code}`), ageDifficulty(s, currentSeason, 3));
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
      add(qbCat, `qb_${s}_${code}`,
        `He started ${top[1]} games at quarterback for the ${s} ${team}, who went ${rec ? recordText(rec) : 'on'}${coach ? ` under ${coach}` : ''} and made the playoffs.`, top[0],
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
      const top = leaders(rows, (r) => num(r[d.col]), d.gap);
      if (!top) continue;
      const leader = top[0].player_display_name;
      const value = num(top[0][d.col]);
      const others = top.slice(1, 8).map((r) => r.player_display_name);
      if (live) {
        add(category('this_season', `${s} Season So Far`, ''), `lead_${s}_${d.col}_wk${latestFullWeek}`,
          `Through Week ${latestFullWeek} of ${s}, this ${whoTag(top[0], s)} leads the NFL with ${fmt(value)} ${d.label}.`, leader,
          pickDistractors(leader, others, [], `l${s}${d.col}`), d.base, nameAliases(leader));
      } else {
        add(category(d.cat, d.title, `Single-season NFL leaders in ${d.label} and more, 1999 to now.`),
          `lead_${s}_${d.col}`, `This ${whoTag(top[0], s)} led the NFL with ${fmt(value)} ${d.label} in ${s}.`, leader,
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
        const side = g.home_team === r.team ? 'home' : 'away';
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
          add(thisCat, `teamlead_${cs}_${code}_${d.col}_wk${latestFullWeek}`,
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
      add(coachCat, `coach_${cs}_${code}_${coach}`, `He's the head coach of the ${team}${rec ? `, ${recordText(rec)} so far this season` : ' this season'}.`, coach,
        pickDistractors(coach, [], [...coachOf.values()], `coach${code}`), coachDiff + 1, nameAliases(coach));
      add(coachCat, `coachteam_${cs}_${code}_${coach}`, `${coach} runs the sideline for this team in ${cs}.`, team,
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
      add(stadiumCat, `stadium_${stadium}_${tenants[0][0]}`, `This team plays its home games ${roofHint}at ${stadium}.`, team,
        pickDistractors(team, [], allTeamsNow, `st${stadium}`), 2, teamAliases(team));
      add(stadiumCat, `stadiumq_${stadium}_${tenants[0][0]}`, `The ${team} call this stadium home.`, stadium,
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
      add(playersCat, `team_${cs}_${p.player_id}_${r.team}`, `${posWord(r.position).replace(/^./, (c) => c.toUpperCase())} ${p.player_display_name}${college} suits up for this team in ${cs}.`, team,
        // The league's biggest names are the cheap tiles; deeper down the list costs more.
        pickDistractors(team, [], allTeamsNow, `pt${p.player_id}`), rank < 20 ? 1 : rank < 45 ? 2 : rank < 70 ? 3 : 4, teamAliases(team));
    }
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
    const side = g.home_team === team ? 'home' : 'away';
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
      const clue = `In the ${roundName(g)}, this ${nickname(teamOf(r))} ${posWord(r.position)} ${line} ${res}.`;
      const peers = postByGroup(r.position).filter((n) => n !== r.player_display_name);
      const before = heroCat.entries.length;
      add(heroCat, `hero_${r.game_id}_${r.player_id}`, clue, r.player_display_name,
        pickDistractors(r.player_display_name, peers.slice(0, 4), peers.slice(4, 30), `h${r.game_id}${r.player_id}`),
        ageDifficulty(s, lastComplete, g.game_type === 'SB' ? 2 : 3), nameAliases(r.player_display_name));
      if (heroCat.entries.length > before) { usedGames.add(r.game_id); kept++; }
    }

    // Monster games: the season's single biggest passing, rushing, receiving and sack games.
    const reg = week.filter((r) => r.season_type === 'REG');
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
        `In Week ${num(r.week)} of ${s}, this ${nickname(teamOf(r))} ${posWord(r.position)} ${d.verb(r)} ${res}, the biggest ${d.what} of that season.`,
        r.player_display_name, pickDistractors(r.player_display_name, others.slice(0, 7), [], `m${s}${d.col}`),
        ageDifficulty(s, lastComplete, 3), nameAliases(r.player_display_name));
    }
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
      `On Thanksgiving ${g.gameday.slice(0, 4)}, ${qb ? `${qb} and ` : ''}this team beat the ${loser} ${hi}-${lo} ${where}.`, winner,
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
    add(no1Cat, `no1_${y}`, `The ${nickname(team)} made this ${posWord(top.position)}${from} the first pick of the ${y} draft${later}.`, player,
      pickDistractors(player, samePos, firsts.slice(1, 12).map((d) => d.pfr_player_name), `no1${y}`), ageDifficulty(y, latestDraft, 1), nameAliases(player));
    add(no1Cat, `no1team_${y}`, `This team used the No. 1 pick of the ${y} draft on ${top.college ? `${top.college} ` : ''}${posWord(top.position)} ${player}.`, team,
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
      `This team made ${last.college ? `${last.college} ` : ''}${posWord(last.position)} ${last.pfr_player_name} "Mr. Irrelevant," the ${ordinal(num(last.pick))} and final pick of the ${y} draft.`, team,
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
    add(cat, `draftteam_${pid}_${y}`, `In ${y}, this team drafted ${from}${pos} ${player} ${num(d.pick) === 1 ? 'first overall' : `with the ${ordinal(num(d.pick))} pick`}.`, team,
      pickDistractors(team, [], teamsByYear(y), `dt${player}${y}`), 2 + fame, teamAliases(team));

    if (num(d.round) >= 2) {
      const round = `Round ${d.round}`;
      const rounds = Array.from({ length: Math.max(7, ...picksBy(y).map((p) => num(p.round))) }, (_, i) => `Round ${i + 1}`);
      const future = num(d.probowls) >= 2 ? `a future ${times(num(d.probowls), 'Pro Bowler')}` : d.hof === 'TRUE' ? 'a future Hall of Famer' : 'a future star';
      add(category('draft_steals', 'Draft Steals', 'Stars who slipped past the first round.'), `draftround_${pid}_${y}`,
        `${from}${pos} ${player}, ${future}, lasted until this round of the ${y} draft before the ${nickname(team)} took him.`.replace(/^./, (c) => c.toUpperCase()), round,
        pickDistractors(round, [], rounds, `dr${player}${y}`), 3 + fame, [round, d.round, ordinal(num(d.round))]);
    }
    if (d.college) {
      const career = starred || nickname(team);
      const accolade = num(d.probowls) >= 2 ? `${num(d.probowls)} Pro Bowls` : d.hof === 'TRUE' ? 'a Hall of Fame career' : num(d.probowls) === 1 ? 'a Pro Bowl nod' : 'a standout career';
      add(category(`colleges_${y >= 2005 ? 'modern' : 'classic'}`, y >= 2005 ? 'Before They Were Pros' : 'Before They Were Pros: Classics', 'Where NFL stars played their college football.'),
        `college_${pid}`, `Before ${accolade} with the ${career}, ${pos} ${player} played his college ball here.`, d.college,
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
    add(combineCat, `forty_${y}`, `This ${p.school ? `${p.school} ` : ''}${posWord(p.pos)}${drafted} ran the fastest 40 ${where}: ${num(p.forty).toFixed(2)} seconds.`, p.player_name,
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
    add(tradeCat, `trade_${t.trade_id}_${t.pfr_id}`, `In ${y}, the ${from} shipped ${posWord(d.position)} ${t.pfr_name} to this team.`, to,
      pickDistractors(to, [], teamsInSeason(y, games).filter((n) => n !== from), `tr${t.trade_id}${t.pfr_id}`), ageDifficulty(y, currentSeason, 2), teamAliases(to));
  }

  // ---- Write ---------------------------------------------------------------
  const out = [...categories.values()].filter((c) => c.entries.length >= 5);
  // Drop accidental duplicates (same id from two templates).
  for (const c of out) c.entries = c.entries.filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i);
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
