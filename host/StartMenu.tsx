// The start screen: game settings and the button to start.
import {Play, HelpCircle, Trophy, Users, Shield, User, Smartphone, Edit3, Megaphone} from 'lucide-react';
import {gameAudio, MenuOverlay} from '../utils/helper';
import {AIDifficulty, AnswerMode, RemoteSeat, seatLabel} from '../game/types';
import {isVoiceSupported} from '../utils/VoiceAnswerButton';
import {isSpeechSupported} from '../utils/speech';
import {useGame} from '../game/GameContext';
import VoiceSettings from './VoiceSettings';

export default function StartMenu() {
  const {
    isClientConnected,
    setIsClientConnected,
    setIsHowToPlayOpen,
    setIsInviteModalOpen,
    playerName,
    difficulty,
    setDifficulty,
    answerMode,
    setAnswerMode,
    gameLength,
    setGameLength,
    episodeCode,
    setEpisodeCode,
    makeEpisodeCode,
    isTwoPlayerMode,
    setIsTwoPlayerMode,
    gameState,
    bankInfo,
    bankStatus,
    loadBank,
    seenQuestionsCount,
    totalQuestionCount,
    totalCategoryCount,
    contestants,
    remoteSeats,
    player3Human,
    openTagEditorModal,
    startMatch,
    startButtonRef,
    openLeaderboardWithConfig,
    readAloud,
    setReadAloud,
    voiceSpeed,
    setVoiceSpeed,
    screenCount,
    hostPlays,
    setHostPlays,
  } = useGame();
  const seatedPhones = Object.keys(remoteSeats).length;
  // With the host not playing, P1 and P2 need phones before the game can start (Stats Riley can be P3).
  const needsPhones = !hostPlays && seatedPhones < 2;
  return (
    <>
      {gameState.status === 'START' && (
        <MenuOverlay tone="neutral" zIndex={60}>
          <div className="w-full max-w-md bg-gradient-to-b from-slate-900 via-slate-900 to-blue-950 border-2 border-amber-400/80 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col items-center text-center">
            {/* Golden Trophy Banner */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg border border-amber-300 mb-3">
              <Trophy className="w-8 h-8 sm:w-9 sm:h-9 text-slate-950" />
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-amber-400 tracking-wider uppercase mb-1">
              SPORTS ARENA SHOWDOWN
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mb-3">
              {bankInfo ? (
                <>
                  Face off in NFL trivia with {totalQuestionCount.toLocaleString()} questions in {totalCategoryCount} categories, updated
                  through the {bankInfo.dataThrough}.
                </>
              ) : (
                'Loading the NFL question bank...'
              )}
            </p>

            {/* Contestant Name Bar with fully interactive Edit Tag Modal */}
            <div className="w-full mb-3 bg-slate-950/90 p-2.5 rounded-xl border border-blue-900 flex items-center justify-between text-left shadow-inner">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] text-slate-400">Contestant:</span>
                <span className="text-xs font-black text-amber-300">{playerName}</span>
              </div>
              <button
                onClick={openTagEditorModal}
                className="text-[11px] px-2.5 py-1 bg-gradient-to-r from-blue-900 to-blue-800 hover:from-blue-800 hover:to-blue-700 text-blue-100 rounded-lg border border-blue-600 font-bold flex items-center gap-1 shadow transition-all active:scale-95">
                <Edit3 className="w-3 h-3 text-amber-400" />
                <span>Edit Tag</span>
              </button>
            </div>

            {/* Zero-Repeat Protection Badge */}
            <div className="w-full mb-3 px-3 py-1.5 bg-emerald-950/70 border border-emerald-700/80 rounded-xl text-[11px] text-emerald-300 flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Repeat Protection: Active</span>
              </div>
              <span className="font-mono text-slate-200">
                {Math.min(seenQuestionsCount, totalQuestionCount).toLocaleString()} / {totalQuestionCount.toLocaleString()} seen
              </span>
            </div>
            <div className="w-full text-center text-[10px] text-emerald-400/90 font-medium mb-2">
              This device skips questions it has already seen until it runs out
            </div>

            {/* Game Mode: Solo vs Cross-Device vs Pass & Play */}
            <div className="w-full mb-3 text-left">
              <label className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block mb-1">
                Gameplay Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    gameAudio.playCrispClick();
                    setIsTwoPlayerMode(false);
                    setIsClientConnected(false);
                    setHostPlays(true);
                  }}
                  className={`min-w-[48px] min-h-[44px] py-1.5 px-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    !isTwoPlayerMode && !isClientConnected
                      ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md font-black'
                      : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-blue-500'
                  }`}>
                  <User className="w-4 h-4" />
                  <span>Solo Champion</span>
                </button>

                <button
                  onClick={() => {
                    gameAudio.playCrispClick();
                    setIsInviteModalOpen(true);
                  }}
                  className={`min-w-[48px] min-h-[44px] py-1.5 px-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    isClientConnected
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-md font-black'
                      : 'bg-slate-950/80 text-emerald-300 border-emerald-600 hover:border-emerald-400'
                  }`}>
                  <Smartphone className="w-4 h-4" />
                  <span>{isClientConnected ? `✓ ${seatedPhones + (hostPlays ? 1 : 0)} Players Linked` : 'Invite Phones (up to 3)'}</span>
                </button>
              </div>
              {Object.keys(remoteSeats).length > 0 && (
                <div className="mt-1.5 text-[11px] text-emerald-300 font-bold">
                  Joined: {(Object.values(remoteSeats) as RemoteSeat[])
                    .sort()
                    .reverse()
                    .map((seat) => `${contestants[seat].name} (${seatLabel(seat)})`)
                    .join(', ')}
                  {!player3Human && ' · Stats Riley (AI) plays the third seat'}
                </div>
              )}
              {/* A laptop on the stream can host without playing, so all three players use phones. */}
              <label
                className={`mt-2 flex items-start gap-2 text-[11px] leading-tight ${
                  seatedPhones > 0 ? 'text-slate-500' : 'text-slate-300 cursor-pointer'
                }`}>
                <input
                  type="checkbox"
                  className="mt-0.5 accent-amber-400"
                  checked={!hostPlays}
                  disabled={seatedPhones > 0}
                  onChange={(e) => {
                    gameAudio.playCrispClick();
                    setHostPlays(!e.target.checked);
                    if (e.target.checked) setIsTwoPlayerMode(false);
                  }}
                />
                <span>
                  <strong className="text-amber-300">This device only hosts.</strong> All 3 players use phones and the first
                  phone to join is P1. Good for a laptop on the stream.
                  {seatedPhones > 0 && ' (Set this before phones join.)'}
                </span>
              </label>
            </div>

            {/* AI Difficulty Selector */}
            <div className="w-full mb-3 text-left">
              <label className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block mb-1">
                Opponent & Trivia Tier
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as AIDifficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      gameAudio.playCrispClick();
                      setDifficulty(d);
                    }}
                    className={`min-w-[44px] min-h-[44px] py-1 px-1 rounded-lg text-xs font-bold border transition-all ${
                      difficulty === d
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md font-black scale-[1.02]'
                        : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-blue-500'
                    }`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Game Length Selector */}
            <div className="w-full mb-3 text-left">
              <label className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block mb-1">
                Game Length
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    {id: 'FULL', label: 'Full Game', desc: '6 Categories x 5 Clues'},
                    {id: 'SHORT', label: 'Short Game', desc: '5 Categories x 3 Clues'},
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      gameAudio.playCrispClick();
                      setGameLength(m.id);
                    }}
                    className={`min-w-[44px] min-h-[44px] py-1.5 px-1 rounded-lg border flex flex-col items-center justify-center transition-all ${
                      gameLength === m.id
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md scale-[1.02]'
                        : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-blue-500'
                    }`}>
                    <span className="text-xs font-bold">{m.label}</span>
                    <span className="text-[8px] opacity-80">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Episode code: the same boards on any device, so listeners can play the show's game */}
            <div className="w-full mb-3 text-left">
              <label htmlFor="episode-code" className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block mb-1">
                Episode Code <span className="normal-case font-normal text-slate-400">(optional: same boards for everyone)</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  id="episode-code"
                  key={episodeCode}
                  defaultValue={episodeCode}
                  onBlur={(e) => setEpisodeCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEpisodeCode((e.target as HTMLInputElement).value);
                  }}
                  placeholder="e.g. F-7KQ2"
                  autoCapitalize="characters"
                  className="flex-1 min-w-0 min-h-[44px] rounded-lg bg-slate-950/80 border border-slate-700 px-3 text-sm font-black tracking-widest text-white uppercase placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-slate-500"
                />
                <button
                  onClick={() => {
                    gameAudio.playCrispClick();
                    episodeCode ? setEpisodeCode('') : makeEpisodeCode();
                  }}
                  className="min-h-[44px] px-3 rounded-lg border border-slate-700 bg-slate-950/80 text-xs font-bold text-slate-200 hover:border-blue-500">
                  {episodeCode ? 'Clear' : 'Make one'}
                </button>
              </div>
              {episodeCode && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Read this code on the show. Anyone who enters it (or opens the link with ?episode={episodeCode}) gets the same boards until Tuesday's question refresh.
                </p>
              )}
            </div>

            {/* Answer Format Selector */}
            <div className="w-full mb-4 text-left">
              <label className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block mb-1">
                Answer Format Mode
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    {id: 'STANDARD', label: '4-Choice', desc: 'Standard (4-Choice)'},
                    {id: 'HARD', label: '8-Choice', desc: 'Hardcore (8 Curated)'},
                    {id: 'EXPERT', label: 'Typed Text', desc: 'Expert (Fuzzy Match)'},
                    ...(isVoiceSupported ? [{id: 'VOICE', label: 'Mic Only', desc: 'Say Your Answer'}] : []),
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      gameAudio.playCrispClick();
                      setAnswerMode(m.id as AnswerMode);
                    }}
                    className={`min-w-[44px] min-h-[44px] py-1.5 px-1 rounded-lg border flex flex-col items-center justify-center transition-all ${
                      answerMode === m.id
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md scale-[1.02]'
                        : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-blue-500'
                    }`}>
                    <span className="text-xs font-bold">{m.label}</span>
                    <span className="text-[8px] opacity-80">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Read clues aloud */}
            {isSpeechSupported && (
              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setReadAloud(!readAloud);
                }}
                className={`w-full mb-4 min-h-[44px] py-2 px-3 rounded-lg border flex items-center justify-between gap-2 text-left transition-all ${
                  readAloud ? 'bg-blue-600 text-white border-blue-400 shadow-md' : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-blue-500'
                }`}>
                <span className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 shrink-0" />
                  <span className="flex flex-col">
                    <span className="text-xs font-bold">Read Clues Aloud: {readAloud ? 'On' : 'Off'}</span>
                    <span className="text-[9px] opacity-80">
                      {screenCount > 0 ? 'The stream screen reads each clue; ' : 'This device reads each clue; '}
                      buzzers open when it's done
                    </span>
                  </span>
                </span>
              </button>
            )}
            {isSpeechSupported && readAloud && (
              <div className="w-full -mt-2 mb-4 p-2.5 rounded-lg border border-blue-900 bg-slate-950/70">
                <VoiceSettings
                  voiceSpeed={voiceSpeed}
                  setVoiceSpeed={setVoiceSpeed}
                  speaksElsewhere={screenCount > 0}
                />
              </div>
            )}

            {/* Start Button */}
            <button
              ref={startButtonRef}
              autoFocus
              onClick={startMatch}
              disabled={needsPhones || bankStatus !== 'ready'}
              className="min-w-[48px] min-h-[48px] w-full py-3 rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 text-slate-950 font-black text-base shadow-xl transition-transform active:scale-95 flex items-center justify-center gap-2 mb-3 disabled:opacity-50 disabled:cursor-wait">
              <Play className="w-5 h-5 fill-slate-950" />
              {bankStatus === 'loading'
                ? 'LOADING QUESTIONS...'
                : bankStatus === 'failed'
                ? "QUESTIONS DIDN'T LOAD"
                : needsPhones
                ? `WAITING FOR PHONES (${seatedPhones}/2+)`
                : 'ENTER THE ARENA'}
            </button>
            {bankStatus === 'failed' && (
              <button onClick={loadBank} className="-mt-1 mb-3 text-sm font-black text-amber-300 underline underline-offset-2">
                Check your connection, then tap to try again
              </button>
            )}

            {/* Secondary Buttons: Leaderboards, Phone Duel, Rules */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => openLeaderboardWithConfig()}
                className="text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1 font-bold transition-colors">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>🏆 Leaderboards</span>
              </button>

              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsInviteModalOpen(true);
                }}
                className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1 transition-colors">
                <Users className="w-4 h-4" />
                <span>Play on Separate Device</span>
              </button>

              <button
                onClick={() => {
                  gameAudio.playCrispClick();
                  setIsHowToPlayOpen(true);
                }}
                className="text-xs text-blue-300 hover:text-white flex items-center gap-1 transition-colors">
                <HelpCircle className="w-4 h-4" />
                <span>Rules & Database</span>
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}
    </>
  );
}
