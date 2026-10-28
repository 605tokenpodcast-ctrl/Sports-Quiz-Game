// The open clue on the host screen: buzzers, answer choices or typing, and Daily Double wagers.
import {Zap, Clock, DollarSign, Star} from 'lucide-react';
import {gameAudio} from '../utils/helper';
import TimeLeft from '../utils/TimeLeft';
import {isOpenAnswerMode} from '../game/types';
import {maxDailyDoubleWager} from '../game/rules';
import VoiceAnswerButton, {isVoiceSupported} from '../utils/VoiceAnswerButton';
import {useGame} from '../game/GameContext';

export default function ClueCard() {
  const {
    isClientConnected,
    answerMode,
    isTwoPlayerMode,
    roundMaxClue,
    contestants,
    activeClue,
    setActiveClue,
    player3Human,
    answerByVoice,
    handleContestantBuzz,
    handleContestantSubmitAnswer,
    activeContestantsList,
    dailyDoubleClock,
  } = useGame();
  return (
    <>
      {activeClue && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto touch-auto">
          <div className="w-full max-w-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-blue-950 border-2 border-amber-400 rounded-2xl p-3 sm:p-5 shadow-2xl flex flex-col items-center text-center my-auto max-h-[94vh] overflow-y-auto">
            {/* Header: Clue Category, Value & Contestant Status Badges */}
            <div className="w-full flex items-center justify-between border-b border-blue-800/80 pb-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-black text-amber-400 tracking-wider uppercase text-left">
                  {activeClue.clue.category}
                </span>
                <span className="text-xs sm:text-sm font-black text-amber-300 bg-blue-950 px-2 py-0.5 rounded-full border border-blue-700 flex items-center gap-0.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  {activeClue.isBonusWager ? activeClue.bonusWagerInput : activeClue.clue.value}
                  {activeClue.isBonusWager && (
                    <span className="text-[9px] text-amber-400 font-bold ml-0.5">DAILY DOUBLE</span>
                  )}
                </span>
              </div>

              {/* Mini Contestant Reaction Badges */}
              <div className="flex items-center gap-1.5">
                {activeContestantsList.map((cid) => {
                  const isBuzzed = activeClue.buzzedContestantId === cid;
                  const isLocked = activeClue.buzzerLockout[cid];
                  const cName = contestants[cid]?.shortName || cid;
                  return (
                    <div
                      key={cid}
                      className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-bold border transition-all flex items-center gap-1 ${
                        isBuzzed
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm animate-pulse'
                          : isLocked
                          ? 'bg-slate-950/60 text-slate-500 border-slate-800 line-through'
                          : 'bg-slate-900/80 text-slate-300 border-slate-700'
                      }`}>
                      <span>{cName}</span>
                      {isBuzzed && <Zap className="w-2.5 h-2.5 fill-slate-950 text-slate-950" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Countdown / Status Light Bar */}
            <div className="w-full flex items-center justify-center gap-2 mb-2">
              {activeClue.isBonusWager && !activeClue.bonusWagerLocked && (
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-black animate-pulse">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span>DAILY DOUBLE — WAGER CONFIRMATION REQUIRED</span>
                </div>
              )}
              {!activeClue.isBonusWager && activeClue.phase === 'READING' && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-700 text-rose-300 text-xs font-bold animate-pulse">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span>READING CLUE... (BUZZER OPENS IN <TimeLeft c={activeClue} />s)</span>
                </div>
              )}
              {activeClue.phase === 'BUZZER_OPEN' && (
                <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-black animate-bounce">
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <span>BUZZERS ACTIVE! (<TimeLeft c={activeClue} />s)</span>
                </div>
              )}
              {activeClue.phase === 'ANSWERING' && (!activeClue.isBonusWager || activeClue.bonusWagerLocked) && (
                <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-blue-900 border border-blue-500 text-blue-200 text-xs font-bold">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>ANSWER TIMER: <TimeLeft c={activeClue} />s</span>
                </div>
              )}
            </div>

            {/* Clue Text Display or Daily Double Obscured Shroud */}
            {activeClue.isBonusWager && !activeClue.bonusWagerLocked ? (
              <div className="w-full bg-slate-950/95 border-2 border-amber-500/80 rounded-xl p-4 sm:p-6 mb-3 flex flex-col items-center justify-center text-center shadow-inner">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center mb-2 animate-bounce">
                  <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
                </div>
                <div className="text-base sm:text-xl font-black text-amber-400 uppercase tracking-wider mb-1">
                  ★ DAILY DOUBLE CLUE CLASSIFIED ★
                </div>
                <p className="text-xs sm:text-sm text-slate-300 max-w-md">
                  The clue text is hidden. {contestants[activeClue.bonusSelectingPlayerId]?.name} must confirm their wager before the clue is revealed!
                </p>
              </div>
            ) : (
              <div className="w-full bg-slate-950/90 border border-blue-900/80 rounded-xl p-3 sm:p-5 mb-3 transition-all duration-300">
                <p className="text-sm sm:lg md:text-xl font-semibold text-slate-100 leading-relaxed drop-shadow-sm">
                  {activeClue.clue.clue}
                </p>
              </div>
            )}

            {/* BONUS DAILY DOUBLE WAGER MODAL (AUTHENTIC SLIDER & PRESETS) */}
            {activeClue.isBonusWager && !activeClue.bonusWagerLocked && (
              <div className="w-full flex flex-col items-center gap-3 p-3.5 sm:p-4 bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-400 rounded-xl mb-3 shadow-2xl">
                <div className="flex items-center gap-2 text-amber-300 font-black text-xs sm:text-sm uppercase tracking-wider">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span>DAILY DOUBLE WAGER — {contestants[activeClue.bonusSelectingPlayerId]?.name}</span>
                </div>

                <div className="text-[11px] sm:text-xs text-slate-300">
                  Current Bankroll: <strong className="text-amber-400">${contestants[activeClue.bonusSelectingPlayerId]?.score.toLocaleString()}</strong> | Min: $5 | Max: $
                  {maxDailyDoubleWager(roundMaxClue, contestants[activeClue.bonusSelectingPlayerId]?.score).toLocaleString()}
                </div>

                {activeClue.bonusSelectingPlayerId === 'player' || (!isClientConnected && activeClue.bonusSelectingPlayerId === 'player2') ? (
                  /* Human Wager Controls */
                  <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                    <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border-2 border-amber-400 shadow-inner">
                      <span className="text-base font-bold text-amber-400">$</span>
                      <input
                        type="number"
                        min={5}
                        max={maxDailyDoubleWager(roundMaxClue, contestants[activeClue.bonusSelectingPlayerId]?.score)}
                        step={50}
                        value={activeClue.bonusWagerInput}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 5;
                          const maxVal = maxDailyDoubleWager(roundMaxClue, contestants[activeClue.bonusSelectingPlayerId]?.score);
                          setActiveClue((prev) => (prev ? {...prev, bonusWagerInput: Math.max(5, Math.min(maxVal, val))} : null));
                        }}
                        className="w-24 sm:w-32 bg-transparent text-amber-300 font-black text-center text-base sm:text-lg focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={() => {
                        const maxVal = maxDailyDoubleWager(roundMaxClue, contestants[activeClue.bonusSelectingPlayerId]?.score);
                        setActiveClue((prev) => (prev ? {...prev, bonusWagerInput: maxVal} : null));
                      }}
                      className="px-3 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded-md text-xs font-bold transition-all active:scale-95">
                      TRUE DAILY DOUBLE (MAX)
                    </button>

                    <button
                      onClick={() => {
                        const maxVal = maxDailyDoubleWager(roundMaxClue, contestants[activeClue.bonusSelectingPlayerId]?.score);
                        setActiveClue((prev) => (prev ? {...prev, bonusWagerInput: Math.max(50, Math.floor(maxVal / 2))} : null));
                      }}
                      className="px-3 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded-md text-xs font-bold transition-all active:scale-95">
                      HALF
                    </button>

                    <button
                      onClick={() => {
                        setActiveClue((prev) => (prev ? {...prev, bonusWagerInput: roundMaxClue} : null));
                      }}
                      className="px-3 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded-md text-xs font-bold transition-all active:scale-95">
                      ${roundMaxClue.toLocaleString()}
                    </button>

                    <button
                      onClick={() => {
                        gameAudio.playConfirmSelect();
                        setActiveClue((prev) =>
                          prev
                            ? {
                                ...prev,
                                ...dailyDoubleClock(prev.clue, Date.now()),
                                bonusWagerLocked: true,
                                feedbackText: `Wager locked at $${prev.bonusWagerInput.toLocaleString()}! Provide your answer.`,
                              }
                            : null
                        );
                      }}
                      className="min-w-[48px] min-h-[44px] px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black rounded-lg text-xs sm:text-sm tracking-wider shadow-lg transition-all active:scale-95 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 fill-slate-950" />
                      <span>LOCK IN WAGER & REVEAL CLUE</span>
                    </button>
                  </div>
                ) : isClientConnected && (activeClue.bonusSelectingPlayerId === 'player2' || (player3Human && activeClue.bonusSelectingPlayerId === 'analyst')) ? (
                  /* Waiting for a friend on their own phone */
                  <div className="text-xs text-amber-300 font-bold flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Waiting for {contestants[activeClue.bonusSelectingPlayerId]?.name} to submit their wager on their device...</span>
                  </div>
                ) : (
                  /* AI Opponent Wager Announcement */
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-xs font-black text-amber-300 uppercase animate-pulse">
                      {contestants[activeClue.bonusSelectingPlayerId]?.name} announces a wager of ${activeClue.bonusWagerInput.toLocaleString()}!
                    </div>
                    <div className="text-[10px] text-slate-400">Revealing clue momentarily...</div>
                  </div>
                )}
              </div>
            )}

            {/* FEEDBACK / STATUS TEXT */}
            <div className="text-xs sm:text-sm font-bold text-amber-300 mb-3 min-h-[20px]">
              {activeClue.feedbackText}
            </div>

            {/* BUZZER RACE BUTTONS INSIDE CLUE CARD */}
            {!activeClue.isBonusWager && activeClue.phase === 'BUZZER_OPEN' && (
              <div className="w-full mb-2 flex flex-col sm:flex-row gap-2">
                {!activeClue.buzzerLockout.player && (
                  <button
                    onClick={() => handleContestantBuzz('player')}
                    className="flex-1 min-h-[56px] py-3 px-4 rounded-xl font-black text-sm sm:text-base tracking-wider flex items-center justify-center gap-2 shadow-xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-slate-950 hover:brightness-110 active:scale-95 border-2 border-white animate-pulse cursor-pointer">
                    <Zap className="w-5 h-5 fill-slate-950 text-slate-950" />
                    <span>BUZZ IN NOW! (SPACE / ENTER / TAP)</span>
                  </button>
                )}

                {isTwoPlayerMode && !isClientConnected && !activeClue.buzzerLockout.player2 && (
                  <button
                    onClick={() => handleContestantBuzz('player2')}
                    className="flex-1 min-h-[56px] py-3 px-4 rounded-xl font-black text-sm sm:text-base tracking-wider flex items-center justify-center gap-2 shadow-xl bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 text-slate-950 hover:brightness-110 active:scale-95 border-2 border-white animate-pulse cursor-pointer">
                    <Zap className="w-5 h-5 fill-slate-950 text-slate-950" />
                    <span>P2 BUZZ (ENTER / L / TAP)</span>
                  </button>
                )}
              </div>
            )}

            {/* READING PHASE WAIT NOTICE */}
            {!activeClue.isBonusWager && activeClue.phase === 'READING' && (
              <div className="w-full mb-2">
                <button
                  onClick={() => handleContestantBuzz('player')}
                  className="w-full min-h-[48px] py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm tracking-wider flex items-center justify-center gap-2 bg-slate-950/80 text-rose-300 border border-rose-700/80">
                  <Clock className="w-4 h-4 text-rose-400" />
                  <span>WAIT FOR HOST LIGHT BEFORE BUZZING</span>
                </button>
              </div>
            )}

            {/* ANSWER CHOICES CONTAINER (Active only after Daily Double Wager is confirmed) */}
            {activeClue.phase === 'ANSWERING' &&
              (!activeClue.isBonusWager || activeClue.bonusWagerLocked) &&
              (activeClue.buzzedContestantId === 'player' || (activeClue.buzzedContestantId === 'player2' && !isClientConnected)) && (
                <div className="w-full z-20">
                  {answerMode === 'VOICE' && isVoiceSupported ? (
                    <VoiceAnswerButton
                      key={`${activeClue.clue.id}-${activeClue.buzzedContestantId}`}
                      autoStart
                      size="large"
                      label="SAY YOUR ANSWER"
                      onHeard={(heard) =>
                        answerByVoice(heard, (answer) =>
                          handleContestantSubmitAnswer(answer, activeClue.buzzedContestantId as 'player' | 'player2')
                        )
                      }
                    />
                  ) : (
                  <>
                  {!isOpenAnswerMode(answerMode) ? (
                    <div className="w-full flex flex-col gap-1.5">
                      <div className="text-[10px] sm:text-xs text-amber-300 font-bold uppercase tracking-wider flex items-center justify-between px-1">
                        <span>Select or Press [A-H] / [1-8]:</span>
                        <span className="text-slate-400 font-normal">
                          {activeClue.options.length}-Choice Format
                        </span>
                      </div>
                      <div
                        className={`w-full grid gap-2 sm:gap-2.5 ${
                          activeClue.options.length > 4
                            ? 'grid-cols-2 md:grid-cols-4'
                            : 'grid-cols-1 sm:grid-cols-2'
                        }`}>
                        {activeClue.options.map((opt, idx) => {
                          const letterLabel = String.fromCharCode(65 + idx); // 'A', 'B', 'C', ...
                          return (
                            <button
                              key={`${opt}-${idx}`}
                              onClick={() => handleContestantSubmitAnswer(opt, activeClue.buzzedContestantId as 'player' | 'player2')}
                              className="min-h-[48px] sm:min-h-[52px] p-2.5 rounded-xl bg-gradient-to-b from-blue-900 to-blue-950 hover:from-blue-800 hover:to-blue-900 text-slate-100 hover:text-amber-300 border-2 border-blue-600 hover:border-amber-400 font-bold text-xs sm:text-sm transition-all active:scale-95 text-left shadow-md hover:shadow-amber-500/20 flex items-center gap-2 cursor-pointer leading-tight group">
                              <span className="w-6 h-6 rounded-lg bg-blue-950 border border-amber-400/80 group-hover:bg-amber-400 group-hover:text-slate-950 text-amber-300 font-black text-xs flex items-center justify-center shrink-0 shadow-inner">
                                {letterLabel}
                              </span>
                              <span className="line-clamp-2 flex-1">{opt}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col items-center gap-2">
                      <div className="w-full flex gap-2">
                        <input
                          type="text"
                          placeholder="Type player, team, or stat..."
                          value={activeClue.typedInput}
                          onChange={(e) =>
                            setActiveClue((prev) => (prev ? {...prev, typedInput: e.target.value} : null))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleContestantSubmitAnswer(activeClue.typedInput, activeClue.buzzedContestantId as 'player' | 'player2');
                            }
                          }}
                          autoFocus
                          className="flex-1 bg-slate-950 border-2 border-amber-400 text-white font-bold px-4 py-2.5 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                        <button
                          onClick={() =>
                            handleContestantSubmitAnswer(activeClue.typedInput, activeClue.buzzedContestantId as 'player' | 'player2')
                          }
                          className="min-w-[48px] min-h-[48px] px-6 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black rounded-lg text-xs sm:text-sm tracking-wider transition-all active:scale-95 shadow">
                          SUBMIT
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Spelling & nickname tolerance enabled (e.g. "Brady", "TB12").
                      </div>
                    </div>
                  )}
                  <div className="mt-2">
                    <VoiceAnswerButton
                      key={`${activeClue.clue.id}-${activeClue.buzzedContestantId}`}
                      onHeard={(heard) =>
                        answerByVoice(heard, (answer) =>
                          handleContestantSubmitAnswer(answer, activeClue.buzzedContestantId as 'player' | 'player2')
                        )
                      }
                    />
                  </div>
                  </>
                  )}
                </div>
              )}
          </div>
        </div>
      )}
    </>
  );
}
