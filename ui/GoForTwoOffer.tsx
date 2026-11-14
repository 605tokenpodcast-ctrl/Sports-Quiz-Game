// Go for two: the yes/no buttons for the player who earned a harder follow-up.
import TimeLeft from '../utils/TimeLeft';
import type {ActiveClueState} from '../game/types';

export default function GoForTwoOffer({clue, onDecide}: {clue: ActiveClueState; onDecide: (accept: boolean) => void}) {
  return (
    <div className="w-full mb-2 rounded-xl border-2 border-emerald-400 bg-emerald-950/60 p-2" data-go-for-two="offer">
      <div className="text-xs font-black text-emerald-200 uppercase tracking-wider mb-1.5">
        🏈 Go for two? <span className="font-normal normal-case text-emerald-300">(${clue.clue.value.toLocaleString()} more, or give it back) <TimeLeft c={clue} format="seconds" /></span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onDecide(true)}
          className="flex-1 min-h-[48px] rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm uppercase">
          Go for two
        </button>
        <button onClick={() => onDecide(false)} className="flex-1 min-h-[48px] rounded-lg border border-slate-500 bg-slate-900 text-slate-200 font-bold text-sm uppercase">
          Take the points
        </button>
      </div>
    </div>
  );
}
