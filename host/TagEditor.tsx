// Changing Player 1's name tag.
import {Check, User, X} from 'lucide-react';
import {gameAudio, MenuOverlay} from '../utils/helper';
import {PRESET_TAG_SUGGESTIONS} from '../ui/shared';
import {useGame} from '../game/GameContext';

export default function TagEditor() {
  const {isTagEditorOpen, setIsTagEditorOpen, tagEditorInput, setTagEditorInput, handleSaveTag} = useGame();
  return (
    <>
      {isTagEditorOpen && (
        <MenuOverlay tone="neutral" zIndex={85}>
          <div className="w-full max-w-md bg-gradient-to-b from-slate-900 via-slate-900 to-blue-950 border-2 border-amber-400 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col text-left">
            <div className="flex items-center justify-between border-b border-blue-900 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 shadow">
                  <User className="w-5 h-5 fill-slate-950" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-amber-400 uppercase tracking-wider">
                    EDIT CONTESTANT TAG
                  </h2>
                  <div className="text-[10px] text-slate-400">
                    Set your custom broadcast name & leaderboard identity
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsTagEditorOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Input Form with Char Limit */}
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex justify-between items-center text-xs">
                <label className="font-bold text-amber-300">Contestant Name / Tag:</label>
                <span className="text-[10px] text-slate-400 font-mono">{tagEditorInput.length} / 18</span>
              </div>
              <input
                type="text"
                maxLength={18}
                value={tagEditorInput}
                onChange={(e) => setTagEditorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTag();
                  if (e.key === 'Escape') setIsTagEditorOpen(false);
                }}
                autoFocus
                placeholder="Enter your name or gamer tag..."
                className="w-full bg-slate-950 border-2 border-amber-400 text-amber-300 font-black text-base px-3.5 py-2.5 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            {/* Quick Preset Ideas */}
            <div className="mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Quick Title Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAG_SUGGESTIONS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setTagEditorInput(preset);
                      gameAudio.playHoverMicroTone();
                    }}
                    className="px-2 py-1 bg-slate-950 hover:bg-blue-900 border border-blue-800/80 rounded-lg text-[11px] text-slate-200 font-bold transition-colors">
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Buttons: Save & Cancel */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => setIsTagEditorOpen(false)}
                className="min-h-[44px] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs sm:text-sm transition-colors">
                Cancel (Esc)
              </button>
              <button
                onClick={() => handleSaveTag()}
                className="min-h-[44px] py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Save Tag (Enter)</span>
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}
    </>
  );
}
