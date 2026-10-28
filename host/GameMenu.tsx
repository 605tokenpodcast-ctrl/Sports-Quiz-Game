// The in-game menu.
import {Play, RotateCw, Volume2, VolumeX, Trophy, Shield, RefreshCw, Edit3} from 'lucide-react';
import {gameAudio, MenuOverlay} from '../utils/helper';
import {useGame} from '../game/GameContext';

export default function GameMenu() {
  const {
    sfxMuted,
    setSfxMuted,
    musicMuted,
    setMusicMuted,
    isGameMenuOpen,
    setIsGameMenuOpen,
    playerName,
    setGameState,
    seenQuestionsCount,
    totalQuestionCount,
    openTagEditorModal,
    handleResetQuestionHistory,
    startMatch,
    openLeaderboardWithConfig,
  } = useGame();
  return (
    <>
      {isGameMenuOpen && (
        <MenuOverlay tone="neutral" zIndex={60}>
          <div className="w-full max-w-md bg-slate-900 border-2 border-blue-600 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col items-center text-center">
            <h2 className="text-xl sm:text-2xl font-black text-amber-400 uppercase tracking-wider mb-4">
              GAME MENU
            </h2>

            {/* Zero Repeat Question Status in Menu */}
            <div className="w-full bg-slate-950 p-2.5 rounded-xl border border-emerald-700/60 mb-3 text-left">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                <span className="flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Zero-Repeat Protection: Active</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {seenQuestionsCount} / {totalQuestionCount} Pool
                </span>
              </div>
              <div className="text-[10px] text-emerald-400/80 mt-1 font-semibold">
                New questions come first. Ones this device has seen only come back when a category runs low.
              </div>
            </div>

            <div className="w-full flex flex-col gap-2.5 mb-5">
              <button
                autoFocus
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsGameMenuOpen(false);
                }}
                className="min-w-[48px] min-h-[48px] w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base transition-colors flex items-center justify-center gap-2 shadow">
                <Play className="w-5 h-5 fill-slate-950" />
                Resume Match
              </button>

              {/* Contestant Tag Edit Button in Game Menu */}
              <button
                onClick={openTagEditorModal}
                className="min-w-[48px] min-h-[44px] w-full py-2.5 rounded-xl bg-blue-900/80 hover:bg-blue-800 border border-blue-600 text-blue-100 font-bold text-xs flex items-center justify-center gap-2 transition-colors">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <span>Change Contestant Tag ({playerName})</span>
              </button>

              {/* Audio Controls */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const next = gameAudio.toggleMute();
                    setSfxMuted(next);
                  }}
                  className="min-w-[44px] min-h-[44px] py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition-colors">
                  {sfxMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  <span>SFX: {sfxMuted ? 'Off' : 'On'}</span>
                </button>

                <button
                  onClick={() => setMusicMuted((prev) => !prev)}
                  className="min-w-[44px] min-h-[44px] py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition-colors">
                  {musicMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  <span>Music: {musicMuted ? 'Off' : 'On'}</span>
                </button>
              </div>

              {/* Leaderboards Trigger */}
              <button
                onClick={() => {
                  openLeaderboardWithConfig();
                }}
                className="min-w-[48px] min-h-[48px] w-full py-2.5 rounded-xl bg-amber-950/60 hover:bg-amber-900 border border-amber-700 text-amber-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors">
                <Trophy className="w-4 h-4 text-amber-400" />
                🏆 View All Hall of Champions Leaderboards
              </button>

              {/* Reset Question History */}
              <button
                onClick={handleResetQuestionHistory}
                className="min-w-[48px] min-h-[44px] w-full py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Reset Question History ({seenQuestionsCount} Seen)</span>
              </button>

              {/* Restart Match */}
              <button
                onClick={startMatch}
                className="min-w-[48px] min-h-[48px] w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors">
                <RotateCw className="w-4 h-4" />
                Restart Match
              </button>

              {/* Quit to Main Menu */}
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsGameMenuOpen(false);
                  setGameState((prev) => ({...prev, status: 'START'}));
                }}
                className="min-w-[48px] min-h-[48px] w-full py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors">
                Quit to Main Menu
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}
    </>
  );
}
