// This device's leaderboards, with filters.
import {Play, Trophy, User, Medal, Filter, Trash2, Edit3} from 'lucide-react';
import {gameAudio, MenuOverlay} from '../utils/helper';
import {AIDifficulty, AnswerMode} from '../game/types';
import {
  FORMAT_OPTIONS,
  LENGTH_OPTIONS,
  OPPONENT_OPTIONS,
  resetAllLeaderboards,
  resetLeaderboardCategory,
  TIER_OPTIONS,
} from '../utils/leaderboard';
import {useGame} from '../game/GameContext';

export default function LeaderboardModal() {
  const {
    setIsClientConnected,
    setIsInviteModalOpen,
    isLeaderboardOpen,
    setIsLeaderboardOpen,
    playerName,
    leaderboardFilterOpponent,
    setLeaderboardFilterOpponent,
    leaderboardFilterTier,
    setLeaderboardFilterTier,
    leaderboardFilterFormat,
    setLeaderboardFilterFormat,
    leaderboardFilterLength,
    setLeaderboardFilterLength,
    setLeaderboardRefreshCounter,
    setDifficulty,
    setAnswerMode,
    setGameLength,
    setIsTwoPlayerMode,
    showToast,
    openTagEditorModal,
    displayedLeaderboardEntries,
    myBestRecord,
  } = useGame();
  return (
    <>
      {isLeaderboardOpen && (
        <MenuOverlay tone="neutral" zIndex={80}>
          <div className="w-full max-w-3xl bg-slate-900 border-2 border-amber-400 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col text-left max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 shadow">
                  <Trophy className="w-6 h-6 fill-slate-950" />
                </div>
                <div>
                  <h2 className="text-base sm:text-xl font-black text-amber-400 uppercase tracking-wider">
                    HALL OF CHAMPIONS LEADERBOARD
                  </h2>
                  <div className="text-[10px] sm:text-xs text-slate-400">
                    High scores indexed across every Opponent, Trivia Tier & Answer Format
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsLeaderboardOpen(false)}
                className="min-w-[40px] min-h-[40px] px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors">
                CLOSE
              </button>
            </div>

            {/* Player Name / Tag Profiler Bar */}
            <div className="bg-slate-950 p-2.5 rounded-xl border border-blue-900/60 flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-300 font-medium">Contestant Tag:</span>
                <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  {playerName}
                  <button
                    onClick={openTagEditorModal}
                    className="p-1 px-2 bg-blue-900 hover:bg-blue-800 text-blue-200 rounded border border-blue-700 text-[10px] font-bold flex items-center gap-1"
                    title="Change Name / Edit Tag">
                    <Edit3 className="w-3 h-3" />
                    <span>Edit Tag</span>
                  </button>
                </span>
              </div>

              {/* My Best in This Filter Badge */}
              {myBestRecord ? (
                <div className="text-[11px] bg-amber-500/15 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-bold">
                  <Medal className="w-3.5 h-3.5 text-amber-400" />
                  <span>My Best: ${myBestRecord.score.toLocaleString()} ({myBestRecord.accuracy}% Acc)</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-500 italic">No runs recorded by you in this category yet</div>
              )}
            </div>

            {/* FILTER BAR 1: OPPONENT / GAME MODE TABS */}
            <div className="mb-2">
              <label className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Filter className="w-3 h-3 text-amber-400" />
                <span>1. Opponent / Match Mode</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {OPPONENT_OPTIONS.map((opp) => (
                  <button
                    key={opp.id}
                    onClick={() => {
                      gameAudio.playCrispClick();
                      setLeaderboardFilterOpponent(opp.id);
                    }}
                    className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all truncate flex items-center justify-center gap-1 ${
                      leaderboardFilterOpponent === opp.id
                        ? 'bg-amber-500 text-slate-950 font-black shadow'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}>
                    <span>{opp.icon}</span>
                    <span className="truncate">{opp.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* FILTER BAR 2: TRIVIA TIER TABS */}
            <div className="mb-2">
              <label className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block mb-1">
                2. Trivia Difficulty Tier
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {TIER_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      gameAudio.playCrispClick();
                      setLeaderboardFilterTier(t.id);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                      leaderboardFilterTier === t.id
                        ? 'bg-blue-600 text-white font-black shadow'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* FILTER BAR 3: ANSWER FORMAT TABS */}
            <div className="mb-3">
              <label className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block mb-1">
                3. Answer Format Combination
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {FORMAT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      gameAudio.playCrispClick();
                      setLeaderboardFilterFormat(f.id);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                      leaderboardFilterFormat === f.id
                        ? 'bg-emerald-600 text-white font-black shadow'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* FILTER BAR 4: GAME LENGTH TABS */}
            <div className="mb-3">
              <label className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block mb-1">
                4. Game Length
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {LENGTH_OPTIONS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      gameAudio.playCrispClick();
                      setLeaderboardFilterLength(l.id);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                      leaderboardFilterLength === l.id
                        ? 'bg-amber-500 text-slate-950 font-black shadow'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* LEADERBOARD TABLE */}
            <div className="bg-slate-950 rounded-xl border border-blue-900/60 overflow-hidden mb-3">
              <div className="grid grid-cols-12 bg-slate-900/90 px-3 py-2 text-[10px] font-black text-amber-400 uppercase tracking-wider border-b border-slate-800">
                <div className="col-span-1 text-center">Rank</div>
                <div className="col-span-4">Player Contestant</div>
                <div className="col-span-3 text-right">Bankroll Score</div>
                <div className="col-span-2 text-center">Accuracy</div>
                <div className="col-span-2 text-right">Date</div>
              </div>

              <div className="divide-y divide-slate-800/60 max-h-[40vh] overflow-y-auto">
                {displayedLeaderboardEntries.length > 0 ? (
                  displayedLeaderboardEntries.map((entry, idx) => {
                    const isTop1 = idx === 0;
                    const isTop2 = idx === 1;
                    const isTop3 = idx === 2;
                    const isMe = entry.isLocalPlayer || entry.playerName === playerName;

                    return (
                      <div
                        key={entry.id}
                        className={`grid grid-cols-12 px-3 py-2 items-center text-xs transition-colors ${
                          isMe
                            ? 'bg-amber-500/15 font-bold text-amber-200 border-l-4 border-amber-400'
                            : idx % 2 === 0
                            ? 'bg-slate-950'
                            : 'bg-slate-900/40'
                        }`}>
                        {/* Rank */}
                        <div className="col-span-1 text-center font-black flex items-center justify-center">
                          {isTop1 ? (
                            <span className="text-base" title="Gold Medal">🥇</span>
                          ) : isTop2 ? (
                            <span className="text-base" title="Silver Medal">🥈</span>
                          ) : isTop3 ? (
                            <span className="text-base" title="Bronze Medal">🥉</span>
                          ) : (
                            <span className="text-slate-400 font-mono">#{idx + 1}</span>
                          )}
                        </div>

                        {/* Player Name */}
                        <div className="col-span-4 font-bold truncate flex items-center gap-1.5">
                          <span className={isMe ? 'text-amber-300 font-black' : isTop1 ? 'text-amber-400' : 'text-slate-200'}>
                            {entry.playerName}
                          </span>
                          {isMe && (
                            <span className="text-[9px] px-1 bg-amber-400 text-slate-950 rounded font-black">
                              YOU
                            </span>
                          )}
                        </div>

                        {/* Bankroll Score */}
                        <div className="col-span-3 text-right font-black text-emerald-400 font-mono text-xs sm:text-sm">
                          ${entry.score.toLocaleString()}
                        </div>

                        {/* Accuracy & DD */}
                        <div className="col-span-2 text-center text-[10px] text-slate-300 flex flex-col">
                          <span className="font-bold text-slate-200">{entry.accuracy}%</span>
                          <span className="text-[9px] text-amber-400">{entry.dailyDoublesWon} DDs</span>
                        </div>

                        {/* Date */}
                        <div className="col-span-2 text-right text-[10px] text-slate-400 font-mono">
                          {entry.date}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No leaderboard entries found for this combination.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions: Play This Config & Reset Records */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    resetLeaderboardCategory(
                      leaderboardFilterOpponent,
                      leaderboardFilterTier,
                      leaderboardFilterFormat,
                      leaderboardFilterLength
                    );
                    setLeaderboardRefreshCounter((c) => c + 1);
                    showToast('Cleared this leaderboard');
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Reset Category</span>
                </button>

                <button
                  onClick={() => {
                    resetAllLeaderboards();
                    setLeaderboardRefreshCounter((c) => c + 1);
                    showToast('Cleared all leaderboards');
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold">
                  Reset All
                </button>
              </div>

              <button
                onClick={() => {
                  // Apply currently selected tier and format to match options
                  setDifficulty(leaderboardFilterTier as AIDifficulty);
                  setAnswerMode(leaderboardFilterFormat as AnswerMode);
                  setGameLength(leaderboardFilterLength);
                  if (leaderboardFilterOpponent === 'PASS_PLAY') {
                    setIsTwoPlayerMode(true);
                    setIsClientConnected(false);
                  } else if (leaderboardFilterOpponent === 'ONLINE_DUEL') {
                    setIsInviteModalOpen(true);
                  } else {
                    setIsTwoPlayerMode(false);
                    setIsClientConnected(false);
                  }
                  setIsLeaderboardOpen(false);
                  showToast(`Loaded: ${leaderboardFilterTier} / ${leaderboardFilterFormat}`);
                }}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow transition-all active:scale-95">
                <Play className="w-4 h-4 fill-slate-950" />
                <span>PLAY THIS COMBINATION</span>
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}
    </>
  );
}
