// The main stage: the clue board, or the Final Showdown wager, clue and results.
import {Zap, CheckCircle2, Clock, Flame, Star, Edit3} from 'lucide-react';
import TimeLeft from '../utils/TimeLeft';
import {maxFinalWager} from '../game/rules';
import VoiceAnswerButton from '../utils/VoiceAnswerButton';
import {FinalChoices} from '../ui/shared';
import {useGame} from '../game/GameContext';

export default function Stage() {
  const {
    isClientConnected,
    playerName,
    isTwoPlayerMode,
    currentRound,
    round1Board,
    round2Board,
    answeredClueIds,
    boardColsClass,
    boardRowIndexes,
    activeSelector,
    aiPickingTile,
    aiThinkingStatus,
    contestants,
    activeClue,
    finalClue,
    playerFinalWager,
    setPlayerFinalWager,
    player2FinalWager,
    setPlayer2FinalWager,
    finalShowdownPhase,
    finalTimer,
    finalPlayerInput,
    setFinalPlayerInput,
    finalPlayer2Input,
    setFinalPlayer2Input,
    finalOptions,
    player3Human,
    onlineRemoteSeats,
    finalLocks,
    setFinalLocks,
    openTagEditorModal,
    finalAnswerByVoice,
    selectClue,
    confirmFinalWagers,
    finalizeFinalShowdown,
    allRemoteWagersLocked,
    activeContestantsList,
  } = useGame();
  // Players at $0 or below sit out the Final Showdown.
  const sitsOut = (id: 'player' | 'player2' | 'analyst' | 'coach') => Boolean(contestants[id].sitsOutFinal);
  const nobodyPlays = activeContestantsList.every(sitsOut);
  const aiSitters = activeContestantsList.filter((id) => sitsOut(id) && (id === 'coach' || (id === 'analyst' && !player3Human)));
  return (
    <>
      <main className="relative z-10 flex-1 w-full min-h-0 flex flex-col justify-between overflow-hidden p-2 sm:p-4">
        {/* UPPER ARENA: Trivia Board or Final Showdown View */}
        <div className="flex-1 w-full min-h-0 flex flex-col items-center justify-center">
          {currentRound !== 'FINAL_SHOWDOWN' ? (
            /* TRIVIA BOARD (6 Categories x 5 Clues, or 5 x 3 in a short game) */
            <div className="w-full max-w-6xl h-full flex flex-col justify-center gap-1 sm:gap-2">
              {/* Turn Banner / AI Picking Status */}
              <div className="w-full flex items-center justify-between px-2 py-0.5 bg-slate-900/80 border border-blue-800/60 rounded-md text-[10px] sm:text-xs font-bold">
                <div className="flex items-center gap-1.5 text-amber-300">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>
                    Board Control:{' '}
                    <strong className="text-white uppercase">{contestants[activeSelector]?.name}</strong>
                  </span>
                </div>

                <div className="text-slate-300">
                  {aiThinkingStatus ? (
                    <span className="text-amber-400 animate-pulse flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {aiThinkingStatus}
                    </span>
                  ) : activeSelector === 'player' ? (
                    <span className="text-emerald-400 font-black">Your turn! Select any clue tile.</span>
                  ) : (isTwoPlayerMode || isClientConnected) && activeSelector === 'player2' ? (
                    <span className="text-emerald-400 font-black">
                      {isClientConnected ? 'Player 2 is selecting on their device...' : 'Player 2 turn! Select any clue tile.'}
                    </span>
                  ) : player3Human && activeSelector === 'analyst' ? (
                    <span className="text-emerald-400 font-black">Player 3 is selecting on their device...</span>
                  ) : (
                    <span className="text-slate-400">Waiting for opponent pick...</span>
                  )}
                </div>
              </div>

              {/* Category Headers */}
              <div className={`grid ${boardColsClass} gap-1 sm:gap-1.5 text-center`}>
                {(currentRound === 'ROUND_1' ? round1Board : round2Board).map((cat) => (
                  <div
                    key={cat.title}
                    className="bg-gradient-to-b from-blue-900 to-slate-900 border border-blue-600 rounded-md p-1 sm:p-1.5 shadow-md flex items-center justify-center min-h-[52px] sm:min-h-[44px]">
                    <span className="text-[8px] sm:text-[11px] md:text-xs font-black tracking-tight text-amber-300 line-clamp-4 sm:line-clamp-2 uppercase leading-tight break-words hyphens-auto" title={cat.title}>
                      {cat.title}
                    </span>
                  </div>
                ))}
              </div>

              {/* Clue Dollar Tiles Grid (one column per category, one row per clue value) */}
              <div className={`grid ${boardColsClass} gap-1 sm:gap-1.5 flex-1 min-h-0`}>
                {boardRowIndexes.map((rowIdx) =>
                  (currentRound === 'ROUND_1' ? round1Board : round2Board).map((cat, catIdx) => {
                    const clue = cat.clues[rowIdx];
                    if (!clue) return null;
                    const isAnswered = answeredClueIds.has(clue.id);
                    const isAIPickingThis = aiPickingTile?.catIdx === catIdx && aiPickingTile?.clueIdx === rowIdx;
                    const canHumanPick =
                      (activeSelector === 'player' || (isTwoPlayerMode && !isClientConnected && activeSelector === 'player2')) &&
                      !isAnswered &&
                      !activeClue;

                    return (
                      <button
                        key={clue.id}
                        disabled={isAnswered || Boolean(activeClue) || !canHumanPick}
                        onClick={() => canHumanPick && selectClue(catIdx, rowIdx, activeSelector)}
                        className={`w-full h-full min-h-[40px] rounded-lg border flex flex-col items-center justify-center transition-all ${
                          isAnswered
                            ? 'bg-slate-950/60 border-slate-800/80 text-slate-700 cursor-not-allowed'
                            : isAIPickingThis
                            ? 'bg-amber-400 border-white text-slate-950 font-black scale-105 shadow-2xl animate-pulse ring-4 ring-amber-400'
                            : canHumanPick
                            ? 'bg-gradient-to-b from-blue-950 via-blue-900 to-slate-950 border-amber-500/60 hover:border-amber-400 hover:shadow-lg hover:shadow-amber-500/20 text-amber-400 hover:scale-[1.02] active:scale-95 cursor-pointer'
                            : 'bg-gradient-to-b from-slate-900 to-blue-950 border-blue-900 text-blue-300/80 cursor-wait'
                        }`}>
                        {!isAnswered ? (
                          <div className="flex items-center gap-0.5 text-xs sm:text-base md:text-xl font-black drop-shadow-md">
                            <span className="text-amber-300">$</span>
                            <span>{clue.value}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-700 font-bold">—</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* FINAL SHOWDOWN ARENA SCREEN */
            <div className="w-full max-w-2xl bg-slate-900/95 border-2 border-amber-500 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col items-center text-center overflow-y-auto max-h-[85vh]">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center mb-2">
                <Flame className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400 animate-pulse" />
              </div>

              <h2 className="text-lg sm:text-2xl font-black text-amber-400 uppercase tracking-widest mb-1">
                THE FINAL SHOWDOWN
              </h2>
              <div className="text-xs sm:text-sm text-blue-200 font-bold mb-3">
                CATEGORY: <span className="text-white bg-blue-900/80 px-2 py-0.5 rounded">{finalClue?.category}</span>
              </div>

              {finalShowdownPhase === 'WAGER' && (
                <div className="w-full flex flex-col items-center gap-3">
                  <p className="text-xs sm:text-sm text-slate-300 max-w-md">
                    {nobodyPlays
                      ? 'Nobody has money in the bank, so nobody can play the Final Showdown. The scores stand.'
                      : 'Lock in your cash wager based on your confidence in this championship category. Players at $0 or below sit this one out.'}
                  </p>

                  <div className="w-full max-w-sm flex flex-col gap-3">
                    {/* Player 1 Wager Input */}
                    {sitsOut('player') ? (
                      <SitOutRow name={contestants.player.name} score={contestants.player.score} />
                    ) : (
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-amber-500/50">
                      <div className="text-xs font-bold text-amber-300 mb-1">
                        {contestants.player.name} (Bank: ${contestants.player.score.toLocaleString()}):
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-amber-400">$</span>
                        <input
                          type="number"
                          min={0}
                          max={maxFinalWager(contestants.player.score)}
                          step={100}
                          value={playerFinalWager}
                          onChange={(e) =>
                            setPlayerFinalWager(
                              Math.max(
                                0,
                                Math.min(maxFinalWager(contestants.player.score), parseInt(e.target.value) || 0)
                              )
                            )
                          }
                          className="flex-1 bg-slate-900 border border-amber-400 text-amber-400 text-base font-black px-3 py-1.5 rounded-lg text-center"
                        />
                        <button
                          onClick={() => setPlayerFinalWager(maxFinalWager(contestants.player.score))}
                          className="text-[10px] px-2 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded font-bold">
                          MAX
                        </button>
                      </div>
                    </div>
                    )}

                    {/* Friends on phones set their own wagers; the host only sees whether they've locked */}
                    {onlineRemoteSeats.map((seat) => sitsOut(seat) ? (
                      <SitOutRow key={seat} name={contestants[seat].name} score={contestants[seat].score} />
                    ) : (
                      <div key={seat} className="bg-slate-950 p-2.5 rounded-xl border border-amber-500/50 flex items-center justify-between gap-2 text-xs font-bold">
                        <span className="text-amber-300">{contestants[seat].name}</span>
                        <span className={finalLocks.wager[seat] ? 'text-emerald-400' : 'text-slate-400 animate-pulse'}>
                          {finalLocks.wager[seat] ? '✓ Wager locked' : 'Choosing on their phone...'}
                        </span>
                      </div>
                    ))}

                    {/* Player 2 Wager Input in pass & play */}
                    {isTwoPlayerMode && !isClientConnected && sitsOut('player2') && (
                      <SitOutRow name={contestants.player2.name} score={contestants.player2.score} />
                    )}
                    {isTwoPlayerMode && !isClientConnected && !sitsOut('player2') && (
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-amber-500/50">
                        <div className="text-xs font-bold text-amber-300 mb-1">
                          {contestants.player2.name} (Bank: ${contestants.player2.score.toLocaleString()}):
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-amber-400">$</span>
                          <input
                            type="number"
                            min={0}
                            max={maxFinalWager(contestants.player2.score)}
                            step={100}
                            value={player2FinalWager}
                            onChange={(e) =>
                              setPlayer2FinalWager(
                                Math.max(
                                  0,
                                  Math.min(maxFinalWager(contestants.player2.score), parseInt(e.target.value) || 0)
                                )
                              )
                            }
                            className="flex-1 bg-slate-900 border border-amber-400 text-amber-400 text-base font-black px-3 py-1.5 rounded-lg text-center"
                          />
                          <button
                            onClick={() => setPlayer2FinalWager(maxFinalWager(contestants.player2.score))}
                            className="text-[10px] px-2 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded font-bold">
                            MAX
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {aiSitters.map((id) => (
                    <div key={id} className="text-[11px] text-slate-400">{contestants[id].name} sits out (no money in the bank).</div>
                  ))}

                  {nobodyPlays ? (
                  <button
                    onClick={finalizeFinalShowdown}
                    className="min-w-[48px] min-h-[48px] mt-2 px-6 sm:px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm sm:text-base shadow-lg transition-transform active:scale-95 flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    SEE FINAL RESULTS
                  </button>
                  ) : (
                  <button
                    onClick={confirmFinalWagers}
                    disabled={!allRemoteWagersLocked}
                    className="min-w-[48px] min-h-[48px] mt-2 px-6 sm:px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm sm:text-base shadow-lg transition-transform active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait">
                    <Zap className="w-5 h-5" />
                    {allRemoteWagersLocked ? 'LOCK IN WAGER & REVEAL CLUE' : 'WAITING FOR WAGERS...'}
                  </button>
                  )}
                </div>
              )}

              {finalShowdownPhase === 'CLUE' && (
                <div className="w-full flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-rose-400 text-base sm:text-lg font-black bg-rose-950/60 px-4 py-1.5 rounded-full border border-rose-700 animate-pulse">
                    <Clock className="w-5 h-5" />
                    <span><TimeLeft c={finalTimer} format="clock" /></span>
                  </div>

                  <div className="w-full bg-slate-950/90 border border-blue-800 rounded-xl p-3 sm:p-4 text-xs sm:text-base text-slate-100 font-medium leading-relaxed">
                    {finalClue?.clue}
                  </div>

                  <div className="w-full max-w-md flex flex-col gap-2.5">
                    {sitsOut('player') ? (
                      <div className="text-xs font-bold text-slate-400">
                        {contestants.player.name} sits out the Final (no money in the bank).
                      </div>
                    ) : (
                    <>
                    {finalOptions.length ? (
                      <>
                        {(isTwoPlayerMode || isClientConnected) && (
                          <div className="text-xs font-bold text-amber-300">{playerName} (P1), pick your answer:</div>
                        )}
                        <FinalChoices
                          options={finalOptions}
                          value={finalPlayerInput}
                          onPick={setFinalPlayerInput}
                          disabled={Boolean(finalLocks.answer.player)}
                        />
                      </>
                    ) : (
                    <input
                      type="text"
                      placeholder={(isTwoPlayerMode || isClientConnected) ? `${playerName} (P1): Type final answer...` : 'Type your final answer here...'}
                      value={finalPlayerInput}
                      onChange={(e) => setFinalPlayerInput(e.target.value)}
                      disabled={Boolean(finalLocks.answer.player)}
                      autoFocus
                      className="w-full bg-slate-950 border-2 border-amber-500 text-white text-sm sm:text-base font-bold px-4 py-2 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    )}
                    <VoiceAnswerButton label="SAY FINAL ANSWER" onHeard={(heard) => finalAnswerByVoice(heard, setFinalPlayerInput)} />
                    </>
                    )}

                    {isTwoPlayerMode && !isClientConnected && sitsOut('player2') && (
                      <div className="text-xs font-bold text-slate-400">{contestants.player2.name} sits out the Final.</div>
                    )}
                    {isTwoPlayerMode && !isClientConnected && !sitsOut('player2') && (finalOptions.length ? (
                      <>
                        <div className="text-xs font-bold text-emerald-300">Player 2, pick your answer:</div>
                        <FinalChoices options={finalOptions} value={finalPlayer2Input} onPick={setFinalPlayer2Input} />
                      </>
                    ) : (
                      <input
                        type="text"
                        placeholder="Player 2: Type final answer..."
                        value={finalPlayer2Input}
                        onChange={(e) => setFinalPlayer2Input(e.target.value)}
                        className="w-full bg-slate-950 border-2 border-amber-500 text-white text-sm sm:text-base font-bold px-4 py-2 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    ))}

                    {/* With friends on phones, Player 1 locks their own answer instead of ending the round for everyone */}
                    {onlineRemoteSeats.length > 0 ? (
                      <>
                        {!sitsOut('player') && (
                        <button
                          onClick={() => setFinalLocks((l) => ({...l, answer: {...l.answer, player: true}}))}
                          disabled={Boolean(finalLocks.answer.player)}
                          className="min-w-[48px] min-h-[48px] w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-lg shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base disabled:opacity-60">
                          <CheckCircle2 className="w-5 h-5" />
                          {finalLocks.answer.player ? 'ANSWER LOCKED' : 'LOCK IN MY ANSWER'}
                        </button>
                        )}
                        <div className="text-[11px] text-slate-300 flex flex-wrap justify-center gap-x-3">
                          {onlineRemoteSeats.map((seat) => (
                            <span key={seat} className={finalLocks.answer[seat] ? 'text-emerald-400' : 'text-slate-400'}>
                              {contestants[seat].name}: {sitsOut(seat) ? 'sitting out' : finalLocks.answer[seat] ? '✓ locked' : 'thinking...'}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <button
                        onClick={finalizeFinalShowdown}
                        className="min-w-[48px] min-h-[48px] w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-lg shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base">
                        <CheckCircle2 className="w-5 h-5" />
                        {sitsOut('player') && !(isTwoPlayerMode && !sitsOut('player2')) ? 'SHOW RESULTS' : 'SUBMIT FINAL ANSWER'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {finalShowdownPhase === 'RESULTS' && (
                <div className="w-full flex flex-col items-center gap-3">
                  <div className="text-xs sm:text-sm text-slate-300 font-medium mb-1">
                    Correct Answer was: <strong className="text-amber-400">{finalClue?.correctAnswer}</strong>
                  </div>

                  <div className="w-full grid grid-cols-3 gap-2">
                    {activeContestantsList.map((id) => {
                      const c = contestants[id];
                      if (c.sitsOutFinal) {
                        return (
                          <div key={id} className="p-2 sm:p-3 rounded-lg border bg-slate-950/80 border-slate-700 text-slate-400">
                            <div className="text-[9px] sm:text-[10px] font-bold uppercase">{c.name}</div>
                            <div className="text-[11px] sm:text-xs font-semibold my-1">Sat out</div>
                            <div className="text-xs font-black">$0</div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={id}
                          className={`p-2 sm:p-3 rounded-lg border ${
                            c.finalCorrect
                              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                              : 'bg-rose-950/80 border-rose-500 text-rose-200'
                          }`}>
                          <div className="text-[9px] sm:text-[10px] font-bold uppercase">{c.name}</div>
                          <div className="text-[11px] sm:text-xs font-semibold my-1 truncate">"{c.finalAnswer}"</div>
                          <div className="text-xs font-black">
                            {c.finalCorrect ? `+$${c.wager.toLocaleString()}` : `-$${c.wager.toLocaleString()}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* LOWER ARENA: Sleek Modern TV Game-Show Stage Podiums (Clean Nameplates + Digital LED Scores + Buzz Lightbars) */}
        <div className="relative z-10 w-full shrink-0 pt-1 pb-1 flex items-end justify-center gap-2 sm:gap-4 md:gap-8 max-w-4xl mx-auto">
          {activeContestantsList.map((cid) => {
            const c = contestants[cid];
            const isPlayer = cid === 'player';
            const isSelector = activeSelector === cid && !activeClue && currentRound !== 'FINAL_SHOWDOWN';
            const isBuzzed = activeClue?.buzzedContestantId === cid;
            const isLocked = Boolean(activeClue?.buzzerLockout[cid]);
            const isCorrect = c.reaction === 'correct';
            const isWrong = c.reaction === 'wrong';

            return (
              <div
                key={cid}
                onClick={() => {
                  if (isPlayer) openTagEditorModal();
                }}
                className={`flex-1 max-w-[140px] sm:max-w-[180px] md:max-w-[210px] flex flex-col rounded-t-xl overflow-hidden border-2 transition-all duration-200 shadow-xl ${
                  isPlayer ? 'cursor-pointer group hover:scale-[1.02] active:scale-98' : ''
                } ${
                  isBuzzed
                    ? 'border-amber-400 ring-4 ring-amber-400/50 bg-gradient-to-b from-amber-500/30 via-slate-900 to-slate-950 shadow-amber-500/30'
                    : isCorrect
                    ? 'border-emerald-400 ring-2 ring-emerald-400/40 bg-gradient-to-b from-emerald-950/40 via-slate-900 to-slate-950'
                    : isWrong
                    ? 'border-rose-500 ring-2 ring-rose-500/40 bg-gradient-to-b from-rose-950/40 via-slate-900 to-slate-950'
                    : isSelector
                    ? 'border-amber-500/80 bg-gradient-to-b from-amber-950/30 via-slate-900 to-slate-950 shadow-amber-500/10'
                    : 'border-slate-800 bg-gradient-to-b from-slate-900/95 to-slate-950'
                }`}>
                {/* 1. Buzzer Indicator Lightbar Strip */}
                <div
                  className={`w-full h-1.5 sm:h-2 transition-colors flex items-center justify-center ${
                    isBuzzed
                      ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,1)] animate-pulse'
                      : isCorrect
                      ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                      : isWrong
                      ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.9)]'
                      : isLocked
                      ? 'bg-slate-800'
                      : isSelector
                      ? 'bg-amber-400/80'
                      : cid === 'player' || cid === 'player2'
                      ? 'bg-amber-500/40'
                      : 'bg-blue-600/40'
                  }`}
                />

                {/* 2. Podium Nameplate Section */}
                <div
                  className={`px-2 py-1 flex items-center justify-between gap-1 border-b ${
                    isBuzzed
                      ? 'bg-amber-400/20 border-amber-400/50'
                      : 'bg-slate-950/80 border-slate-800'
                  }`}>
                  <div className="flex items-center gap-1 min-w-0">
                    {isSelector && <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-400 text-amber-400 shrink-0" />}
                    <span
                      className={`text-[9px] sm:text-[11px] font-black uppercase tracking-wider truncate ${
                        isBuzzed
                          ? 'text-amber-300'
                          : cid === 'player'
                          ? 'text-amber-300 group-hover:text-amber-200'
                          : cid === 'player2'
                          ? 'text-emerald-300'
                          : cid === 'coach'
                          ? 'text-blue-300'
                          : 'text-slate-300'
                      }`}>
                      {c.name}
                    </span>
                  </div>

                  {isPlayer && (
                    <span className="text-[8px] sm:text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5 shrink-0">
                      <Edit3 className="w-2 h-2 text-amber-400" />
                      <span className="hidden sm:inline">EDIT</span>
                    </span>
                  )}
                </div>

                {/* 3. Digital LED Podium Score Counter Screen */}
                <div className="px-2 py-1 sm:py-1.5 bg-slate-950/90 flex flex-col items-center justify-center">
                  <div
                    className={`font-mono font-black text-xs sm:text-base md:text-lg tracking-tight ${
                      isBuzzed
                        ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                        : c.score >= 0
                        ? 'text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                        : 'text-rose-500 drop-shadow-[0_0_6px_rgba(244,63,94,0.5)]'
                    }`}>
                    ${c.score.toLocaleString()}
                  </div>

                  {/* Active Status Pill */}
                  <div className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wide truncate">
                    {isBuzzed
                      ? '⚡ BUZZED IN'
                      : isCorrect
                      ? '✓ CORRECT'
                      : isWrong
                      ? '✗ INCORRECT'
                      : isLocked
                      ? 'LOCKOUT'
                      : isSelector
                      ? 'BOARD CONTROL'
                      : `${c.correctCount} Correct`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}

// A player with no money in the bank, who sits out the Final Showdown.
function SitOutRow({name, score}: {name: string; score: number}) {
  return (
    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-700 flex items-center justify-between gap-2 text-xs font-bold">
      <span className="text-slate-300">{name}</span>
      <span className="text-slate-400">Sits out ({score < 0 ? '-' : ''}${Math.abs(score).toLocaleString()})</span>
    </div>
  );
}
