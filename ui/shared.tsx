// Pieces used by more than one screen: images, music, name tag ideas, the QR code and Final choices.
import {useMemo} from 'react';
import {generateQRCodeMatrix} from '../utils/qrCode';
import type {SeasonRow} from '../utils/season';

export const IMG_STUDIO = 'assets/images/bg_studio_arena.png';
export const IMG_TROPHY = 'assets/images/icon_trophy_gold.png';

export const BGM_TRIVIA = 'assets/audio/bgm_trivia_stage.mp3';
export const BGM_FINAL = 'assets/audio/bgm_final_showdown.mp3';


export const PRESET_TAG_SUGGESTIONS = [
  '🏆 Champion',
  '⚡ BlitzMaster',
  '🎯 ClutchShot',
  '🐐 The GOAT',
  '👑 KingPlay',
  '🔥 HotHand',
  '🏈 GridironAce',
  '🏟️ RedZoneKing',
  '🧢 PlayCaller',
  '🛡️ LockdownCB',
  '💨 TwoMinuteDrill',
  '🏅 HailMary',
];

// Scannable SVG QR Code Generator Component
export function QRCodeView({ value, size = 180 }: { value: string; size?: number }) {
  const matrix = useMemo(() => {
    try {
      return generateQRCodeMatrix(value);
    } catch (e) {
      return [];
    }
  }, [value]);

  if (!matrix || matrix.length === 0) {
    return (
      <div className="w-44 h-44 bg-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-400">
        Generating QR Code...
      </div>
    );
  }

  const n = matrix.length;
  const padding = 2;
  const viewBoxSize = n + padding * 2;

  return (
    <div className="p-2 bg-white rounded-xl shadow-xl inline-block border-2 border-amber-400">
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        width={size}
        height={size}
        className="block shape-rendering-crispEdges"
      >
        <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((cell, c) =>
            cell ? (
              <rect
                key={`${r}-${c}`}
                x={c + padding}
                y={r + padding}
                width={1}
                height={1}
                fill="#0f172a"
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
}

/** Final Showdown multiple choice: the same options for every player, the right answer always among them. */
export function FinalChoices({
  options,
  value,
  onPick,
  disabled = false,
}: {
  options: string[];
  value: string;
  onPick: (option: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`w-full grid gap-2 ${options.length > 4 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {options.map((opt, idx) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onPick(opt)}
          className={`min-h-[44px] p-2 rounded-xl border-2 font-bold text-xs sm:text-sm text-left flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60 ${
            value === opt
              ? 'bg-amber-400 text-slate-950 border-white'
              : 'bg-blue-950 text-slate-100 border-blue-600 hover:border-amber-400'
          }`}>
          <span className="w-6 h-6 rounded-lg bg-slate-950/40 border border-amber-400/80 font-black text-xs flex items-center justify-center shrink-0">
            {String.fromCharCode(65 + idx)}
          </span>
          <span className="line-clamp-2 flex-1">{opt}</span>
        </button>
      ))}
    </div>
  );
}

/** The podcast season standings table. `big` is the stream screen's larger type. */
export function SeasonTable({rows, big = false}: {rows: SeasonRow[]; big?: boolean}) {
  if (!rows.length) return null;
  const cell = big ? 'px-3 py-2 text-xl lg:text-2xl' : 'px-2 py-1 text-[11px] sm:text-xs';
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className={`text-amber-300 uppercase font-black ${big ? 'text-base lg:text-lg' : 'text-[10px]'}`}>
            <th className={cell}>#</th>
            <th className={cell}>Player</th>
            <th className={`${cell} text-right`}>Wins</th>
            <th className={`${cell} text-right`}>Games</th>
            <th className={`${cell} text-right`}>Total $</th>
            <th className={`${cell} text-right`}>Best</th>
            <th className={`${cell} text-right`}>Finals</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} className={`border-t border-slate-800 font-bold ${i === 0 ? 'text-amber-200' : 'text-slate-200'}`}>
              <td className={cell}>{i + 1}</td>
              <td className={`${cell} font-black`}>{r.name}</td>
              <td className={`${cell} text-right`}>{r.wins}</td>
              <td className={`${cell} text-right`}>{r.games}</td>
              <td className={`${cell} text-right font-mono`}>${r.money.toLocaleString()}</td>
              <td className={`${cell} text-right font-mono`}>${r.bestScore.toLocaleString()}</td>
              <td className={`${cell} text-right`}>{r.finalsPlayed ? `${r.finalsRight}/${r.finalsPlayed}` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
