// Category draft: the round's columns, with the players striking them in turn until a normal board is left.
import type {TriviaCategory} from '../triviaData';
import {draftTurn, type CategoryDraftState, type Contestant, type ContestantId} from '../game/types';

export default function CategoryDraft({
  draft,
  board,
  contestants,
  mine,
  onStrike,
  big = false,
}: {
  draft: CategoryDraftState;
  board: TriviaCategory[];
  contestants: Record<ContestantId, Contestant>;
  /** This device may strike now (it's this device's player's turn). */
  mine: boolean;
  onStrike: (categoryId: string) => void;
  /** Stream screen size. */
  big?: boolean;
}) {
  const turn = draftTurn(draft);
  const left = draft.strikes - draft.struck.length;
  const struckBy = (id: string) => {
    const i = draft.struck.indexOf(id);
    return i < 0 ? null : contestants[draft.order[i % draft.order.length]]?.name;
  };
  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-3" data-draft={draft.round} role="region" aria-label="Category draft">
      <div className="text-center">
        <div className={`font-black text-amber-400 uppercase tracking-widest ${big ? 'text-3xl' : 'text-lg'}`}>
          🏈 {draft.round === 'ROUND_1' ? 'Round 1' : 'Round 2'} draft
        </div>
        <div className={`${big ? 'text-xl' : 'text-sm'} text-slate-200`} data-draft-turn={turn}>
          {mine ? <b className="text-emerald-300">Your pick: strike a column</b> : <><b>{contestants[turn]?.name}</b> is striking a column</>}
          <span className="text-slate-400"> · {left} more to strike</span>
        </div>
      </div>
      <div className={`grid gap-2 ${big ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {board.map((c) => {
          const by = struckBy(c.id);
          const locked = c.id === 'nfl_custom_column';
          return (
            <button
              key={c.id}
              onClick={() => onStrike(c.id)}
              disabled={!mine || !!by || locked}
              data-draft-column={by ? 'struck' : 'open'}
              className={`min-h-[56px] rounded-xl border-2 px-2 py-2 font-black uppercase leading-tight ${big ? 'text-xl' : 'text-xs sm:text-sm'} ${
                by
                  ? 'border-slate-800 bg-slate-950 text-slate-600 line-through'
                  : mine && !locked
                  ? 'border-amber-400 bg-blue-900 text-white hover:bg-rose-900 hover:border-rose-400'
                  : 'border-blue-700 bg-blue-950 text-amber-200'
              }`}>
              {c.title}
              {by && <span className="block text-[10px] font-bold normal-case no-underline text-slate-500">struck by {by}</span>}
              {locked && <span className="block text-[10px] font-bold normal-case text-amber-400">your column, stays</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
