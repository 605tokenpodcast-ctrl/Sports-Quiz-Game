// What goes on the end-of-game recap card: the standings and a few best moments.
import type {BigPlay, Contestant} from './types';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString()}`;

const names = (list: Contestant[]) =>
  list.length <= 2 ? list.map((c) => c.name).join(' and ') : `${list.slice(0, -1).map((c) => c.name).join(', ')} and ${list[list.length - 1].name}`;

/** Up to three short lines about the match, best first. */
export function recapMoments(lineup: Contestant[], bigPlay: BigPlay | null, finalAnswer?: string): string[] {
  const moments: string[] = [];
  const byId = new Map(lineup.map((c) => [c.id, c]));

  const big = bigPlay && byId.get(bigPlay.who);
  if (big && bigPlay) {
    moments.push(
      bigPlay.dailyDouble
        ? `Biggest play: ${big.name} hit a ${money(bigPlay.amount)} Daily Double in ${bigPlay.category}`
        : `Biggest play: ${big.name} took ${money(bigPlay.amount)} in ${bigPlay.category}`
    );
  }

  const most = Math.max(0, ...lineup.map((c) => c.correctCount));
  if (most > 0) {
    const leaders = lineup.filter((c) => c.correctCount === most);
    moments.push(`Most right answers: ${names(leaders)} (${most}${leaders.length > 1 ? ' each' : ''})`);
  }

  const played = lineup.filter((c) => !c.sitsOutFinal && c.finalCorrect !== undefined);
  if (finalAnswer && played.length) {
    const nailed = played.filter((c) => c.finalCorrect);
    moments.push(
      nailed.length ? `Nailed the Final (${finalAnswer}): ${names(nailed)}` : `Nobody got the Final: ${finalAnswer}`
    );
  }

  return moments.slice(0, 3);
}

export const recapMoney = money;

export interface RecapAward {
  emoji: string;
  title: string;
  winner: string; // one name, or tied names
  detail: string;
}

/** The best value in `list` by `score` (higher is better), with everyone tied for it. */
function best(list: Contestant[], score: (c: Contestant) => number | null) {
  const scored = list.map((c) => ({c, s: score(c)})).filter((x): x is {c: Contestant; s: number} => x.s !== null);
  if (!scored.length) return null;
  const top = Math.max(...scored.map((x) => x.s));
  return {value: top, winners: scored.filter((x) => x.s === top).map((x) => x.c)};
}

const pct = (right: number, tries: number) => Math.round((right / tries) * 100);

/**
 * End-of-game superlatives. Each needs enough plays to mean something, so a quiet game can
 * have fewer than four.
 */
export function recapAwards(lineup: Contestant[]): RecapAward[] {
  const awards: RecapAward[] = [];

  // Quick Draw: fastest average buzz-in on clues they got right (at least 2), lower is better.
  const quick = best(lineup, (c) => ((c.fastBuzzes || 0) >= 2 ? -(c.fastBuzzMs || 0) / (c.fastBuzzes || 1) : null));
  if (quick) {
    awards.push({emoji: '⚡', title: 'Quick Draw', winner: names(quick.winners), detail: `${(-quick.value / 1000).toFixed(2)}s average buzz`});
  }

  // Clutch Gene: most won in the Final Showdown.
  const clutch = best(lineup, (c) => (c.finalCorrect && c.wager > 0 ? c.wager : null));
  if (clutch) {
    awards.push({emoji: '🎯', title: 'Clutch Gene', winner: names(clutch.winners), detail: `+${money(clutch.value)} in the Final`});
  }

  // NFL Historian: best on the two toughest rows (at least 2 tries, at least 1 right).
  const historian = best(lineup, (c) =>
    (c.hardTries || 0) >= 2 && (c.hardRight || 0) > 0 ? pct(c.hardRight || 0, c.hardTries || 1) * 1000 + (c.hardRight || 0) : null
  );
  if (historian) {
    const c = historian.winners[0];
    awards.push({
      emoji: '📜',
      title: 'NFL Historian',
      winner: names(historian.winners),
      detail: `${c.hardRight} of ${c.hardTries} on the toughest clues`,
    });
  }

  // Voice Sniper: best with the mic (at least 3 tries, at least 1 right).
  const sniper = best(lineup, (c) =>
    (c.voiceTries || 0) >= 3 && (c.voiceRight || 0) > 0 ? pct(c.voiceRight || 0, c.voiceTries || 1) * 1000 + (c.voiceRight || 0) : null
  );
  if (sniper) {
    const c = sniper.winners[0];
    awards.push({
      emoji: '🎙️',
      title: 'Voice Sniper',
      winner: names(sniper.winners),
      detail: `${pct(c.voiceRight || 0, c.voiceTries || 1)}% with the mic`,
    });
  }

  return awards;
}
