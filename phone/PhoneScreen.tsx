// A friend's phone: their buzzer, answers and wagers, kept in step with the host.
import React from 'react';
import {Trophy, Zap, Clock, Flame, Star, Smartphone, Wifi, Gamepad2, ArrowLeft, Lock, Share2} from 'lucide-react';
import TimeLeft from '../utils/TimeLeft';
import {ContestantId, isOpenAnswerMode, seatLabel} from '../game/types';
import {maxDailyDoubleWager, maxFinalWager, EARLY_BUZZ_LOCKOUT_MS, shownClueText, currentWorth, hintCount} from '../game/rules';
import VoiceAnswerButton, {isVoiceSupported} from '../utils/VoiceAnswerButton';
import {FinalChoices} from '../ui/shared';
import {useGame} from '../game/GameContext';

export default function PhoneScreen() {
  // Shows "Too early!" for a moment after a buzz before the light.
  const [tooEarly, setTooEarly] = React.useState(false);
  const {
    setDeviceRole,
    roomCode,
    p2pStatus,
    p2pDetail,
    answerMode,
    gameState,
    currentRound,
    round1Board,
    round2Board,
    answeredClueIds,
    roundMaxClue,
    activeSelector,
    contestants,
    activeClue,
    finalClue,
    player2FinalWager,
    setPlayer2FinalWager,
    finalShowdownPhase,
    finalTimer,
    finalPlayer2Input,
    setFinalPlayer2Input,
    finalOptions,
    clientTypedInput,
    setClientTypedInput,
    clientWager,
    setClientWager,
    p2pRef,
    mySeat,
    joinWaiting,
    finalLocks,
    showToast,
    answerByVoice,
    finalAnswerByVoice,
    activeContestantsList,
    shareRecap,
    categoryIntro,
    sendClientBuzz,
  } = useGame();
    const isPlayer2Selector = activeSelector === mySeat;
    const isPlayer2Buzzed = activeClue?.buzzedContestantId === mySeat;
    const isPlayer2Locked = Boolean(activeClue?.buzzerLockout[mySeat]);
    const isDailyDoubleForMe = Boolean(activeClue?.isBonusWager && activeClue.bonusSelectingPlayerId === mySeat);
    const myLabel = seatLabel(mySeat);
    const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
    const isClueObscured = Boolean(activeClue?.isBonusWager && !activeClue.bonusWagerLocked);

    return (
      <div className="fixed inset-0 overflow-y-auto bg-slate-950 text-white font-sans flex flex-col justify-between p-3 sm:p-4 short:p-2 select-none touch-manipulation">
        {/* Background Atmosphere */}
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-slate-950 via-slate-900 to-blue-950 opacity-90 pointer-events-none" />

        {/* Client Top Header Status */}
        <header className="relative z-10 w-full bg-slate-900/95 border border-amber-500/60 rounded-xl p-2.5 short:py-1 shadow-lg flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black shadow">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-black text-amber-400 flex items-center gap-1.5 uppercase">
                <span>{myLabel} ARENA CONTROLLER</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-700 rounded">
                  {roomCode}
                </span>
              </div>
              <div className="text-[10px] flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${p2pStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-slate-300">{p2pStatus === 'connected' ? (joinWaiting ? 'Waiting for the host' : 'Synced with Host') : p2pDetail || 'Connecting...'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-700 text-right">
              <div className="text-[9px] text-amber-400 font-bold uppercase">YOUR BANK</div>
              <div className="text-xs font-black text-emerald-400">${contestants[mySeat].score.toLocaleString()}</div>
            </div>

            <button
              onClick={() => {
                if (!window.confirm('Leave this game and host your own on this phone?')) return;
                setDeviceRole('HOST');
                showToast('Switched to Host Arena mode');
              }}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
              title="Switch to Host Arena View">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Lost the host mid-game: the phone reconnects by itself and the host keeps the seat and score. */}
        {gameState.status !== 'START' && p2pStatus !== 'connected' && (
          <div
            role="status"
            className={`relative z-20 mt-2 w-full rounded-xl border px-3 py-2 text-center text-xs font-bold ${
              p2pStatus === 'connecting' ? 'bg-amber-950/95 border-amber-500 text-amber-200' : 'bg-rose-950/95 border-rose-500 text-rose-100'
            }`}>
            {p2pStatus === 'connecting' ? (
              <span>Reconnecting to the host... Your seat and score are saved.</span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                {p2pDetail || 'Lost connection to the host.'}
                <button onClick={() => window.location.reload()} className="px-2 py-1 rounded bg-rose-600 text-white">
                  Rejoin
                </button>
              </span>
            )}
          </div>
        )}

        {/* Client Main Body: Dynamic Gamepad Controls */}
        <main className="relative z-10 flex-1 my-3 short:my-1.5 flex flex-col justify-center items-center w-full max-w-lg mx-auto">
          {/* 1. If Match has not started or in Start Screen */}
          {gameState.status === 'START' && (
            <div className="w-full bg-slate-900/90 border border-amber-500/50 rounded-2xl p-5 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-amber-400 animate-bounce" />
              </div>
              <h2 className="text-lg font-black text-amber-400 uppercase">
                {p2pStatus === 'error' ? 'COULD NOT JOIN' : joinWaiting ? 'ASKING THE HOST' : p2pStatus === 'connected' ? `CONNECTED AS PLAYER ${myLabel.slice(1)}` : 'CONNECTING...'}
              </h2>
              <p className="text-xs text-slate-300">
                {p2pStatus === 'error'
                  ? p2pDetail
                  : joinWaiting
                    ? 'This game has already started. Waiting for the host to let you in.'
                    : 'You are locked in for the match! Waiting for the host to pick the settings and start the game.'}
              </p>
              <div className="text-[11px] text-emerald-400 font-bold bg-emerald-950/80 px-3 py-1.5 rounded-full border border-emerald-700 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" />
                <span>Ready for Buzzer Battles</span>
              </div>
            </div>
          )}

          {/* 2. During Active Clue */}
          {gameState.status === 'PLAYING' && activeClue && (
            <div className="w-full flex flex-col items-center gap-3">
              {/* Clue Header & Prompt Card */}
              <div className="w-full bg-slate-900/95 border-2 border-blue-600 rounded-2xl p-4 shadow-xl text-center">
                <div className="flex items-center justify-between border-b border-blue-800 pb-2 mb-2">
                  <span className="text-xs font-black text-amber-400 uppercase">{activeClue.clue.category}</span>
                  <span className="text-xs font-black text-amber-300 bg-blue-950 px-2 py-0.5 rounded border border-blue-700">
                    ${currentWorth(activeClue)}
                    {activeClue.isBonusWager && <span className="ml-1 text-amber-400">DAILY DOUBLE</span>}
                  </span>
                </div>

                {/* Obscured Clue Card during Daily Double Wager Timing */}
                {isClueObscured ? (
                  <div className="py-6 px-3 bg-slate-950/90 rounded-xl border border-amber-500/60 flex flex-col items-center justify-center text-center gap-2 mb-2">
                    <Lock className="w-8 h-8 text-amber-400 animate-pulse" />
                    <span className="text-xs font-black text-amber-300 uppercase tracking-wider">
                      CLUE CLASSIFIED — HIDDEN UNTIL WAGER CONFIRMED
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Wager must be locked in before clue is revealed.
                    </span>
                  </div>
                ) : (
                  <p className="text-sm sm:text-base font-semibold text-slate-100 leading-snug mb-2">
                    {hintCount(activeClue) > 0 && activeClue.phase !== 'REVEALED' && (
                      <span className="block text-[10px] font-black text-amber-400 uppercase mb-1">
                        Hint {activeClue.hintsShown ?? 1} of {hintCount(activeClue)}
                      </span>
                    )}
                    {shownClueText(activeClue)}
                  </p>
                )}

                <div className="text-xs font-bold text-amber-300">
                  {activeClue.feedbackText}
                </div>
              </div>

              {/* A. Reading Phase -> the buzzer is live but early. Tapping now locks this phone out
                  for a moment (as on TV), so waiting for the light beats tapping over and over. */}
              {!activeClue.isBonusWager && activeClue.phase === 'READING' && (
                <button
                  onClick={() => {
                    if (tooEarly) return;
                    sendClientBuzz(true);
                    setTooEarly(true);
                    window.setTimeout(() => setTooEarly(false), EARLY_BUZZ_LOCKOUT_MS + 150);
                  }}
                  className={`w-full min-h-[140px] py-8 px-4 rounded-3xl border-2 text-center flex flex-col items-center justify-center gap-2 transition-colors ${
                    tooEarly ? 'bg-rose-700 border-rose-300' : 'bg-rose-950/70 border-rose-600'
                  }`}>
                  <Clock className="w-8 h-8 text-rose-300" />
                  <span className="text-sm font-black text-rose-100">{tooEarly ? 'TOO EARLY!' : 'WAIT FOR THE LIGHT'}</span>
                  <span className="text-xs text-rose-300 font-mono">
                    {tooEarly ? 'Buzzing early locks you out for a moment' : <>Buzzer opens in <TimeLeft c={activeClue} />s</>}
                  </span>
                </button>
              )}

              {/* B. Buzzer Open Phase -> GIANT BUZZER BUTTON */}
              {activeClue.phase === 'BUZZER_OPEN' && (
                <div className="w-full flex flex-col items-center gap-2">
                  {!isPlayer2Locked ? (
                    <button
                      onClick={() => {
                        if (typeof navigator !== 'undefined' && navigator.vibrate) {
                          navigator.vibrate(80);
                        }
                        sendClientBuzz();
                      }}
                      className="w-full min-h-[140px] rounded-3xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-400 text-slate-950 font-black text-2xl tracking-widest uppercase shadow-2xl border-4 border-white active:scale-90 transition-transform flex flex-col items-center justify-center gap-2 animate-pulse cursor-pointer">
                      <Zap className="w-12 h-12 fill-slate-950 text-slate-950" />
                      <span>TAP TO BUZZ IN!</span>
                    </button>
                  ) : (
                    <div className="w-full py-8 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-500 font-bold">
                      Buzzer Locked for this question
                    </div>
                  )}
                </div>
              )}

              {/* C. Daily Double Wager for this phone's player. Typed here, sent to the host on confirm. */}
              {isDailyDoubleForMe && !activeClue.bonusWagerLocked && (() => {
                const maxVal = maxDailyDoubleWager(roundMaxClue, contestants[mySeat].score);
                const wager = Math.max(5, Math.min(maxVal, parseInt(clientWager) || 5));
                return (
                <div className="w-full bg-slate-900 border-2 border-amber-400 rounded-2xl p-4 flex flex-col items-center gap-3">
                  <div className="text-xs font-black text-amber-300 uppercase flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>SET YOUR DAILY DOUBLE WAGER</span>
                  </div>

                  <div className="text-[11px] text-slate-300">
                    Bankroll: <strong className="text-amber-400">${contestants[mySeat].score.toLocaleString()}</strong> | Min: $5 | Max: $
                    {maxVal.toLocaleString()}
                  </div>

                  <div className="flex items-center gap-2 w-full justify-center">
                    <span className="text-lg font-bold text-amber-400">$</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={5}
                      max={maxVal}
                      value={clientWager}
                      onChange={(e) => setClientWager(e.target.value)}
                      className="w-32 bg-slate-950 border-2 border-amber-400 text-amber-300 font-black text-center text-xl py-1 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 w-full">
                    <button
                      onClick={() => setClientWager(String(maxVal))}
                      className="py-2 px-2 bg-blue-950 border border-blue-700 text-blue-200 rounded-lg text-xs font-bold">
                      TRUE DAILY DOUBLE (MAX)
                    </button>

                    <button
                      onClick={() => setClientWager(String(Math.max(50, Math.floor(maxVal / 2))))}
                      className="py-2 px-2 bg-blue-950 border border-blue-700 text-blue-200 rounded-lg text-xs font-bold">
                      HALF BANK
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      p2pRef.current?.send({type: 'CLIENT_SET_WAGER', contestantId: mySeat, wager, lockIn: true});
                    }}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black rounded-xl text-sm shadow-lg active:scale-95 flex items-center justify-center gap-1.5">
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>CONFIRM ${wager.toLocaleString()} & REVEAL CLUE</span>
                  </button>
                </div>
                );
              })()}

              {/* D. Answering Phase (If Player 2 Buzzed In or Daily Double is Active for P2) */}
              {activeClue.phase === 'ANSWERING' && isPlayer2Buzzed && (!activeClue.isBonusWager || activeClue.bonusWagerLocked) && (
                <div className="w-full flex flex-col gap-2">
                  <div className="text-xs font-black text-emerald-400 text-center uppercase animate-bounce">
                    YOUR TURN TO ANSWER! (<TimeLeft c={activeClue} />s)
                  </div>

                  {answerMode === 'VOICE' && isVoiceSupported ? (
                    <VoiceAnswerButton
                      key={activeClue.clue.id}
                      autoStart
                      size="large"
                      label="SAY YOUR ANSWER"
                      onHeard={(heard) =>
                        answerByVoice(heard, (answer, alternatives) =>
                          p2pRef.current?.send({type: 'CLIENT_ANSWER', contestantId: mySeat, answer, alternatives})
                        )
                      }
                    />
                  ) : (
                  <>
                  {!isOpenAnswerMode(answerMode) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeClue.options.map((opt, idx) => (
                        <button
                          key={`${opt}-${idx}`}
                          onClick={() => {
                            p2pRef.current?.send({
                              type: 'CLIENT_ANSWER',
                              contestantId: mySeat,
                              answer: opt,
                            });
                          }}
                          className="min-h-[52px] p-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-sm border-2 border-amber-400 shadow-md active:scale-95 text-center">
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Type answer..."
                        value={clientTypedInput}
                        onChange={(e) => setClientTypedInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            p2pRef.current?.send({type: 'CLIENT_ANSWER', contestantId: mySeat, answer: clientTypedInput});
                          }
                        }}
                        autoFocus
                        className="flex-1 bg-slate-950 border-2 border-amber-400 px-3 py-2 text-white font-bold rounded-lg"
                      />
                      <button
                        onClick={() => {
                          p2pRef.current?.send({
                            type: 'CLIENT_ANSWER',
                            contestantId: mySeat,
                            answer: clientTypedInput,
                          });
                        }}
                        className="px-5 bg-amber-500 text-slate-950 font-black rounded-lg text-sm">
                        SUBMIT
                      </button>
                    </div>
                  )}
                  <VoiceAnswerButton
                    key={activeClue.clue.id}
                    onHeard={(heard) =>
                      answerByVoice(heard, (answer, alternatives) =>
                        p2pRef.current?.send({type: 'CLIENT_ANSWER', contestantId: mySeat, answer, alternatives})
                      )
                    }
                  />
                  </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Board Control & Tile Selection for Player 2 */}
          {gameState.status === 'PLAYING' && !activeClue && currentRound !== 'FINAL_SHOWDOWN' && (
            <div className="w-full flex flex-col items-center gap-3">
              {categoryIntro ? (
                // The round's categories are being revealed: list them as they're read out.
                <div className="w-full bg-slate-900 border-2 border-amber-400 rounded-2xl p-3 text-center">
                  <div className="text-xs font-black text-amber-300 uppercase mb-2">This round's categories</div>
                  <div className="flex flex-col gap-1.5">
                    {board.slice(0, categoryIntro.shown).map((cat) => (
                      <div key={cat.title} className="px-2 py-1.5 bg-blue-950 rounded-lg border border-blue-800 text-sm font-black text-amber-300 uppercase">
                        {cat.title}
                      </div>
                    ))}
                  </div>
                </div>
              ) : isPlayer2Selector ? (
                <div className="w-full bg-slate-900 border-2 border-emerald-400 rounded-2xl p-3 text-center">
                  <div className="text-xs font-black text-emerald-400 uppercase flex items-center justify-center gap-1.5 mb-2">
                    <Star className="w-4 h-4 fill-emerald-400" />
                    <span>YOU HAVE BOARD CONTROL! Pick a Clue Tile:</span>
                  </div>

                  {/* One row per category, so the names have room to be read and the tiles are big enough to tap */}
                  <div className="flex flex-col gap-1.5">
                    {board.map((cat, cIdx) => (
                      <div key={cat.title} className="flex items-stretch gap-1.5">
                        <div
                          className="w-[30%] shrink-0 flex items-center px-1.5 py-1 bg-blue-950 rounded-lg border border-blue-800 text-left text-[11px] sm:text-xs font-black text-amber-300 uppercase leading-tight line-clamp-3 break-words"
                          title={cat.title}>
                          {cat.title}
                        </div>
                        <div className="flex-1 grid gap-1" style={{gridTemplateColumns: `repeat(${cat.clues.length}, minmax(0, 1fr))`}}>
                          {cat.clues.map((clue, rIdx) => {
                            const isAnswered = answeredClueIds.has(clue.id);
                            return (
                              <button
                                key={clue.id}
                                disabled={isAnswered}
                                onClick={() => {
                                  p2pRef.current?.send({
                                    type: 'CLIENT_SELECT_CLUE',
                                    contestantId: mySeat,
                                    catIdx: cIdx,
                                    clueIdx: rIdx,
                                  });
                                }}
                                className={`min-h-[48px] px-0 rounded-lg text-[clamp(10px,3vw,14px)] tracking-tight font-black border-2 transition-all ${
                                  isAnswered
                                    ? 'bg-slate-950 text-slate-700 border-slate-800'
                                    : 'bg-blue-900 hover:bg-blue-800 text-amber-300 border-amber-500/60 active:scale-95 shadow'
                                }`}>
                                {isAnswered ? '' : `$${clue.value}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center flex flex-col items-center gap-2">
                  <Clock className="w-8 h-8 text-amber-400 animate-spin" />
                  <div className="text-sm font-black text-amber-400 uppercase">WAITING FOR TILE SELECTION</div>
                  <div className="text-xs text-slate-300">
                    {contestants[activeSelector]?.name || 'Opponent'} is selecting the next clue from the arena board...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Final Showdown for this phone's player: lock a wager, then lock an answer */}
          {gameState.status === 'PLAYING' && currentRound === 'FINAL_SHOWDOWN' && (() => {
            const maxWager = maxFinalWager(contestants[mySeat].score);
            const wagerLocked = Boolean(finalLocks.wager[mySeat]);
            const answerLocked = Boolean(finalLocks.answer[mySeat]);
            const sitOut = Boolean(contestants[mySeat].sitsOutFinal);
            const sendAnswer = (answer: string, lockIn = false) =>
              p2pRef.current?.send({type: 'CLIENT_FINAL_ANSWER', contestantId: mySeat, answer, lockIn});
            return (
            <div className="w-full bg-slate-900 border-2 border-amber-400 rounded-2xl p-4 text-center flex flex-col items-center gap-3">
              <Flame className="w-8 h-8 text-amber-400 animate-pulse" />
              <h2 className="text-base font-black text-amber-400 uppercase">FINAL SHOWDOWN</h2>
              <div className="text-xs text-blue-200">
                CATEGORY: <strong className="text-white">{finalClue?.category}</strong>
              </div>

              {sitOut && finalShowdownPhase !== 'RESULTS' && (
                <div className="text-xs font-bold text-slate-300">
                  {activeContestantsList.every((id) => contestants[id].sitsOutFinal)
                    ? 'Nobody has money in the bank, so there is no Final Showdown this time. The scores stand.'
                    : 'You have no money in the bank, so you sit out the Final Showdown. Your score stands. Watch the others!'}
                </div>
              )}

              {finalShowdownPhase === 'WAGER' && !sitOut && (
                <div className="w-full flex flex-col gap-2">
                  {wagerLocked ? (
                    <div className="text-sm font-black text-emerald-400">
                      Wager locked at ${player2FinalWager.toLocaleString()}. Waiting for the clue...
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-slate-300">Enter your final cash wager (up to ${maxWager.toLocaleString()}):</div>
                      <div className="flex justify-center items-center gap-2">
                        <span className="text-lg font-bold text-amber-400">$</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={maxWager}
                          value={player2FinalWager}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(maxWager, parseInt(e.target.value) || 0));
                            setPlayer2FinalWager(val);
                            p2pRef.current?.send({type: 'CLIENT_FINAL_WAGER', contestantId: mySeat, wager: val});
                          }}
                          className="w-32 bg-slate-950 border border-amber-400 px-3 py-1.5 rounded-lg text-amber-300 font-black text-center"
                        />
                      </div>
                      <button
                        onClick={() =>
                          p2pRef.current?.send({type: 'CLIENT_FINAL_WAGER', contestantId: mySeat, wager: player2FinalWager, lockIn: true})
                        }
                        className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black rounded-xl text-sm shadow-lg active:scale-95">
                        LOCK WAGER
                      </button>
                    </>
                  )}
                </div>
              )}

              {finalShowdownPhase === 'CLUE' && (
                <div className="w-full flex flex-col gap-2">
                  <div className="text-xs font-mono text-rose-400 font-bold">Time Left: <TimeLeft c={finalTimer} format="seconds" />s</div>
                  <div className="p-3 bg-slate-950 rounded-lg text-xs font-medium text-slate-200 border border-blue-800">
                    {finalClue?.clue}
                  </div>
                  {sitOut ? null : answerLocked ? (
                    <div className="text-sm font-black text-emerald-400">
                      Answer locked: "{finalPlayer2Input || '(no answer)'}". Waiting for the others...
                    </div>
                  ) : (
                    <>
                      {finalOptions.length ? (
                        <FinalChoices
                          options={finalOptions}
                          value={finalPlayer2Input}
                          onPick={(opt) => {
                            setFinalPlayer2Input(opt);
                            sendAnswer(opt);
                          }}
                        />
                      ) : (
                      <input
                        type="text"
                        placeholder="Type final answer..."
                        value={finalPlayer2Input}
                        onChange={(e) => {
                          setFinalPlayer2Input(e.target.value);
                          sendAnswer(e.target.value);
                        }}
                        className="w-full bg-slate-950 border-2 border-amber-400 px-3 py-2 rounded-lg text-white font-bold text-center"
                      />
                      )}
                      <VoiceAnswerButton
                        label="SAY FINAL ANSWER"
                        onHeard={(heard) =>
                          finalAnswerByVoice(heard, (answer) => {
                            setFinalPlayer2Input(answer);
                            sendAnswer(answer);
                          })
                        }
                      />
                      <button
                        onClick={() => sendAnswer(finalPlayer2Input, true)}
                        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-black rounded-xl text-sm shadow-lg active:scale-95">
                        LOCK IN ANSWER
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            );
          })()}

          {/* 5. Post Game Standings */}
          {(gameState.status === 'VICTORY' || gameState.status === 'GAME_OVER') && (
            <div className="w-full bg-slate-900 border-2 border-amber-400 rounded-2xl p-5 text-center flex flex-col items-center gap-3">
              <Trophy className="w-10 h-10 text-amber-400 animate-bounce" />
              <h2 className="text-lg font-black text-amber-400 uppercase">MATCH COMPLETE</h2>
              <div className="w-full bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                {activeContestantsList
                  .map((id) => contestants[id])
                  .sort((a, b) => b.score - a.score)
                  .map((c, idx) => (
                    <div key={c.id} className="flex justify-between text-xs font-bold">
                      <span className="text-slate-300">#{idx + 1} {c.name}</span>
                      <span className={c.score >= 0 ? 'text-amber-400' : 'text-rose-400'}>${c.score.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
              <button
                onClick={shareRecap}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-black rounded-xl text-sm shadow-lg active:scale-95 flex items-center justify-center gap-1.5">
                <Share2 className="w-4 h-4" />
                <span>SHARE RECAP CARD</span>
              </button>
              <div className="text-xs text-slate-400">Waiting for Host to start rematch...</div>
            </div>
          )}
        </main>

        {/* Client Bottom Footer Standings */}
        <footer className="relative z-10 w-full bg-slate-900/90 border border-slate-800 rounded-xl p-2 flex items-center justify-around text-center">
          {(['player', 'player2', 'analyst'] as ContestantId[]).map((id, idx) => (
            <React.Fragment key={id}>
              {idx > 0 && <div className="w-px h-6 bg-slate-800" />}
              <div>
                <div className={`text-[9px] uppercase ${id === mySeat ? 'text-emerald-400 font-black' : 'text-slate-400'}`}>
                  {id === mySeat ? `You (${seatLabel(id)})` : contestants[id].name}
                </div>
                <div className={`text-xs font-black ${id === mySeat ? 'text-emerald-300' : 'text-white'}`}>
                  ${contestants[id].score.toLocaleString()}
                </div>
              </div>
            </React.Fragment>
          ))}
        </footer>
      </div>
    );
}
