/**
 * Finds a week's big plays in nflverse play-by-play: long touchdowns, pick-sixes, fumble and
 * return touchdowns, Hail Marys, late go-ahead scores, walk-offs, and big comebacks.
 * build-nfl-questions.ts turns them into "This Week in the NFL" clues.
 *
 * Only the columns below are kept from the play-by-play file (it has ~370), to save memory.
 */

export type Play = Record<string, string>;

export const PBP_COLUMNS = [
  'play_id', 'game_id', 'week', 'season_type', 'home_team', 'away_team', 'posteam', 'defteam', 'qtr',
  'game_seconds_remaining', 'half_seconds_remaining', 'desc', 'play_type', 'yards_gained', 'pass', 'rush',
  'pass_length', 'air_yards', 'run_location', 'touchdown', 'td_team', 'td_player_id', 'return_touchdown', 'return_yards',
  'interception', 'interception_player_id', 'fumble_lost', 'fumbled_1_player_id', 'fumble_recovery_1_player_id',
  'kickoff_returner_player_id', 'punt_returner_player_id', 'passer_player_id', 'extra_point_attempt',
  'two_point_attempt', 'total_home_score', 'total_away_score', 'play_deleted',
] as const;

export type BigPlayKind = 'longTd' | 'pickSix' | 'fumbleTd' | 'kickReturnTd' | 'puntReturnTd' | 'hailMary' | 'clutchTd';

export interface BigPlay {
  kind: BigPlayKind;
  gameId: string;
  playId: string;
  week: number;
  /** Who scored (the answer). */
  playerId: string;
  /** The scorer's team and the team it came against. */
  team: string;
  opp: string;
  yards: number;
  /** The quarterback who threw it (long TDs, Hail Marys, clutch TDs) or got picked/stripped (pick-sixes, fumbles). */
  qbId: string;
  /** "pass" or "run" for touchdowns from scrimmage (a QB scramble is a run). */
  via: 'pass' | 'run' | 'return';
  /** Pass depth ("deep"/"short") or run direction ("middle"/"left"/"right") from the play-by-play. */
  detail: string;
  qtr: number;
  /** Game clock left when the play started, in seconds (whole game, so 0-3600; overtime counts down its own period). */
  secondsLeft: number;
  /** Clutch TDs: how far the scoring team was behind before the play (0 = tied). */
  trailedBy: number;
  /** Scored with 8 seconds or less left in the half. */
  beatTheClock: boolean;
}

export interface Comeback {
  gameId: string;
  winner: string;
  /** The winner's biggest deficit in the game. */
  deficit: number;
}

const n = (s: string | undefined) => {
  const v = Number(s);
  return s === undefined || s === '' || s === 'NA' || isNaN(v) ? 0 : v;
};
const yes = (s: string | undefined) => s === '1' || s === '1.0';

/** Plays grouped by game, in the order they happened. */
function byGame(plays: Play[]): Map<string, Play[]> {
  const out = new Map<string, Play[]>();
  for (const p of plays) {
    if (yes(p.play_deleted)) continue;
    const list = out.get(p.game_id) ?? [];
    list.push(p);
    out.set(p.game_id, list);
  }
  return out;
}

/** Whoever won each finished game, from the last play's score ('' for a tie). */
function winnerOf(game: Play[]): string {
  const last = game[game.length - 1];
  const h = n(last.total_home_score), a = n(last.total_away_score);
  return h > a ? last.home_team : a > h ? last.away_team : '';
}

const other = (p: Play, team: string) => (team === p.home_team ? p.away_team : p.home_team);
const scoreOf = (p: Play, team: string) => n(team === p.home_team ? p.total_home_score : p.total_away_score);

/** The biggest hole each winner climbed out of. */
export function comebacks(plays: Play[]): Comeback[] {
  const out: Comeback[] = [];
  for (const [gameId, game] of byGame(plays)) {
    const winner = winnerOf(game);
    if (!winner) continue;
    const loser = other(game[0], winner);
    const deficit = Math.max(0, ...game.map((p) => scoreOf(p, loser) - scoreOf(p, winner)));
    out.push({ gameId, winner, deficit });
  }
  return out;
}

