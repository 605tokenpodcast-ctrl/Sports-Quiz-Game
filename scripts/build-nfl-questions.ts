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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'nflverse');
const OUT = join(ROOT, 'public', 'questions', 'nfl.json');
const OFFLINE = process.argv.includes('--offline');

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

async function loadCsvIfExists(file: string, url: string): Promise<Row[]> {
  try {
    return await loadCsv(file, url);
  } catch {
    return [];
  }
}

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

function teamAliases(full: string): string[] {
  return [full, nickname(full), full.replace(` ${nickname(full)}`, '')];
}

function add(
  cat: Category,
  key: string,
  clue: string,
  answer: string,
  distractors: string[],
  difficulty: number,
  aliases: string[] = [answer]
) {
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
  const played = games.filter((g) => g.home_score !== '' && g.away_score !== '');
  const currentSeason = Math.max(...games.map((g) => num(g.season)));
  const lastComplete = Math.max(...played.filter((g) => g.game_type === 'SB').map((g) => num(g.season)));
  const currentWeeks = played.filter((g) => num(g.season) === currentSeason && g.game_type === 'REG').map((g) => num(g.week));
  const throughWeek = currentWeeks.length ? Math.max(...currentWeeks) : 0;
  // Only count the latest week once every game in it is final.
  const weekDone = (w: number) =>
    games.filter((g) => num(g.season) === currentSeason && num(g.week) === w).every((g) => g.home_score !== '');
  const latestFullWeek = weekDone(throughWeek) ? throughWeek : throughWeek - 1;

  const [rosters, weekStats, ...seasonStats] = await Promise.all([
    loadCsvIfExists(`roster_${currentSeason}.csv`, `${RELEASES}/rosters/roster_${currentSeason}.csv`),
    loadCsvIfExists(`stats_player_week_${currentSeason}.csv`, `${RELEASES}/stats_player/stats_player_week_${currentSeason}.csv`),
    ...Array.from({ length: currentSeason - 1999 + 1 }, (_, i) =>
      loadCsvIfExists(`stats_player_reg_${1999 + i}.csv`, `${RELEASES}/stats_player/stats_player_reg_${1999 + i}.csv`)
    ),
  ]);
  const statsBySeason = new Map<number, Row[]>();
  seasonStats.forEach((rows, i) => statsBySeason.set(1999 + i, rows));

  const name = (g: Row, side: 'home' | 'away') => teamName(g[`${side}_team`], num(g.season));
  const stadiumGames = new Map<string, number>();
  for (const g of played) if (g.stadium) stadiumGames.set(g.stadium, (stadiumGames.get(g.stadium) ?? 0) + 1);

  // ---- Super Bowls --------------------------------------------------------
  const sbCat = category('super_bowl', 'Super Bowl Sunday', 'Champions, quarterbacks, coaches and venues of every Super Bowl since 2000.');
  const sbCoachCat = category('super_bowl_details', 'Super Bowl Deep Cuts', 'Losing teams, winning coaches, stadiums and final scores.');
  for (const g of played.filter((g) => g.game_type === 'SB')) {
    const season = num(g.season);
    const sb = `Super Bowl ${roman(season - 1965)}`;
    const homeWon = num(g.home_score) > num(g.away_score);
    const [w, l] = homeWon ? ['home', 'away'] as const : ['away', 'home'] as const;
    const winner = name(g, w), loser = name(g, l);
    const playoffTeams = [...new Set(played.filter((x) => num(x.season) === season && x.game_type !== 'REG').flatMap((x) => [name(x, 'home'), name(x, 'away')]))];
    const allTeams = teamsInSeason(season, games);
    const key = `sb_${season}`;

    add(sbCat, `${key}_winner`, `Which team won ${sb}, which capped the ${season} season?`, winner,
      pickDistractors(winner, [loser], playoffTeams.concat(allTeams), key + 'w'), ageDifficulty(season, lastComplete, 1), teamAliases(winner));
    add(sbCoachCat, `${key}_loser`, `Which team lost ${sb} to the ${winner}?`, loser,
      pickDistractors(loser, [], playoffTeams.concat(allTeams), key + 'l'), ageDifficulty(season, lastComplete, 2), teamAliases(loser));

    const qbs = [...new Set(played.filter((x) => num(x.season) === season).flatMap((x) => [x.home_qb_name, x.away_qb_name]).filter(Boolean))];
    const winQb = g[`${w}_qb_name`];
    if (winQb) add(sbCat, `${key}_qb`, `Who was the winning starting quarterback in ${sb}?`, winQb,
      pickDistractors(winQb, [g[`${l}_qb_name`]], qbs, key + 'q'), ageDifficulty(season, lastComplete, 2), nameAliases(winQb));

    const coaches = [...new Set(played.filter((x) => num(x.season) === season).flatMap((x) => [x.home_coach, x.away_coach]).filter(Boolean))];
    const winCoach = g[`${w}_coach`];
    if (winCoach) add(sbCoachCat, `${key}_coach`, `Who was the head coach of the ${winner} when they won ${sb}?`, winCoach,
      pickDistractors(winCoach, [g[`${l}_coach`]], coaches, key + 'c'), ageDifficulty(season, lastComplete, 2), nameAliases(winCoach));

    const stadiums = [...stadiumGames.entries()].filter(([, n]) => n >= 40).map(([s]) => s);
    if (g.stadium) add(sbCoachCat, `${key}_venue`, `Which stadium hosted ${sb} between the ${winner} and ${loser}?`, g.stadium,
      pickDistractors(g.stadium, [], stadiums, key + 's'), ageDifficulty(season, lastComplete, 3));

    const ws = num(g[`${w}_score`]), ls = num(g[`${l}_score`]);
    const score = (a: number, b: number) => `${a}-${b}`;
    const fakeScores = [[ws + 3, ls], [ws, ls + 7], [ws - 3, ls - 3], [ws + 7, ls + 3], [ws + 4, ls - 3], [ws - 4, ls + 1], [ws + 10, ls + 7]]
      .filter(([a, b]) => b >= 0 && a > b).map(([a, b]) => score(a, b));
    add(sbCoachCat, `${key}_score`, `What was the final score of ${sb}, won by the ${winner} over the ${loser}?`, score(ws, ls),
      pickDistractors(score(ws, ls), fakeScores, [], key + 'x'), ageDifficulty(season, lastComplete, 4));
  }

  // ---- Conference championships ------------------------------------------
  const conCat = category('conference_title', 'Championship Weekend', 'AFC and NFC Championship Game winners and losers.');
  for (const g of played.filter((g) => g.game_type === 'CON')) {
    const season = num(g.season);
    const homeWon = num(g.home_score) > num(g.away_score);
    const winner = name(g, homeWon ? 'home' : 'away'), loser = name(g, homeWon ? 'away' : 'home');
    const conf = conference(g.home_team, season);
    const confTeams = [...new Set(games.filter((x) => num(x.season) === season).flatMap((x) => [x.home_team, x.away_team]))]
      .filter((c) => conference(c, season) === conf).map((c) => teamName(c, season));
    const key = `con_${season}_${conf}`;
    add(conCat, `${key}_w`, `Which team won the ${conf} Championship Game after the ${season} regular season?`, winner,
      pickDistractors(winner, [loser], confTeams, key + 'w'), ageDifficulty(season, currentSeason, 2), teamAliases(winner));
    add(conCat, `${key}_l`, `Which team did the ${winner} beat in the ${season} season's ${conf} Championship Game?`, loser,
      pickDistractors(loser, [], confTeams.filter((t) => t !== winner), key + 'l'), ageDifficulty(season, currentSeason, 3), teamAliases(loser));
  }

  // ---- Regular-season records --------------------------------------------
  const recCat = category('records', 'Best and Worst Seasons', 'The NFL\'s top and bottom regular-season records.');
  const records = new Map<string, { w: number; l: number; t: number }>();
  for (const g of played.filter((g) => g.game_type === 'REG')) {
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
  for (let s = 1999; s <= currentSeason; s++) {
    const rows = [...records.entries()].filter(([k]) => k.startsWith(`${s}|`)).map(([k, r]) => ({ code: k.split('|')[1], ...r, pct: (r.w + r.t / 2) / (r.w + r.l + r.t) }));
    if (!rows.length) continue;
    const live = s === currentSeason && s !== lastComplete;
    if (live && latestFullWeek < 4) continue;
    const when = live ? `through Week ${latestFullWeek} of the ${s} season` : `in the ${s} regular season`;
    const cat = live ? category('this_season', `${s} Season So Far`, 'Fresh questions from this season, updated every week.') : recCat;
    const byPct = [...rows].sort((a, b) => b.pct - a.pct);
    const keySuffix = live ? `_wk${latestFullWeek}` : '';
    if (byPct[0].pct > byPct[1].pct) {
      const best = teamName(byPct[0].code, s);
      add(cat, `best_${s}${keySuffix}`, `Which team had the NFL's best record ${when} (${recordText(byPct[0])})?`, best,
        pickDistractors(best, byPct.slice(1, 8).map((r) => teamName(r.code, s)), [], `best${s}`), live ? 2 : ageDifficulty(s, currentSeason, 2), teamAliases(best));
    }
    const worst = byPct[byPct.length - 1];
    if (worst.pct < byPct[byPct.length - 2].pct) {
      const team = teamName(worst.code, s);
      add(cat, `worst_${s}${keySuffix}`, `Which team had the NFL's worst record ${when} (${recordText(worst)})?`, team,
        pickDistractors(team, byPct.slice(-8, -1).reverse().map((r) => teamName(r.code, s)), [], `worst${s}`), live ? 2 : ageDifficulty(s, currentSeason, 2), teamAliases(team));
    }
    if (live) continue;
    for (const r of rows.filter((r) => r.w >= 13 || r.w <= 3)) {
      const team = teamName(r.code, s);
      const opts = [r.w - 2, r.w - 1, r.w + 1, r.w + 2, r.w - 3, r.w + 3].filter((n) => n >= 0 && n <= r.w + r.l + r.t).map(String);
      add(recCat, `wins_${s}_${r.code}`, `How many regular-season games did the ${s} ${team} win?`, String(r.w),
        pickDistractors(String(r.w), opts, [], `wins${s}${r.code}`), ageDifficulty(s, currentSeason, 3));
    }
  }

  // ---- Starting quarterbacks of playoff teams -----------------------------
  const qbCat = category('playoff_qbs', 'Playoff Quarterbacks', 'Who was under center for the playoff teams of the past 25 years.');
  for (let s = 1999; s <= lastComplete; s++) {
    const seasonGames = played.filter((g) => num(g.season) === s && g.game_type === 'REG');
    const playoffCodes = new Set(played.filter((g) => num(g.season) === s && g.game_type !== 'REG').flatMap((g) => [g.home_team, g.away_team]));
    const allQbs = [...new Set(seasonGames.flatMap((g) => [g.home_qb_name, g.away_qb_name]).filter(Boolean))];
    for (const code of playoffCodes) {
      const starts = new Map<string, number>();
      for (const g of seasonGames) {
        const qb = g.home_team === code ? g.home_qb_name : g.away_team === code ? g.away_qb_name : '';
        if (qb) starts.set(qb, (starts.get(qb) ?? 0) + 1);
      }
      const [top, second] = [...starts.entries()].sort((a, b) => b[1] - a[1]);
      if (!top || top[1] < 9 || (second && second[1] >= top[1] - 2)) continue; // only clear-cut starters
      const team = teamName(code, s);
      add(qbCat, `qb_${s}_${code}`, `Who was the main starting quarterback for the ${s} ${team}, who made the playoffs that year?`, top[0],
        pickDistractors(top[0], [], allQbs, `qb${s}${code}`), ageDifficulty(s, lastComplete, 2), nameAliases(top[0]));
    }
  }

  // ---- Season stat leaders ------------------------------------------------
  const statDefs = [
    { col: 'passing_yards', label: 'passing yards', gap: 25, cat: 'passing_leaders', title: 'Passing Kings', base: 2 },
    { col: 'passing_tds', label: 'touchdown passes', gap: 1, cat: 'passing_leaders', title: 'Passing Kings', base: 2 },
    { col: 'rushing_yards', label: 'rushing yards', gap: 15, cat: 'rushing_leaders', title: 'Ground Game', base: 2 },
    { col: 'rushing_tds', label: 'rushing touchdowns', gap: 1, cat: 'rushing_leaders', title: 'Ground Game', base: 3 },
    { col: 'receiving_yards', label: 'receiving yards', gap: 15, cat: 'receiving_leaders', title: 'Catch Leaders', base: 2 },
    { col: 'receptions', label: 'receptions', gap: 1, cat: 'receiving_leaders', title: 'Catch Leaders', base: 3 },
    { col: 'receiving_tds', label: 'receiving touchdowns', gap: 1, cat: 'receiving_leaders', title: 'Catch Leaders', base: 3 },
  ];
  for (const [s, rows] of statsBySeason) {
    if (!rows.length) continue;
    const live = s === currentSeason && s !== lastComplete;
    if (live && latestFullWeek < 3) continue;
    for (const d of statDefs) {
      const top = leaders(rows, (r) => num(r[d.col]), d.gap);
      if (!top) continue;
      const leader = top[0].player_display_name;
      const others = top.slice(1, 8).map((r) => r.player_display_name);
      if (live) {
        add(category('this_season', `${s} Season So Far`, ''), `lead_${s}_${d.col}_wk${latestFullWeek}`,
          `Through Week ${latestFullWeek} of the ${s} season, who leads the NFL in ${d.label}?`, leader,
          pickDistractors(leader, others, [], `l${s}${d.col}`), 2, nameAliases(leader));
      } else {
        const era = s >= 2015 ? '2015-now' : '1999-2014';
        add(category(`${d.cat}_${era}`, `${d.title} (${era.replace('-now', ' to now').replace('-', ' to ')})`, `Single-season NFL leaders in ${d.label} and more.`),
          `lead_${s}_${d.col}`, `Who led the NFL in ${d.label} during the ${s} regular season?`, leader,
          pickDistractors(leader, others, [], `l${s}${d.col}`), ageDifficulty(s, lastComplete, d.base), nameAliases(leader));
      }
    }
  }

  // ---- This season: weekly standouts, coaches, homes, players -------------
  if (currentSeason !== lastComplete && latestFullWeek >= 1) {
    const cs = currentSeason;
    const thisCat = category('this_season', `${cs} Season So Far`, '');
    const weeklyCat = category('this_week', 'This Week in the NFL', 'Big performances and results from the latest weeks of games.');
    const allTeamsNow = teamsInSeason(cs, games);

    for (let w = Math.max(1, latestFullWeek - 2); w <= latestFullWeek; w++) {
      const wk = weekStats.filter((r) => num(r.week) === w && r.season_type === 'REG');
      for (const d of statDefs.slice(0, 5)) {
        const top = leaders(wk, (r) => num(r[d.col]), d.gap);
        if (!top) continue;
        const p = top[0];
        add(weeklyCat, `wk_${cs}_${w}_${d.col}`, `Who had the most ${d.label} of any player in Week ${w} of the ${cs} season (${num(p[d.col])})?`,
          p.player_display_name, pickDistractors(p.player_display_name, top.slice(1, 8).map((r) => r.player_display_name), [], `wk${w}${d.col}`),
          latestFullWeek - w + 2, nameAliases(p.player_display_name));
      }
      for (const g of played.filter((g) => num(g.season) === cs && num(g.week) === w && g.game_type === 'REG')) {
        if (g.home_score === g.away_score) continue;
        const homeWon = num(g.home_score) > num(g.away_score);
        const winner = name(g, homeWon ? 'home' : 'away'), loser = name(g, homeWon ? 'away' : 'home');
        const hi = Math.max(num(g.home_score), num(g.away_score)), lo = Math.min(num(g.home_score), num(g.away_score));
        const sameWeek = played.filter((x) => num(x.season) === cs && num(x.week) === w).flatMap((x) => [name(x, 'home'), name(x, 'away')]);
        add(weeklyCat, `game_${g.game_id}`, `In Week ${w} of ${cs}, which team beat the ${loser} ${hi}-${lo}?`, winner,
          pickDistractors(winner, [], sameWeek.filter((t) => t !== loser), `g${g.game_id}`), latestFullWeek - w + 1, teamAliases(winner));
      }
    }

    // Head coaches and home stadiums as of the latest game.
    const latestByTeam = new Map<string, Row>();
    for (const g of played.filter((g) => num(g.season) === cs).sort((a, b) => a.gameday.localeCompare(b.gameday)))
      for (const side of ['home', 'away']) latestByTeam.set(g[`${side}_team`], g);
    const coachOf = new Map<string, string>();
    for (const [code, g] of latestByTeam) coachOf.set(code, g.home_team === code ? g.home_coach : g.away_coach);
    const coachCat = category('head_coaches', 'Head Coaches Right Now', 'Who is running each sideline this season.');
    for (const [code, coach] of coachOf) {
      if (!coach) continue;
      const team = teamName(code, cs);
      add(coachCat, `coach_${cs}_${code}_${coach}`, `Who is the head coach of the ${team} this season?`, coach,
        pickDistractors(coach, [], [...coachOf.values()], `coach${code}`), 2, nameAliases(coach));
      add(coachCat, `coachteam_${cs}_${code}_${coach}`, `${coach} is currently the head coach of which team?`, team,
        pickDistractors(team, [], allTeamsNow, `coacht${code}`), 2, teamAliases(team));
    }

    const homeCounts = new Map<string, Map<string, number>>();
    for (const g of played.filter((g) => num(g.season) >= cs - 1 && g.location === 'Home' && g.stadium)) {
      const m = homeCounts.get(g.stadium) ?? new Map();
      m.set(g.home_team, (m.get(g.home_team) ?? 0) + 1);
      homeCounts.set(g.stadium, m);
    }
    const stadiumCat = category('stadiums', 'Home Field', 'Which team plays where.');
    const stadiumNames = [...homeCounts.keys()];
    for (const [stadium, m] of homeCounts) {
      const tenants = [...m.entries()].filter(([, n]) => n >= 3);
      if (tenants.length !== 1) continue; // skip shared stadiums like MetLife
      const team = teamName(tenants[0][0], cs);
      add(stadiumCat, `stadium_${stadium}_${tenants[0][0]}`, `Which team plays its home games at ${stadium}?`, team,
        pickDistractors(team, [], allTeamsNow, `st${stadium}`), 2, teamAliases(team));
      add(stadiumCat, `stadiumq_${stadium}_${tenants[0][0]}`, `What is the name of the home stadium of the ${team}?`, stadium,
        pickDistractors(stadium, [], stadiumNames, `stq${stadium}`), 3);
    }

    // Star players this season: their team and jersey number.
    const seasonRows = statsBySeason.get(cs) ?? [];
    const stars = [...seasonRows].sort((a, b) => num(b.fantasy_points_ppr) - num(a.fantasy_points_ppr)).slice(0, 80);
    const latestWeek = Math.max(0, ...rosters.map((r) => num(r.week)).filter((n) => !isNaN(n)));
    const rosterNow = new Map(rosters.filter((r) => num(r.week) === latestWeek).map((r) => [r.gsis_id, r]));
    const playersCat = category('stars_now', 'Stars of Today', 'Teams and jersey numbers of the league\'s top players this season.');
    for (const p of stars) {
      const r = rosterNow.get(p.player_id);
      if (!r || !r.team) continue;
      const team = teamName(r.team, cs);
      add(playersCat, `team_${cs}_${p.player_id}_${r.team}`, `Which team does ${p.player_display_name} (${r.position}) play for this season?`, team,
        pickDistractors(team, [], allTeamsNow, `pt${p.player_id}`), 1, teamAliases(team));
      const jersey = num(r.jersey_number);
      if (!isNaN(jersey)) {
        const nums = [jersey + 1, jersey - 1, jersey + 10, jersey - 10, jersey + 2, jersey + 5, jersey - 5].filter((n) => n > 0 && n < 100).map(String);
        add(playersCat, `jersey_${cs}_${p.player_id}_${jersey}`, `What jersey number does ${p.player_display_name} wear for the ${team}?`, String(jersey),
          pickDistractors(String(jersey), nums, [], `pj${p.player_id}`), 4);
      }
    }
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
    const samePos = firsts.filter((d) => d.position === top.position && d !== top).map((d) => d.pfr_player_name);
    add(no1Cat, `no1_${y}`, `Who was the No. 1 overall pick in the ${y} NFL Draft?`, player,
      pickDistractors(player, samePos, firsts.slice(1, 12).map((d) => d.pfr_player_name), `no1${y}`), ageDifficulty(y, latestDraft, 1), nameAliases(player));
    add(no1Cat, `no1team_${y}`, `Which team made ${player} the No. 1 overall pick in the ${y} NFL Draft?`, team,
      pickDistractors(team, firsts.slice(1, 6).map((d) => teamName(d.team, y)), [...new Set(picksBy(y).map((d) => teamName(d.team, y)))], `no1t${y}`),
      ageDifficulty(y, latestDraft, 2), teamAliases(team));
  }

  // Notable players: Pro Bowlers, All-Pros and Hall of Famers.
  const notable = draft.filter(
    (d) => !['K', 'P', 'LS'].includes(d.position) && (num(d.probowls) >= 3 || d.hof === 'TRUE' || (num(d.allpro) >= 1 && num(d.probowls) >= 1))
  );
  const teamsByYear = (y: number) => [...new Set(picksBy(y).map((d) => teamName(d.team, y)))];
  for (const d of notable) {
    const y = num(d.season), player = d.pfr_player_name, team = teamName(d.team, y);
    const fame = d.hof === 'TRUE' || num(d.probowls) >= 6 ? 0 : num(d.probowls) >= 3 || num(d.pick) <= 10 ? 1 : 2;
    const decade = `${Math.floor(y / 10) * 10}s`;
    const cat = category(`drafted_by_${decade}`, `Draft Day: ${decade}`, `Which team drafted the stars of the ${decade}.`);
    add(cat, `draftteam_${d.pfr_player_id || player}_${y}`, `Which team drafted ${d.position} ${player} in ${y}?`, team,
      pickDistractors(team, [], teamsByYear(y), `dt${player}${y}`), 2 + fame, teamAliases(team));

    if (num(d.round) >= 2) {
      const round = `Round ${d.round}`;
      const rounds = Array.from({ length: Math.max(7, ...picksBy(y).map((p) => num(p.round))) }, (_, i) => `Round ${i + 1}`);
      add(category('draft_steals', 'Draft Steals', 'Stars who slipped past the first round.'), `draftround_${d.pfr_player_id || player}_${y}`,
        `In which round of the ${y} NFL Draft was ${player} selected?`, round,
        pickDistractors(round, [], rounds, `dr${player}${y}`), 3 + fame, [round, d.round, ordinal(num(d.round))]);
    }
    if (d.college) {
      add(category(`colleges_${y >= 2005 ? 'modern' : 'classic'}`, y >= 2005 ? 'College Roots' : 'College Roots: Classics', 'Where NFL stars played their college football.'),
        `college_${d.pfr_player_id || player}`, `Which college did ${d.position} ${player} play for before the NFL?`, d.college,
        pickDistractors(d.college, [], allColleges, `col${player}`), 3 + fame, [d.college]);
    }
  }

  // ---- Combine -------------------------------------------------------------
  const combineCat = category('combine', 'Combine Speed', 'Fastest 40-yard dashes at the NFL Scouting Combine.');
  for (const y of [...new Set(combine.map((c) => num(c.season)))]) {
    const runs = combine.filter((c) => num(c.season) === y && !isNaN(num(c.forty))).sort((a, b) => num(a.forty) - num(b.forty));
    if (runs.length < 8 || num(runs[0].forty) === num(runs[1].forty)) continue;
    const p = runs[0];
    add(combineCat, `forty_${y}`, `Who ran the fastest 40-yard dash at the ${y} NFL Combine (${p.forty} seconds)?`, p.player_name,
      pickDistractors(p.player_name, runs.slice(1, 8).map((r) => r.player_name), [], `f${y}`), ageDifficulty(y, latestDraft, 3), nameAliases(p.player_name));
  }

  // ---- Trades of notable players ------------------------------------------
  const notableIds = new Set(notable.map((d) => d.pfr_player_id).filter(Boolean));
  const tradeCat = category('blockbuster_trades', 'Blockbuster Trades', 'Where big-name players landed in trades.');
  for (const t of trades.filter((t) => t.pfr_id && notableIds.has(t.pfr_id) && t.pfr_name)) {
    const y = num(t.season);
    const to = teamName(t.received, y), from = teamName(t.gave, y);
    add(tradeCat, `trade_${t.trade_id}_${t.pfr_id}`, `In ${y}, the ${from} traded ${t.pfr_name} to which team?`, to,
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
