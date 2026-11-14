// Pick'em carryover: picking next week's winners on the results screen, and the payout banner
// at the start of the next game.
import type {PickemState, Contestant, ContestantId} from '../game/types';
import type {PickemPayout} from '../utils/pickem';
import {PICKEM_BONUS} from '../utils/pickem';

export function PickemCard({
  pickem,
  seat,
  contestants,
  lineup,
  onPick,
  onLock,
  onSave,
}: {
  pickem: PickemState;
  /** The seat this device picks for, or null to only watch. */
  seat: ContestantId | null;
  contestants: Record<ContestantId, Contestant>;
  lineup: ContestantId[];
  onPick: (gameId: string, team: string) => void;
  onLock: () => void;
  /** Host only: save now, with whatever has been picked. */
  onSave?: () => void;
}) {
  const mine = seat ? pickem.picks[seat] ?? {} : {};
  const locked = seat ? Boolean(pickem.locked[seat]) : true;
  const done = Object.keys(mine).length >= pickem.games.length;
  return (
    <div className="w-full rounded-xl border-2 border-emerald-500 bg-slate-950/90 p-3 text-left" data-pickem>
      <div className="text-sm font-black text-emerald-300 uppercase tracking-wider">🏈 Pick'em: {pickem.week || 'next week'}</div>
      <div className="text-[11px] text-slate-400 mb-2">Pick the winners. Each right pick is ${PICKEM_BONUS} to start next game.</div>
      <div className="flex flex-col gap-2">
        {pickem.games.map((g) => (
          <div key={g.id}>
            <div className="text-[10px] font-bold text-slate-400 uppercase">{g.label} · {g.day.slice(5).replace('-', '/')}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                [g.away, g.awayName],
                [g.home, `${g.homeName} (home)`],
              ].map(([code, name]) => (
                <button
                  key={code}
                  disabled={!seat || locked}
                  onClick={() => onPick(g.id, code)}
                  data-pick={mine[g.id] === code ? 'picked' : 'open'}
                  className={`min-h-[44px] rounded-lg border px-2 text-xs font-bold leading-tight ${
                    mine[g.id] === code ? 'border-emerald-400 bg-emerald-700 text-white' : 'border-slate-700 bg-slate-900 text-slate-200 enabled:hover:border-emerald-400'
                  }`}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {seat && !locked && (
        <button
          onClick={onLock}
          disabled={!done}
          className="mt-2 w-full min-h-[44px] rounded-lg bg-emerald-500 disabled:opacity-40 text-slate-950 font-black text-sm uppercase">
          Lock my picks
        </button>
      )}
      <div className="mt-2 text-[11px] text-slate-300" data-pickem-status>
        {lineup.map((id) => (
          <span key={id} className="mr-3">
            {pickem.locked[id] ? '✓' : '…'} {contestants[id]?.name}
          </span>
        ))}
      </div>
      {onSave && (
        <button onClick={onSave} className="mt-2 w-full min-h-[40px] rounded-lg border border-emerald-500/70 text-emerald-200 text-xs font-bold uppercase">
          Save picks now
        </button>
      )}
    </div>
  );
}

export function PickemPayoutBanner({result}: {result: PickemPayout[] | null}) {
  if (!result?.length) return null;
  return (
    <div className="fixed top-3 inset-x-0 z-[65] flex justify-center px-3 pointer-events-none" data-pickem-payout>
      <div className="max-w-md w-full rounded-xl border-2 border-emerald-400 bg-slate-950/95 p-3 shadow-2xl text-center">
        <div className="text-sm font-black text-emerald-300 uppercase tracking-wider">🏈 Last week's Pick'em</div>
        {result.map((p) => (
          <div key={p.name} className="text-sm text-white">
            <b>{p.name}</b>: {p.right} of {p.of} right{p.bonus ? <span className="text-emerald-300 font-black"> +${p.bonus.toLocaleString()}</span> : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
