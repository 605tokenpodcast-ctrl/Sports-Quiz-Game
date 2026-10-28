// The end of game results.
import {RotateCw, Trophy, Edit3, Share2} from 'lucide-react';
import {MenuOverlay} from '../utils/helper';
import {AnswerFormat, TriviaTier} from '../utils/leaderboard';
import {IMG_TROPHY} from '../ui/shared';
import {useGame} from '../game/GameContext';

export default function ResultsOverlay() {
  const {
    playerName,
    highScoreCelebration,
    difficulty,
    answerMode,
    gameState,
    contestants,
    matchStats,
    openTagEditorModal,
    currentOpponentMode,
    startMatch,
    activeContestantsList,
    openLeaderboardWithConfig,
    recapMomentsList,
    recapAwardsList,
    shareRecap,
  } = useGame();
  return (
    <>
      {(gameState.status === 'VICTORY' || gameState.status === 'GAME_OVER') && (
        <MenuOverlay tone={gameState.status === 'VICTORY' ? 'victory' : 'danger'} zIndex={60}>
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-400 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col items-center text-center">
            {/* Trophy Icon */}
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 mb-1">
              <img
                src={IMG_TROPHY}
                alt="Championship Trophy"
                className="w-full h-full object-contain filter drop-shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse"
              />
            </div>

            <h1 className="text-lg sm:text-2xl md:text-3xl font-black text-amber-400 tracking-wider uppercase mb-1">
              {gameState.status === 'VICTORY' ? 'ARENA CHAMPION!' : 'MATCH COMPLETED'}
            </h1>

            {/* High Score Celebration Banner */}
            {highScoreCelebration && (
              <div className="w-full bg-gradient-to-r from-amber-500/20 via-yellow-400/30 to-amber-500/20 border-2 border-amber-400 rounded-xl p-2.5 mb-2 text-center animate-bounce">
                <div className="text-xs font-black text-amber-300 uppercase flex items-center justify-center gap-1">
                  <Trophy className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span>
                    {highScoreCelebration.isHighScore
                      ? '★ NEW #1 ALL-TIME RECORD!'
                      : `★ NEW TOP 10 HIGH SCORE: RANK #${highScoreCelebration.rank}!`}
                  </span>
                </div>
                <div className="text-[10px] text-slate-200 mt-0.5">
                  Saved to <strong>{highScoreCelebration.opponent}</strong> ({highScoreCelebration.tier} / {highScoreCelebration.format}
                  {highScoreCelebration.length === 'SHORT' ? ' / Short Game' : ''})
                </div>
              </div>
            )}

            <p className="text-xs text-slate-300 mb-3">
              {gameState.status === 'VICTORY'
                ? 'You dominated the podium and clinched the championship title!'
                : 'Great match! One of the competitors edged ahead in the final standings.'}
            </p>

            {/* Score Breakdown Card */}
            <div className="w-full bg-slate-950/90 border border-blue-800 rounded-xl p-3 mb-2.5 text-left">
              <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider mb-1.5 text-center border-b border-slate-800 pb-1">
                Final Match Bankroll Standings
              </div>
              <div className="flex flex-col gap-1">
                {activeContestantsList
                  .map((id) => contestants[id])
                  .sort((a, b) => b.score - a.score)
                  .map((c, idx) => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between p-1.5 rounded-lg border text-xs ${
                        c.id === 'player' || c.id === 'player2'
                          ? 'bg-amber-950/40 border-amber-500 font-bold'
                          : 'bg-slate-900 border-slate-800'
                      }`}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-amber-400">#{idx + 1}</span>
                        <span className="text-slate-200 truncate max-w-[140px]">{c.name}</span>
                      </div>
                      <span
                        className={`font-black ${
                          c.score >= 0 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                        ${c.score.toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Awards, also on the recap card */}
            {recapAwardsList.length > 0 && (
              <div className="w-full grid grid-cols-2 gap-1.5 mb-2.5">
                {recapAwardsList.map((a) => (
                  <div key={a.title} className="bg-slate-950/90 border border-amber-500/60 rounded-xl p-2 text-center">
                    <div className="text-[10px] font-black text-amber-300 uppercase tracking-wider">
                      {a.emoji} {a.title}
                    </div>
                    <div className="text-xs font-black text-white truncate">{a.winner}</div>
                    <div className="text-[10px] text-slate-400">{a.detail}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Best moments, also on the recap card */}
            {recapMomentsList.length > 0 && (
              <div className="w-full bg-slate-950/90 border border-blue-800 rounded-xl p-2.5 mb-2.5 text-left">
                <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider mb-1 text-center">Best Moments</div>
                {recapMomentsList.map((m) => (
                  <div key={m} className="text-[11px] text-slate-200 leading-snug">• {m}</div>
                ))}
              </div>
            )}

            {/* Match Career Stats */}
            <div className="w-full grid grid-cols-3 gap-1.5 mb-3 text-center">
              <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                <div className="text-[9px] text-slate-400">Questions</div>
                <div className="text-xs font-black text-white">{matchStats.totalQuestions}</div>
              </div>
              <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                <div className="text-[9px] text-slate-400">Daily Doubles</div>
                <div className="text-xs font-black text-amber-400">{matchStats.bonusWagersHit}</div>
              </div>
              <div className="bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                <div className="text-[9px] text-slate-400">Accuracy</div>
                <div className="text-xs font-black text-emerald-400">
                  {matchStats.playerCorrect + matchStats.playerWrong > 0
                    ? `${Math.round(
                        (matchStats.playerCorrect /
                          (matchStats.playerCorrect + matchStats.playerWrong)) *
                          100
                      )}%`
                    : '100%'}
                </div>
              </div>
            </div>

            {/* Buttons: Leaderboard, Rematch, Edit Tag */}
            <div className="w-full flex flex-col gap-2">
              <button
                onClick={shareRecap}
                className="min-w-[48px] min-h-[44px] w-full py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" />
                <span>SHARE RECAP CARD</span>
              </button>

              <button
                onClick={() => openLeaderboardWithConfig(currentOpponentMode, difficulty as TriviaTier, answerMode as AnswerFormat)}
                className="min-w-[48px] min-h-[44px] w-full py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2">
                <Trophy className="w-4 h-4 fill-slate-950" />
                <span>VIEW LEADERBOARD STANDINGS</span>
              </button>

              <button
                autoFocus
                onClick={startMatch}
                className="min-w-[48px] min-h-[44px] w-full py-2.5 rounded-full bg-slate-950 hover:bg-slate-800 border border-slate-700 text-white font-black text-xs sm:text-sm shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2">
                <RotateCw className="w-4 h-4" />
                PLAY AGAIN
              </button>

              <button
                onClick={openTagEditorModal}
                className="min-w-[44px] min-h-[40px] w-full py-2 rounded-full bg-blue-950 hover:bg-blue-900 border border-blue-700 text-blue-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors">
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>Change Contestant Tag ({playerName})</span>
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}
    </>
  );
}
