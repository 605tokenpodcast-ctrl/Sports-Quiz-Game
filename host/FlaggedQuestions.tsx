// "Flagged questions (3) · Send to GitHub": the questions flagged with the Bad question button,
// sent as one GitHub issue so the weekly refresh leaves them out for everyone.
import {useState} from 'react';
import {Flag} from 'lucide-react';
import {markSent, reportUrl, unsentFlags} from '../utils/badQuestions';

export default function FlaggedQuestions() {
  const [unsent, setUnsent] = useState(unsentFlags);
  if (!unsent.length) return null;
  return (
    <div className="w-full mb-3 rounded-xl border border-rose-700/60 bg-slate-950/80 p-2.5 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
          <Flag className="w-3.5 h-3.5" />
          {unsent.length} flagged question{unsent.length === 1 ? '' : 's'}
        </span>
        <a
          href={reportUrl(unsent)}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            markSent(unsent);
            setUnsent(unsentFlags());
          }}
          className="min-h-[36px] px-3 flex items-center rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold">
          Send to GitHub
        </a>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">
        They won't come up on this device again. Sending them opens a GitHub issue (sign in as the game's owner and press Submit), and the next Tuesday refresh removes them for everyone.
      </p>
    </div>
  );
}
