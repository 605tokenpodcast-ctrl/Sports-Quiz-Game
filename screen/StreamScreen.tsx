// The stream screen: a big-screen view of the game for a laptop or TV on the stream or recording.
// It only watches. The host device runs the game and everyone plays from their phones.
import {useState} from 'react';
import {Trophy, Zap, Clock, Flame, Star, Lock, Volume2, VolumeX, Music, Megaphone, Tv, Share2} from 'lucide-react';
import BackgroundMusic from '../utils/BackgroundMusic';
import TimeLeft from '../utils/TimeLeft';
import {gameAudio} from '../utils/helper';
import {unlockSpeech, isSpeechSupported} from '../utils/speech';
import {QRCodeView} from '../ui/shared';
import type {ContestantId} from '../game/types';
import {useGame} from '../game/GameContext';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString()}`;

export default function StreamScreen() {
  const game = useGame();
  const {
    roomCode,
    p2pStatus,
    p2pDetail,
    gameState,
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
    activeContestantsList,
    shareableJoinUrl,
    sfxMuted,
    setSfxMuted,
    musicMuted,
    setMusicMuted,
    activeBgmUrl,
    readAloud,
    toastMessage,
  } = game;
  // Browsers keep a page silent until someone taps it, so the screen starts with one tap.
  const [started, setStarted] = useState(false);
  const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
  const playing = gameState.status === 'PLAYING';
  const over = gameState.status === 'VICTORY' || gameState.status === 'GAME_OVER';

  return (
    <div className="fixed inset-0 overflow-hidden flex flex-col bg-slate-950 text-white font-sans select-none">
      <BackgroundMusic url={activeBgmUrl} isPlaying={started && playing && !musicMuted} isMuted={musicMuted} />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-blue-950 via-slate-950 to-slate-950 pointer-events-none" />

      {!started && (
        <button
          onClick={() => {
            gameAudio.resume();
            unlockSpeech();
            setStarted(true);
          }}
          className="absolute inset-0 z-[90] bg-slate-950/95 flex flex-col items-center justify-center gap-4 text-center p-6">
          <Tv className="w-20 h-20 text-amber-400" />
          <div className="text-4xl lg:text-6xl font-black text-amber-400 uppercase tracking-wider">Stream Screen</div>
          <div className="text-lg lg:text-2xl text-slate-300 max-w-2xl">
            Click anywhere to start. That turns on the sound for buzzers{isSpeechSupported ? ' and read-aloud clues' : ''}.
          </div>
        </button>
      )}

      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[80] px-6 py-3 bg-amber-500 text-slate-950 font-black rounded-full shadow-2xl border-2 border-white text-xl">
          {toastMessage}
        </div>
      )}

      {/* Header: title, round, sound controls and the join code */}
      <header className="relative z-10 shrink-0 flex items-center justify-between gap-4 px-6 py-3 bg-slate-900/90 border-b-2 border-amber-500/60">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-slate-950" />
          </div>
          <div>
            <div className="text-2xl lg:text-3xl font-black text-amber-400 tracking-wider uppercase">Sports Arena Showdown</div>
            <div className="text-sm lg:text-base text-blue-200 font-bold uppercase">
              {!playing && !over ? 'NFL Trivia' : currentRound === 'ROUND_1' ? 'Round 1' : currentRound === 'CHAMPIONSHIP' ? 'Round 2' : 'Final Showdown'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSfxMuted(gameAudio.toggleMute())}
            className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            title={sfxMuted ? 'Turn sounds on' : 'Turn sounds off'}>
            {sfxMuted ? <VolumeX className="w-6 h-6 text-rose-400" /> : <Volume2 className="w-6 h-6 text-emerald-400" />}
          </button>
          <button
            onClick={() => setMusicMuted((m) => !m)}
            className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            title={musicMuted ? 'Turn music on' : 'Turn music off'}>
            <Music className={`w-6 h-6 ${musicMuted ? 'text-rose-400' : 'text-emerald-400'}`} />
          </button>
          {readAloud && (
            <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-700 rounded-lg px-2.5 py-2">
              <Megaphone className="w-5 h-5" /> Reading clues aloud
            </span>
          )}
          {(playing || over) && (
            <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-700 rounded-xl pl-3 pr-1 py-1">
              <div className="text-right">
                <div className="text-xs text-slate-400 font-bold uppercase">Join</div>
                <div className="text-lg font-black font-mono text-white">{roomCode}</div>
              </div>
              <QRCodeView value={shareableJoinUrl} size={64} />
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 flex items-center justify-center p-4 lg:p-6">
        {!playing && !over && <Lobby />}
        {playing && currentRound !== 'FINAL_SHOWDOWN' && (
          <div className="w-full h-full max-w-[1600px] flex flex-col gap-2">
            <div className="flex items-center justify-between text-lg lg:text-xl font-bold px-1">
              <span className="flex items-center gap-2 text-amber-300">
                <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
                Board control: <span className="text-white uppercase">{contestants[activeSelector]?.name}</span>
              </span>
              {aiThinkingStatus && <span className="text-amber-400 animate-pulse">{aiThinkingStatus}</span>}
            </div>
            <div className={`grid ${boardColsClass} gap-2`}>
              {board.map((cat) => (
                <div
                  key={cat.title}
                  className="min-h-[90px] bg-gradient-to-b from-blue-800 to-blue-950 border-2 border-blue-500 rounded-lg p-2 flex items-center justify-center text-center">
                  <span className="text-[clamp(0.9rem,1.5vw,1.8rem)] font-black text-amber-300 uppercase leading-tight">{cat.title}</span>
                </div>
              ))}
            </div>
            <div className={`grid ${boardColsClass} gap-2 flex-1 min-h-0`}>
              {boardRowIndexes.map((rowIdx) =>
                board.map((cat, catIdx) => {
                  const clue = cat.clues[rowIdx];
                  if (!clue) return null;
                  const answered = answeredClueIds.has(clue.id);
                  const picking = aiPickingTile?.catIdx === catIdx && aiPickingTile?.clueIdx === rowIdx;
                  return (
                    <div
                      key={clue.id}
                      className={`rounded-lg border-2 flex items-center justify-center font-black text-[clamp(1.4rem,3.2vw,4rem)] ${
                        answered
                          ? 'bg-slate-950/60 border-slate-800 text-transparent'
                          : picking
                          ? 'bg-amber-400 border-white text-slate-950 animate-pulse'
                          : 'bg-gradient-to-b from-blue-900 to-blue-950 border-blue-700 text-amber-400'
                      }`}>
                      ${clue.value}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
        {playing && currentRound === 'FINAL_SHOWDOWN' && <FinalPanel />}
        {over && <Results />}
        {playing && activeClue && <ClueOverlay />}
      </main>

      {/* Podiums (the results list the scores themselves) */}
      {!over && (
      <footer className="relative z-10 shrink-0 flex items-end justify-center gap-4 lg:gap-8 px-6 pb-4">
        {activeContestantsList.map((id) => (
          <Podium key={id} id={id} />
        ))}
      </footer>
      )}

      {(p2pStatus === 'error' || (p2pStatus !== 'connected' && !playing && !over)) && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 text-center text-base text-slate-300 bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2">
          {p2pDetail || 'Connecting to the host...'}
          {p2pStatus === 'error' && (
            <button onClick={() => window.location.reload()} className="ml-3 px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-black">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Lobby() {
  const {shareableJoinUrl, roomCode, contestants, activeContestantsList, p2pStatus} = useGame();
  return (
    <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
      <div className="flex flex-col items-center gap-3">
        <QRCodeView value={shareableJoinUrl} size={320} />
        <div className="text-xl text-slate-300">
          Room code <span className="font-mono font-black text-white text-2xl">{roomCode}</span>
        </div>
      </div>
      <div className="max-w-xl text-center lg:text-left flex flex-col gap-4">
        <div className="text-5xl lg:text-6xl font-black text-amber-400 uppercase leading-tight">Scan to play</div>
        <div className="text-xl lg:text-2xl text-slate-300">
          Point your phone camera at the code to join. Up to 3 players, each on their own phone.
        </div>
        {p2pStatus === 'connected' && (
          <div className="flex flex-col gap-2">
            {activeContestantsList.map((id) => (
              <div key={id} className="text-2xl font-black text-white bg-slate-900/80 border border-blue-800 rounded-xl px-4 py-2">
                {contestants[id].name}
              </div>
            ))}
          </div>
        )}
        <div className="text-lg text-emerald-300 font-bold animate-pulse">Waiting for the host to start the game...</div>
      </div>
    </div>
  );
}

function ClueOverlay() {
  const {activeClue, contestants} = useGame();
  if (!activeClue) return null;
  const {clue, phase} = activeClue;
  const hidden = activeClue.isBonusWager && !activeClue.bonusWagerLocked;
  const picker = contestants[activeClue.bonusSelectingPlayerId];
  const buzzed = activeClue.buzzedContestantId ? contestants[activeClue.buzzedContestantId] : null;
  const revealed = phase === 'REVEALED';

  return (
    <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-[1400px] max-h-full overflow-y-auto bg-gradient-to-b from-blue-900 to-blue-950 border-4 border-amber-400 rounded-3xl p-6 lg:p-10 flex flex-col gap-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 text-2xl lg:text-3xl font-black uppercase">
          <span className="text-amber-300">{clue.category}</span>
          <span className="text-amber-400">
            {activeClue.isBonusWager ? `Daily Double · ${money(activeClue.bonusWagerInput)}` : money(clue.value)}
          </span>
        </div>

        {hidden ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <Lock className="w-16 h-16 text-amber-400 animate-pulse" />
            <div className="text-5xl lg:text-7xl font-black text-amber-400 uppercase">Daily Double!</div>
            <div className="text-2xl lg:text-3xl text-slate-200">{picker?.name} is placing a wager...</div>
          </div>
        ) : (
          <div className="text-[clamp(1.8rem,3.4vw,4.2rem)] font-bold leading-snug text-center text-white">{clue.clue}</div>
        )}

        {!hidden && activeClue.options.length > 0 && (
          <div className={`grid gap-3 ${activeClue.options.length > 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>
            {activeClue.options.map((opt, i) => {
              const right = revealed && opt === clue.correctAnswer;
              const picked = opt === activeClue.selectedOption;
              return (
                <div
                  key={opt}
                  className={`rounded-xl border-2 px-4 py-3 text-xl lg:text-2xl font-bold flex items-center gap-3 ${
                    right
                      ? 'bg-emerald-500 border-white text-slate-950'
                      : picked
                      ? 'bg-rose-600 border-white text-white'
                      : 'bg-blue-950/80 border-blue-600 text-slate-100'
                  }`}>
                  <span className="w-9 h-9 rounded-lg border-2 border-amber-400 flex items-center justify-center font-black shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-center gap-4 text-2xl lg:text-4xl font-black text-center">
          {revealed ? (
            <span className="text-emerald-300">Answer: {clue.correctAnswer}</span>
          ) : phase === 'READING' ? (
            <span className="text-slate-300 flex items-center gap-3">
              <Clock className="w-9 h-9" /> Buzzers open in <TimeLeft c={activeClue} />
            </span>
          ) : phase === 'BUZZER_OPEN' ? (
            <span className="text-amber-300 flex items-center gap-3 animate-pulse">
              <Zap className="w-10 h-10 fill-amber-300" /> BUZZ IN NOW! <TimeLeft c={activeClue} format="seconds" />
            </span>
          ) : buzzed && !hidden ? (
            <span className="text-amber-300">
              {buzzed.name} {activeClue.isBonusWager ? 'is answering' : 'buzzed in'}! <TimeLeft c={activeClue} format="seconds" />
            </span>
          ) : null}
        </div>
        {revealed && <div className="text-xl lg:text-2xl text-center text-slate-300">{activeClue.feedbackText}</div>}
      </div>
    </div>
  );
}

function FinalPanel() {
  const {finalClue, finalShowdownPhase, finalTimer, finalOptions, finalLocks, contestants, activeContestantsList, player3Human} = useGame();
  return (
    <div className="w-full max-w-[1400px] max-h-full overflow-y-auto bg-slate-900/95 border-4 border-amber-500 rounded-3xl p-6 lg:p-10 flex flex-col items-center gap-6 text-center">
      <div className="flex items-center gap-3 text-4xl lg:text-6xl font-black text-amber-400 uppercase tracking-widest">
        <Flame className="w-12 h-12 animate-pulse" /> The Final Showdown
      </div>
      <div className="text-2xl lg:text-3xl font-bold text-blue-200">
        Category: <span className="text-white">{finalClue?.category}</span>
      </div>

      {finalShowdownPhase === 'CLUE' && (
        <>
          <div className="text-[clamp(1.8rem,3.2vw,4rem)] font-bold leading-snug text-white">{finalClue?.clue}</div>
          {finalOptions.length > 0 && (
            <div className={`w-full grid gap-3 ${finalOptions.length > 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>
              {finalOptions.map((opt, i) => (
                <div key={opt} className="rounded-xl border-2 border-blue-600 bg-blue-950/80 px-4 py-3 text-xl lg:text-2xl font-bold text-left">
                  {String.fromCharCode(65 + i)}. {opt}
                </div>
              ))}
            </div>
          )}
          <div className="text-4xl font-black text-rose-400 flex items-center gap-3">
            <Clock className="w-10 h-10" /> <TimeLeft c={finalTimer} format="clock" />
          </div>
        </>
      )}

      {finalShowdownPhase !== 'RESULTS' && (
        <div className="flex flex-wrap justify-center gap-4">
          {activeContestantsList.map((id) => {
            const c = contestants[id];
            const locked = finalShowdownPhase === 'WAGER' ? finalLocks.wager[id] : finalLocks.answer[id];
            const ai = id === 'coach' || (id === 'analyst' && !player3Human);
            return (
              <div key={id} className="text-xl lg:text-2xl font-bold bg-slate-950/80 border border-slate-700 rounded-xl px-5 py-3">
                <span className="text-white">{c.name}</span>{' '}
                <span className={c.sitsOutFinal ? 'text-slate-400' : locked || ai ? 'text-emerald-400' : 'text-amber-300 animate-pulse'}>
                  {c.sitsOutFinal
                    ? 'sits out'
                    : ai
                    ? 'ready'
                    : locked
                    ? finalShowdownPhase === 'WAGER'
                      ? '✓ wager in'
                      : '✓ answer in'
                    : finalShowdownPhase === 'WAGER'
                    ? 'wagering...'
                    : 'thinking...'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {finalShowdownPhase === 'RESULTS' && (
        <>
          <div className="text-3xl lg:text-4xl font-black text-emerald-300">Answer: {finalClue?.correctAnswer}</div>
          <div className="w-full grid grid-cols-3 gap-4">
            {activeContestantsList.map((id) => {
              const c = contestants[id];
              return (
                <div
                  key={id}
                  className={`rounded-2xl border-2 p-5 ${
                    c.sitsOutFinal
                      ? 'bg-slate-950/80 border-slate-700 text-slate-400'
                      : c.finalCorrect
                      ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200'
                      : 'bg-rose-950/80 border-rose-500 text-rose-200'
                  }`}>
                  <div className="text-xl font-black uppercase">{c.name}</div>
                  <div className="text-2xl font-bold my-2">{c.sitsOutFinal ? 'Sat out' : `"${c.finalAnswer}"`}</div>
                  <div className="text-3xl font-black">
                    {c.sitsOutFinal ? '$0' : `${c.finalCorrect ? '+' : '-'}${money(c.wager)}`}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Results() {
  const {contestants, activeContestantsList, recapMomentsList, shareRecap} = useGame();
  const standings = activeContestantsList.map((id) => contestants[id]).sort((a, b) => b.score - a.score);
  const winners = standings.filter((c) => c.score === standings[0]?.score);
  return (
    <div className="w-full max-w-[1100px] max-h-full overflow-y-auto bg-slate-900/95 border-4 border-amber-400 rounded-3xl p-6 lg:p-10 flex flex-col items-center gap-6 text-center">
      <Trophy className="w-20 h-20 text-amber-400" />
      <div className="text-5xl lg:text-7xl font-black text-amber-400 uppercase">
        {winners.length > 1 ? `${winners.map((c) => c.name).join(' & ')} tie!` : `${winners[0]?.name} wins!`}
      </div>
      <div className="w-full flex flex-col gap-3">
        {standings.map((c, i) => (
          <div key={c.id} className="flex items-center justify-between text-3xl font-black bg-slate-950/80 border border-blue-800 rounded-2xl px-6 py-3">
            <span>
              <span className="text-amber-400">#{i + 1}</span> {c.name}
            </span>
            <span className={c.score >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{money(c.score)}</span>
          </div>
        ))}
      </div>
      {recapMomentsList.length > 0 && (
        <div className="w-full text-left text-xl lg:text-2xl text-slate-200 flex flex-col gap-1">
          {recapMomentsList.map((m) => (
            <div key={m}>• {m}</div>
          ))}
        </div>
      )}
      <button
        onClick={shareRecap}
        className="px-8 py-3 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-black text-xl flex items-center gap-2">
        <Share2 className="w-6 h-6" /> Save recap card
      </button>
    </div>
  );
}

function Podium({id}: {id: ContestantId}) {
  const {contestants, activeClue, activeSelector, currentRound} = useGame();
  const c = contestants[id];
  const buzzed = activeClue?.buzzedContestantId === id && !(activeClue.isBonusWager && !activeClue.bonusWagerLocked);
  const control = activeSelector === id && !activeClue && currentRound !== 'FINAL_SHOWDOWN';
  return (
    <div
      className={`w-[min(28vw,360px)] rounded-t-2xl border-2 overflow-hidden ${
        buzzed
          ? 'border-amber-400 ring-4 ring-amber-400/60 bg-amber-500/20'
          : c.reaction === 'correct'
          ? 'border-emerald-400 bg-emerald-950/50'
          : c.reaction === 'wrong'
          ? 'border-rose-500 bg-rose-950/50'
          : control
          ? 'border-amber-500/80 bg-slate-900'
          : 'border-slate-700 bg-slate-900'
      }`}>
      <div className={`h-2 ${buzzed ? 'bg-amber-400 animate-pulse' : 'bg-blue-700/60'}`} />
      <div className="px-4 py-2 flex items-center justify-center gap-2 text-xl lg:text-2xl font-black uppercase truncate">
        {control && <Star className="w-5 h-5 fill-amber-400 text-amber-400 shrink-0" />}
        <span className="truncate">{c.name}</span>
      </div>
      <div className={`pb-3 text-center font-mono font-black text-3xl lg:text-4xl ${c.score >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {money(c.score)}
      </div>
    </div>
  );
}