export function bigPlays(plays: Play[]): BigPlay[] {
  const out: BigPlay[] = [];
  for (const [gameId, game] of byGame(plays)) {
    const week = n(game[0].week);
    const base = (p: Play, kind: BigPlayKind, playerId: string, team: string, extra: Partial<BigPlay> = {}): BigPlay => ({
      kind, gameId, playId: p.play_id, week, playerId, team, opp: other(p, team),
      yards: n(p.yards_gained), qbId: p.passer_player_id || '',
      via: p.play_type === 'pass' ? 'pass' : p.play_type === 'run' ? 'run' : 'return',
      detail: p.play_type === 'pass' ? p.pass_length || '' : p.run_location || '',
      qtr: n(p.qtr), secondsLeft: n(p.game_seconds_remaining), trailedBy: 0,
      beatTheClock: (n(p.qtr) === 2 || n(p.qtr) === 4) && n(p.half_seconds_remaining) <= 8, ...extra,
    });

    for (const p of game) {
      if (!yes(p.touchdown) || !p.td_player_id || !p.td_team) continue;
      const scrimmage = (p.play_type === 'pass' || p.play_type === 'run') && !yes(p.return_touchdown) && p.td_team === p.posteam;
      if (scrimmage) {
        const endOfHalf = (n(p.qtr) === 2 || n(p.qtr) === 4) && n(p.half_seconds_remaining) <= 8;
        // A Hail Mary is a deep heave; a short pass broken for a long TD at the gun is a long TD.
        if (p.play_type === 'pass' && endOfHalf && n(p.air_yards) >= 35 && n(p.yards_gained) >= 35) out.push(base(p, 'hailMary', p.td_player_id, p.td_team));
        else if (n(p.yards_gained) >= 50) out.push(base(p, 'longTd', p.td_player_id, p.td_team));
        continue;
      }
      if (!yes(p.return_touchdown)) continue;
      const ret = n(p.return_yards);
      if (yes(p.interception) && p.interception_player_id === p.td_player_id) {
        out.push(base(p, 'pickSix', p.td_player_id, p.td_team, { yards: ret, via: 'return', detail: '' }));
      } else if (yes(p.fumble_lost) && p.td_team === p.defteam) {
        out.push(base(p, 'fumbleTd', p.td_player_id, p.td_team, { yards: ret, via: 'return', detail: '', qbId: p.fumbled_1_player_id || '' }));
      } else if (p.play_type === 'kickoff' && p.kickoff_returner_player_id === p.td_player_id) {
        out.push(base(p, 'kickReturnTd', p.td_player_id, p.td_team, { yards: ret, via: 'return', detail: '', qbId: '' }));
      } else if (p.play_type === 'punt' && p.punt_returner_player_id === p.td_player_id) {
        out.push(base(p, 'puntReturnTd', p.td_player_id, p.td_team, { yards: ret, via: 'return', detail: '', qbId: '' }));
      }
    }

    // The score that put the winner ahead for good, if it was a late touchdown (last 2:00 or overtime).
    const winner = winnerOf(game);
    if (!winner) continue;
    const loser = other(game[0], winner);
    let lastNotAhead = -1;
    game.forEach((p, i) => { if (scoreOf(p, winner) <= scoreOf(p, loser)) lastNotAhead = i; });
    let i = lastNotAhead + 1;
    if (i <= 0 || i >= game.length) continue;
    // Behind by 1 after the TD and ahead after the extra point: the TD is the go-ahead play.
    while (i > 0 && !yes(game[i].touchdown) && (yes(game[i].extra_point_attempt) || yes(game[i].two_point_attempt) || !game[i].desc)) i--;
    const td = game[i];
    if (!yes(td.touchdown) || td.td_team !== winner || td.td_team !== td.posteam || yes(td.return_touchdown) || !td.td_player_id) continue;
    const late = n(td.qtr) >= 5 || (n(td.qtr) === 4 && n(td.game_seconds_remaining) <= 120);
    if (!late) continue;
    const before = game[i - 1] ?? td;
    const trailedBy = Math.max(0, scoreOf(before, loser) - scoreOf(before, winner));
    out.push(base(td, 'clutchTd', td.td_player_id, winner, { trailedBy }));
  }
  return out;
}

/** "45 seconds", "1:10", or "2:00", for "with ... left". */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} seconds`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
