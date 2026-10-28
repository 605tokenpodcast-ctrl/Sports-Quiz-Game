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
