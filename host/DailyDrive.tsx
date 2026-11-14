// Daily Drive: today's five questions, played solo. Pick from four choices; after the fifth,
// the result card has the score, the streak and a Share button. One drive per day.
import {useMemo, useState} from 'react';
import {CalendarDays, Share2, X} from 'lucide-react';
import {gameAudio} from '../utils/helper';
import {buildQuestionOptions, dailyDriveClues, normalizeAnswer} from '../triviaData';
import {dailyMoney, dailyShareText, dailyStreak, dayKey, saveDailyResult, savedDailyResult, DAILY_DRIVE_LENGTH} from '../utils/dailyDrive';

export const dailyLink = () => (typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}?daily=1`);

export default function DailyDrive({onClose}: {onClose: () => void}) {
  const day = useMemo(() => dayKey(), []);
  const clues = useMemo(() => dailyDriveClues(day), [day]);
  const options = useMemo(() => clues.map((q) => buildQuestionOptions(q, 'STANDARD')), [clues]);
  const [done] = useState(() => savedDailyResult(day));
  const [step, setStep] = useState(0);
  const [right, setRight] = useState<boolean[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const result = done ?? (right.length === DAILY_DRIVE_LENGTH ? {day, right} : null);
  const q = clues[step];

  const choose = (option: string) => {
    if (picked || !q) return;
    const ok = normalizeAnswer(option) === normalizeAnswer(q.correctAnswer);
    ok ? gameAudio.playCoinPickup() : gameAudio.playErrorBuzz();
    setPicked(option);
    const next = [...right, ok];
    setRight(next);
    if (next.length === DAILY_DRIVE_LENGTH) saveDailyResult({day, right: next});
  };

  const share = async () => {
    if (!result) return;
    const text = dailyShareText(result, dailyStreak(day), dailyLink());
    try {
      if (navigator.share) await navigator.share({text});
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950 overflow-y-auto text-white" role="dialog" aria-label="Daily Drive">
      <div className="max-w-md mx-auto p-4 min-h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-lg font-black text-amber-400 uppercase tracking-wider">
            <CalendarDays className="w-5 h-5" /> Daily Drive
          </h2>
          <button onClick={onClose} aria-label="Close" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* The drive chart: one square per question */}
        <div className="flex gap-1.5 mb-4" aria-label="Progress">
          {Array.from({length: DAILY_DRIVE_LENGTH}, (_, i) => {
            const r = result?.right[i] ?? right[i];
            return (
              <div key={i} className={`flex-1 h-9 rounded-md flex items-center justify-center text-xs font-black ${r === undefined ? (i === step && !result ? 'bg-slate-700 ring-2 ring-amber-400' : 'bg-slate-800') : r ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                ${(i + 1) * 200}
              </div>
            );
          })}
        </div>

        {result ? (
          <div className="flex-1 flex flex-col items-center text-center gap-3" data-daily="done">
            <div className="text-5xl font-black text-emerald-400 font-mono">${dailyMoney(result.right).toLocaleString()}</div>
            <div className="text-sm text-slate-300">
              {result.right.filter(Boolean).length} of {DAILY_DRIVE_LENGTH} right{dailyStreak(day) > 1 ? ` · 🔥 ${dailyStreak(day)}-day streak` : ''}
            </div>
            {done && <div className="text-xs text-slate-400">You already drove today. New questions tomorrow.</div>}
            {!done && (
              <ul className="w-full text-left text-xs text-slate-300 space-y-1">
                {clues.map((c, i) => (
                  <li key={c.id}>
                    <span className={right[i] ? 'text-emerald-400' : 'text-rose-400'}>{right[i] ? '✓' : '✗'}</span> ${(i + 1) * 200}: <b className="text-white">{c.correctAnswer}</b>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={share} className="w-full min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase flex items-center justify-center gap-2">
              <Share2 className="w-4 h-4" /> {copied ? 'Copied! Paste it anywhere' : 'Share my drive'}
            </button>
            <button onClick={onClose} className="text-sm text-slate-300 underline">Back to the game</button>
          </div>
        ) : q ? (
          <div className="flex-1 flex flex-col gap-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-300">{q.category} · ${(step + 1) * 200}</div>
            <div className="text-lg font-bold leading-snug" data-daily-clue={step}>{q.clue}</div>
            <div className="grid gap-2">
              {options[step].map((o) => {
                const isAnswer = normalizeAnswer(o) === normalizeAnswer(q.correctAnswer);
                const shown = picked !== null;
                return (
                  <button
                    key={o}
                    onClick={() => choose(o)}
                    disabled={shown}
                    data-daily-option={isAnswer ? 'right' : 'wrong'}
                    className={`min-h-[48px] rounded-xl border-2 px-3 text-left text-sm font-bold ${
                      shown && isAnswer ? 'border-emerald-400 bg-emerald-900/50' : shown && o === picked ? 'border-rose-500 bg-rose-900/50' : 'border-slate-700 bg-slate-900 hover:border-amber-400'
                    }`}>
                    {o}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <button
                onClick={() => {
                  setPicked(null);
                  setStep((s) => s + 1);
                }}
                className="min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 font-black uppercase">
                {step + 1 < DAILY_DRIVE_LENGTH ? 'Next question' : 'See my drive'}
              </button>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-400">Today's questions are still loading.</div>
        )}
      </div>
    </div>
  );
}
