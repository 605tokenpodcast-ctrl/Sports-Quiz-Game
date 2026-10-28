// The top bar: show logo, round, scores and the sound and menu buttons.
import React from 'react';
import {Menu as MenuIcon, Trophy, Users, Star, Edit3} from 'lucide-react';
import {gameAudio} from '../utils/helper';
import {useGame} from '../game/GameContext';

export default function Scoreboard() {
  const {
    isClientConnected,
    setIsGameMenuOpen,
    setIsInviteModalOpen,
    difficulty,
    answerMode,
    isTwoPlayerMode,
    currentRound,
    activeSelector,
    contestants,
    activeClue,
    openTagEditorModal,
    activeContestantsList,
    openLeaderboardWithConfig,
  } = useGame();
  return (
    <>
      <header className="relative z-20 w-full bg-slate-900/95 border-b border-blue-800/80 shadow-lg px-2 sm:px-4 py-2 flex items-center justify-between gap-2 shrink-0">
        {/* Left: Show Logo & Round Badge */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md border border-amber-300">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950" />
          </div>
          <div className="hidden xs:block">
            <div className="text-[11px] sm:text-xs font-black tracking-wider text-amber-400 flex items-center gap-1.5 uppercase">
              <span className="hidden md:inline">SPORTS ARENA SHOWDOWN</span>
              <span className="md:hidden">ARENA QUIZ</span>
              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-blue-900/90 text-blue-200 border border-blue-700">
                {currentRound === 'ROUND_1'
                  ? 'ROUND 1'
                  : currentRound === 'CHAMPIONSHIP'
                  ? 'ROUND 2'
                  : 'FINAL SHOWDOWN'}
              </span>
            </div>
            <div className="text-[9px] sm:text-[10px] text-slate-400 hidden sm:block">
              Difficulty: <span className="text-white font-bold">{difficulty}</span> | Format:{' '}
              <span className="text-white font-bold">{answerMode}</span>
              {(isTwoPlayerMode || isClientConnected) && (
                <span className="ml-1.5 text-emerald-400 font-black">
                  | {isClientConnected ? '📱 CROSS-DEVICE DUEL' : '2P PASS & PLAY'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Live Bankroll Scoreboard with Sleek Broadcast Digital Badges */}
        <div className="flex items-center gap-1 sm:gap-2 bg-slate-950/90 px-2 sm:px-3 py-1 rounded-full border border-blue-900/70 shadow-inner">
          {activeContestantsList.map((cid, idx) => {
            const c = contestants[cid];
            const isSelector = activeSelector === cid && !activeClue && currentRound !== 'FINAL_SHOWDOWN';
            const isPlayerType = cid === 'player' || cid === 'player2';
            const isBuzzed = activeClue?.buzzedContestantId === cid;
            const isWrong = c.reaction === 'wrong';
            const isCorrect = c.reaction === 'correct';

            return (
              <React.Fragment key={cid}>
                {idx > 0 && <div className="w-px h-5 sm:h-6 bg-slate-800" />}
                <div
                  onClick={() => {
                    if (cid === 'player') openTagEditorModal();
                  }}
                  title={cid === 'player' ? 'Click to Edit Contestant Tag' : undefined}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 rounded-full transition-all ${
                    cid === 'player' ? 'cursor-pointer hover:bg-amber-500/20' : ''
                  } ${
                    isBuzzed
                      ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 shadow-md animate-pulse'
                      : isSelector
                      ? 'bg-amber-400/20 border border-amber-400 shadow-sm ring-1 ring-amber-400/50'
                      : isPlayerType
                      ? 'bg-amber-500/10 border border-amber-500/30'
                      : 'bg-slate-900/50'
                  }`}>
                  {/* Status Indicator LED Pill */}
                  <div
                    className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0 transition-colors ${
                      isBuzzed
                        ? 'bg-slate-950 animate-ping'
                        : isCorrect
                        ? 'bg-emerald-400 ring-2 ring-emerald-300'
                        : isWrong
                        ? 'bg-rose-500 ring-2 ring-rose-400'
                        : isSelector
                        ? 'bg-amber-400 animate-pulse'
                        : isPlayerType
                        ? 'bg-amber-400'
                        : cid === 'coach'
                        ? 'bg-blue-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                  <div className="text-left leading-none">
                    <div
                      className={`text-[8px] sm:text-[9px] uppercase tracking-wider font-bold truncate max-w-[50px] sm:max-w-none flex items-center gap-0.5 ${
                        isBuzzed
                          ? 'text-slate-950 font-black'
                          : isPlayerType
                          ? 'text-amber-300'
                          : cid === 'coach'
                          ? 'text-blue-300'
                          : 'text-emerald-300'
                      }`}>
                      <span>{c.shortName}</span>
                      {cid === 'player' && !isBuzzed && <Edit3 className="w-2 h-2 text-amber-400/70 ml-0.5" />}
                      {isSelector && !isBuzzed && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />}
                    </div>
                    <div
                      className={`text-[10px] sm:text-xs md:text-sm font-black font-mono tracking-tight ${
                        isBuzzed
                          ? 'text-slate-950 font-black'
                          : c.score >= 0
                          ? isPlayerType
                            ? 'text-amber-300'
                            : 'text-slate-100'
                          : 'text-rose-400'
                      }`}>
                      ${c.score.toLocaleString()}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Right Buttons: Leaderboard, Invite Friends & Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => openLeaderboardWithConfig()}
            className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] px-2 sm:px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/80 flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md"
            title="All Leaderboards">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-black hidden xl:inline">LEADERBOARDS</span>
          </button>

          <button
            onClick={() => {
              gameAudio.playCrispClick();
              setIsInviteModalOpen(true);
            }}
            className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-950/90 hover:bg-emerald-800 text-emerald-200 border border-emerald-600/80 flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md"
            title="Invite Friends">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold hidden lg:inline">
              {isClientConnected ? 'FRIEND CONNECTED' : 'INVITE / DUEL'}
            </span>
          </button>

          <button
            onClick={() => {
              gameAudio.playCrispClick();
              setIsGameMenuOpen(true);
            }}
            className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-950/90 hover:bg-blue-800 text-blue-200 border border-blue-700/80 flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md"
            title="Game Menu">
            <MenuIcon className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            <span className="text-xs font-bold hidden md:inline">MENU</span>
          </button>
        </div>
      </header>
    </>
  );
}
