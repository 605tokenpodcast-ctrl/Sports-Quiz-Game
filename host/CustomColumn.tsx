// "Your own column": paste a Google Sheet link and every game on this device deals that column
// in Round 1. The link is remembered, and the sheet is read again each time the game opens,
// so edits in the sheet show up in the next game.
import {useEffect, useState} from 'react';
import {Table} from 'lucide-react';
import {setCustomColumn} from '../triviaEngine';
import {loadCustomColumn, saveCustomColumn, savedCustomColumn} from '../utils/customColumn';

type Status = {kind: 'off'} | {kind: 'loading'} | {kind: 'ready'; count: number} | {kind: 'error'; message: string};

export default function CustomColumn() {
  const saved = savedCustomColumn();
  const [open, setOpen] = useState(Boolean(saved));
  const [url, setUrl] = useState(saved?.url ?? '');
  const [title, setTitle] = useState(saved?.title ?? '');
  const [status, setStatus] = useState<Status>({kind: 'off'});

  const load = async (link: string, name: string) => {
    setStatus({kind: 'loading'});
    try {
      const spec = await loadCustomColumn({url: link, title: name});
      setCustomColumn(spec);
      saveCustomColumn({url: link, title: name});
      setStatus({kind: 'ready', count: spec.entries.length});
    } catch (e) {
      setCustomColumn(null);
      setStatus({kind: 'error', message: (e as Error).message});
    }
  };

  // Read the saved sheet again when the start screen opens.
  useEffect(() => {
    if (saved?.url) load(saved.url, saved.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = () => {
    setCustomColumn(null);
    saveCustomColumn(null);
    setUrl('');
    setTitle('');
    setStatus({kind: 'off'});
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mb-3 min-h-[40px] flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-600 text-xs font-bold text-slate-300 hover:border-blue-500">
        <Table className="w-3.5 h-3.5" /> Add your own column from a Google Sheet
      </button>
    );
  }
  return (
    <div className="w-full mb-3 rounded-xl border border-slate-700 bg-slate-950/80 p-2.5 text-left">
      <label htmlFor="custom-column-url" className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block mb-1">
        Your Own Column <span className="normal-case font-normal text-slate-400">(always in Round 1)</span>
      </label>
      <input
        id="custom-column-url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Google Sheet link"
        inputMode="url"
        className="w-full min-h-[44px] rounded-lg bg-slate-900 border border-slate-700 px-3 text-sm text-white placeholder:text-slate-500 mb-1.5"
      />
      <div className="flex gap-1.5">
        <input
          aria-label="Column title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Column title, e.g. Listener Questions"
          maxLength={40}
          className="flex-1 min-w-0 min-h-[44px] rounded-lg bg-slate-900 border border-slate-700 px-3 text-sm text-white placeholder:text-slate-500"
        />
        <button
          onClick={() => load(url, title)}
          disabled={!url.trim() || status.kind === 'loading'}
          className="min-h-[44px] px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-bold text-white">
          {status.kind === 'loading' ? 'Loading' : 'Load'}
        </button>
        {(saved || status.kind !== 'off') && (
          <button onClick={remove} className="min-h-[44px] px-3 rounded-lg border border-slate-700 text-xs font-bold text-slate-200 hover:border-rose-500">
            Remove
          </button>
        )}
      </div>
      {status.kind === 'ready' && <p className="text-[11px] text-emerald-300 mt-1">✓ {status.count} clues loaded. The column will be on the Round 1 board.</p>}
      {status.kind === 'error' && <p className="text-[11px] text-rose-300 mt-1">{status.message}</p>}
      <p className="text-[10px] text-slate-400 mt-1">
        First row: <b>Clue</b>, <b>Answer</b>, and optionally <b>Wrong 1</b>, <b>Wrong 2</b>, <b>Wrong 3</b> and <b>Level</b> (1 to 5). Without levels the top rows are the cheap tiles. Share the sheet as "Anyone with the link can view". Episode codes leave the column out.
      </p>
    </div>
  );
}
