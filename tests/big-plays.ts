// Checks the play-by-play reader behind the "This Week in the NFL" big-play clues.
import assert from 'node:assert/strict';
import { bigPlays, clockText, comebacks, type Play } from '../scripts/big-plays';

let id = 0;
/** A play in a KC (home) vs DEN (away) game; scores are the totals after the play. */
const play = ({ home, away, ...o }: Record<string, string | number>): Play => ({
  play_id: String(++id), game_id: '2026_08_DEN_KC', week: '8', home_team: 'KC', away_team: 'DEN',
  posteam: 'KC', defteam: 'DEN', qtr: '1', game_seconds_remaining: '3000', half_seconds_remaining: '1200',
  desc: 'a play', play_type: 'run', yards_gained: '3', touchdown: '0', return_touchdown: '0',
  total_home_score: String(home), total_away_score: String(away),
  ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])),
});

const game: Play[] = [
  // Long catch-and-run TD for KC.
  play({ play_type: 'pass', pass: '1', pass_length: 'short', yards_gained: '73', touchdown: '1', td_team: 'KC', td_player_id: 'rb1', passer_player_id: 'qb1', home: 6, away: 0 }),
  play({ play_type: 'extra_point', extra_point_attempt: '1', home: 7, away: 0 }),
  // Pick-six for DEN.
  play({ play_type: 'pass', pass: '1', interception: '1', interception_player_id: 'cb1', touchdown: '1', return_touchdown: '1', td_team: 'DEN', td_player_id: 'cb1', return_yards: '92', passer_player_id: 'qb1', home: 7, away: 6 }),
  play({ play_type: 'extra_point', extra_point_attempt: '1', posteam: 'DEN', defteam: 'KC', home: 7, away: 7 }),
  // A QB scramble TD is a run, not a pass.
  play({ play_type: 'run', pass: '1', posteam: 'DEN', defteam: 'KC', yards_gained: '62', touchdown: '1', td_team: 'DEN', td_player_id: 'qb2', home: 7, away: 13 }),
  play({ play_type: 'extra_point', extra_point_attempt: '1', posteam: 'DEN', defteam: 'KC', home: 7, away: 14 }),
  play({ play_type: 'field_goal', posteam: 'DEN', defteam: 'KC', home: 7, away: 24, qtr: '3' }),
  // KC comes back from 17 down, then wins with a TD at 1:10 while down 3.
  play({ play_type: 'run', touchdown: '1', td_team: 'KC', td_player_id: 'rb1', home: 13, away: 24, qtr: '4', game_seconds_remaining: '600' }),
  play({ play_type: 'extra_point', extra_point_attempt: '1', home: 14, away: 24, qtr: '4' }),
  play({ play_type: 'field_goal', home: 17, away: 24, qtr: '4', game_seconds_remaining: '300' }),
  play({ play_type: 'field_goal', posteam: 'DEN', defteam: 'KC', home: 17, away: 20 + 7, qtr: '4', game_seconds_remaining: '200' }),
  play({ play_type: 'run', touchdown: '1', td_team: 'KC', td_player_id: 'rb1', home: 23, away: 27, qtr: '4', game_seconds_remaining: '150' }),
  play({ play_type: 'extra_point', extra_point_attempt: '1', home: 24, away: 27, qtr: '4', game_seconds_remaining: '146' }),
  play({ play_type: 'pass', pass: '1', pass_length: 'short', yards_gained: '9', touchdown: '1', td_team: 'KC', td_player_id: 'te1', passer_player_id: 'qb1', home: 30, away: 27, qtr: '4', game_seconds_remaining: '70' }),
  play({ play_type: 'extra_point', extra_point_attempt: '1', home: 31, away: 27, qtr: '4', game_seconds_remaining: '66' }),
  play({ play_type: '', desc: 'END GAME', home: 31, away: 27, qtr: '4', game_seconds_remaining: '0' }),
];

const found = bigPlays(game);
const kind = (k: string) => found.filter((b) => b.kind === k);

assert.equal(kind('longTd').length, 2, 'the 73-yard catch and the 62-yard scramble');
const catchTd = kind('longTd').find((b) => b.playerId === 'rb1')!;
assert.deepEqual([catchTd.via, catchTd.detail, catchTd.yards, catchTd.qbId, catchTd.team, catchTd.opp], ['pass', 'short', 73, 'qb1', 'KC', 'DEN']);
assert.equal(kind('longTd').find((b) => b.playerId === 'qb2')!.via, 'run', 'a scramble counts as a run');

assert.equal(kind('pickSix').length, 1);
assert.deepEqual([kind('pickSix')[0].playerId, kind('pickSix')[0].yards, kind('pickSix')[0].qbId, kind('pickSix')[0].team], ['cb1', 92, 'qb1', 'DEN']);

const clutch = kind('clutchTd');
assert.equal(clutch.length, 1, 'one go-ahead-for-good score');
assert.deepEqual([clutch[0].playerId, clutch[0].trailedBy, clutch[0].secondsLeft], ['te1', 3, 70]);

assert.deepEqual(comebacks(game), [{ gameId: '2026_08_DEN_KC', winner: 'KC', deficit: 17 }]);

// An early go-ahead score is not clutch; a go-ahead FG is the kicker's (handled elsewhere).
const early = [
  play({ game_id: 'g2', play_type: 'run', touchdown: '1', td_team: 'KC', td_player_id: 'rb1', home: 6, away: 0 }),
  play({ game_id: 'g2', play_type: 'extra_point', extra_point_attempt: '1', home: 7, away: 0 }),
];
assert.equal(bigPlays(early).filter((b) => b.kind === 'clutchTd').length, 0);

// A deep heave on the last play of the half is a Hail Mary; a short pass broken for a long TD is not.
const heave = (air: string) => bigPlays([play({ game_id: 'g3', play_type: 'pass', pass: '1', qtr: '2', half_seconds_remaining: '3', air_yards: air, yards_gained: '52', touchdown: '1', td_team: 'KC', td_player_id: 'wr1', passer_player_id: 'qb1', home: 6, away: 0 })]);
assert.equal(heave('50')[0].kind, 'hailMary');
assert.equal(heave('2')[0].kind, 'longTd');
assert.equal(heave('2')[0].beatTheClock, true);

// Kickoff and punt return TDs.
const ret = bigPlays([
  play({ game_id: 'g4', play_type: 'kickoff', posteam: 'KC', defteam: 'DEN', return_touchdown: '1', touchdown: '1', td_team: 'DEN', td_player_id: 'kr1', kickoff_returner_player_id: 'kr1', return_yards: '95', home: 0, away: 6 }),
  play({ game_id: 'g4', play_type: 'punt', posteam: 'DEN', defteam: 'KC', return_touchdown: '1', touchdown: '1', td_team: 'KC', td_player_id: 'pr1', punt_returner_player_id: 'pr1', return_yards: '71', home: 6, away: 6 }),
]);
assert.deepEqual(ret.map((b) => [b.kind, b.playerId, b.yards, b.team]), [['kickReturnTd', 'kr1', 95, 'DEN'], ['puntReturnTd', 'pr1', 71, 'KC']]);

assert.equal(clockText(45), '45 seconds');
assert.equal(clockText(70), '1:10');
assert.equal(clockText(120), '2:00');

console.log('big plays: ok');
