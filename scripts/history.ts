/**
 * Boils a finished season's play-by-play (about 15 MB) down to the handful of plays and
 * comebacks worth a question: the longest touchdowns and returns, Hail Marys, last-second and
 * overtime winners, and the biggest holes a winner climbed out of.
 *
 * Finished seasons never change, so the result is kept in scripts/data/history.json and the
 * weekly build only reads play-by-play for a season that isn't in the file yet.
 * `npm run questions -- --history` rebuilds the whole file.
 */
import { bigPlays, comebacks, type BigPlay, type Play } from './big-plays';

type Row = Record<string, string>;

export interface HistoryPlay {
  season: number;
  week: number;
  gameId: string;
  playId: string;
  kind: BigPlay['kind'];
  /** Who scored (the answer), and his position. */
  player: string;
  playerId: string;
  pos: string;
  /** Team codes as the data has them (OAK, SD, STL for the old homes). */
  team: string;
  opp: string;
  yards: number;
  /** The passer, or the quarterback who was picked off or stripped. */
  qb: string;
  via: BigPlay['via'];
  detail: string;
  qtr: number;
  secondsLeft: number;
  trailedBy: number;
  playoff: boolean;
}

export interface HistoryComeback {
  season: number;
  gameId: string;
  winner: string;
  deficit: number;
}

export interface SeasonHistory {
  season: number;
  plays: HistoryPlay[];
  comebacks: HistoryComeback[];
}

/** The longest few of one kind, at least `min` yards. */
function longest(plays: BigPlay[], kind: BigPlay['kind'], min: number, keep: number): BigPlay[] {
  return plays
    .filter((b) => b.kind === kind && b.yards >= min)
    .sort((a, b) => b.yards - a.yards)
    .slice(0, keep);
}

export function seasonHistory(season: number, pbp: Play[], weekRows: Row[]): SeasonHistory {
  const people = new Map<string, { name: string; pos: string }>();
  for (const r of weekRows) if (r.player_id && r.player_display_name) people.set(r.player_id, { name: r.player_display_name, pos: r.position });
  const playoffGames = new Set(pbp.filter((p) => p.season_type === 'POST').map((p) => p.game_id));
  const all = bigPlays(pbp);

  const picked: BigPlay[] = [
    ...longest(all, 'longTd', 85, 4),
    ...longest(all, 'pickSix', 85, 2),
    ...longest(all, 'fumbleTd', 80, 1),
    ...longest(all, 'kickReturnTd', 100, 2),
    ...longest(all, 'puntReturnTd', 80, 2),
    ...all.filter((b) => b.kind === 'hailMary'),
    // Playoff games won by a late touchdown, and regular-season games won at the gun or on a long overtime score.
    ...all.filter(
      (b) =>
        b.kind === 'clutchTd' &&
        (playoffGames.has(b.gameId) || (b.qtr === 4 && b.secondsLeft <= 15 && b.trailedBy > 0) || (b.qtr >= 5 && b.yards >= 40))
    ),
  ];

  const seen = new Set<string>();
  const plays: HistoryPlay[] = [];
  for (const b of picked) {
    const key = `${b.gameId}_${b.playId}`;
    const who = people.get(b.playerId);
    if (seen.has(key) || !who) continue;
    seen.add(key);
    plays.push({
      season, week: b.week, gameId: b.gameId, playId: b.playId, kind: b.kind,
      player: who.name, playerId: b.playerId, pos: who.pos, team: b.team, opp: b.opp, yards: b.yards,
      qb: b.qbId && b.qbId !== b.playerId ? people.get(b.qbId)?.name ?? '' : '',
      via: b.via, detail: b.detail, qtr: b.qtr, secondsLeft: b.secondsLeft, trailedBy: b.trailedBy,
      playoff: playoffGames.has(b.gameId),
    });
  }

  const big = comebacks(pbp)
    .filter((c) => c.deficit >= 17)
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, 8)
    .map((c) => ({ season, gameId: c.gameId, winner: c.winner, deficit: c.deficit }));

  return { season, plays, comebacks: big };
}
