// All the game's state and flow: the host runs the game here, and a phone keeps its copy in step.
// The screens read it through GameContext.
import {getSeason, recordSeasonGame, resetSeason, seasonStandings, type SeasonRow} from '../utils/season';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {SETTINGS} from '../constants';
import {gameAudio, GameState, useAutoFocus} from '../utils/helper';
import {
  buildQuestionOptions,
  checkTypedAnswer,
  matchSpokenOption,
  pickSpokenTypedAnswer,
  createFullGameSession,
  dealWith,
  getSeenQuestionsCount,
  getHeldBackCount,
  markQuestionsSeen,
  getTotalAvailableQuestionCount,
  getTotalCategoryCount,
  loadExternalQuestionBank,
  resetSeenQuestions,
  ExternalBankInfo,
  QuestionClue,
  TriviaCategory,
} from '../triviaData';
import {useWakeLock} from '../utils/wakeLock';
import {newEpisodeCode, normalizeEpisodeCode, episodeLength, seededRandom} from '../utils/episode';
import {P2PConnectionManager, P2PMessage} from '../utils/p2pSync';
import {exportHistory, mergeHistory} from '../utils/questionHistory';
import {
  answerLine,
  streakLine,
  getVoiceSpeed,
  isSpeechSupported,
  setVoiceSpeed as setSpeechSpeed,
  speak,
  speechRate,
  SpeechPart,
  spokenMoney,
  stopSpeaking,
  unlockSpeech,
  VoiceSpeed,
} from '../utils/speech';
import {drawRecapCard, shareRecapCard} from '../utils/recapCard';
import {recapAwards, recapMoments} from './recap';
import {
  ActiveClueState,
  AIDifficulty,
  AnswerMode,
  BigPlay,
  Contestant,
  ContestantId,
  Countdown,
  DeviceRole,
  FinalLocks,
  FinalPhase,
  hideAnswer,
  isOpenAnswerMode,
  MatchStats,
  NO_FINAL_LOCKS,
  remoteSeatsFor,
  RemoteSeat,
  RoundType,
  seatLabel,
} from './types';
import {
  aiDailyDoubleWager,
  aiFinalWager,
  AnswerHow,
  aiSettings,
  clampDailyDoubleWager,
  clampFinalWager,
  clueStake,
  clueTimeUp,
  countdownForSync,
  countdownFromSync,
  defaultDailyDoubleWager,
  frozenCountdown,
  isFinalAnswerRight,
  maxFinalWager,
  pauseCountdown,
  playsFinal,
  readingSeconds,
  resolveAnswer,
  resumeCountdown,
  scoreAnswer,
  trackAnswer,
  startCountdown,
  TIMES,
  remoteBuzzTime,
  EARLY_BUZZ_LOCKOUT_MS,
  inEarlyBuzzLockout,
  aiCorrectChance,
  aiBuzzChance,
  updateStreaks,
  HINT_SECONDS,
  aiWhoAmIWaitMs,
  hintCount,
  shownClueText,
  currentWorth,
} from './rules';
import {
  AnswerFormat,
  GameLength,
  getLeaderboard,
  getLastPlayerName,
  OpponentMode,
  recordLeaderboardEntry,
  setLastPlayerName,
  TriviaTier,
} from '../utils/leaderboard';
import {BGM_TRIVIA, BGM_FINAL} from '../ui/shared';

// What is read aloud when a clue opens.
// The intro is read with a little more energy than the clue itself.
/** What the host voice says as a player's Final Showdown result is revealed. */
export const finalRevealLine = (c: Contestant) =>
  `${c.name} wrote ${c.finalAnswer && c.finalAnswer !== '(No Answer)' ? c.finalAnswer : 'nothing'}. ${
    c.finalCorrect ? "That's right!" : 'Sorry, no.'
  } The wager: ${c.wager.toLocaleString('en-US')} dollars, for a total of ${c.score.toLocaleString('en-US')}.`;

/** What the host voice says for each column in a round's category reveal (the first line opens the round). */
export const categoryIntroLines = (round: RoundType, board: {title: string; description?: string}[]): string[] =>
  board.map((cat, i) => {
    const opener =
      i > 0 ? '' : round === 'ROUND_1' ? "Here are today's categories. " : 'Round 2, where the values double! Your categories. ';
    const about = cat.description ? ` ${cat.description}` : '';
    return `${opener}${cat.title}.${about}`;
  });

const spokenClue = (clue: QuestionClue, text = clue.clue): SpeechPart[] => [
  {text: `${clue.category}, for ${spokenMoney(clue.value)}!`, hype: true},
  text,
];
const spokenFinal = (clue: QuestionClue): SpeechPart[] => [
  {text: `Final Showdown! The category: ${clue.category}.`, hype: true},
  clue.clue,
];
const partsText = (parts: SpeechPart[]) => parts.map((p) => (typeof p === 'string' ? p : p.text)).join(' ');

export function useGameController() {
  // Audio mute controls: Music MUST be OFF by default, SFX MUST be ON by default
  const [sfxMuted, setSfxMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(true);

  // Device Role & Multiplayer Lobby Management
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => {
    if (typeof window === 'undefined') return 'HOST';
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const roleParam = params.get('role') || hashParams.get('role');
    if (roleParam === 'screen') return 'SCREEN';
    return roleParam === 'join' || roleParam === 'client' ? 'CLIENT' : 'HOST';
  });

  const [roomCode, setRoomCode] = useState<string>(() => {
    if (typeof window === 'undefined') return 'SPORT-7892';
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const codeParam = params.get('room') || hashParams.get('room');
    if (codeParam) return codeParam.toUpperCase().trim();
    return `SPORT-${Math.floor(1000 + Math.random() * 9000)}`;
  });

  const [joinInputCode, setJoinInputCode] = useState('');
  const [p2pStatus, setP2PStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [p2pDetail, setP2PDetail] = useState<string>('');
  const [isClientConnected, setIsClientConnected] = useState(false);
  const [inviteModalTab, setInviteModalTab] = useState<'separate' | 'pass_play' | 'join'>('separate');

  // Overlay navigation states
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagEditorInput, setTagEditorInput] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [seenCountRefresh, setSeenCountRefresh] = useState(0);

  // Leaderboard Filtering & Player Profile State
  const [playerName, setPlayerName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('contestant_name') || localStorage.getItem('player_tag') || getLastPlayerName();
      if (stored) return stored;
    }
    return 'Champion';
  });

  const [leaderboardFilterOpponent, setLeaderboardFilterOpponent] = useState<OpponentMode>('PRO_AI');
  const [leaderboardFilterTier, setLeaderboardFilterTier] = useState<TriviaTier>('MEDIUM');
  const [leaderboardFilterFormat, setLeaderboardFilterFormat] = useState<AnswerFormat>('STANDARD');
  const [leaderboardFilterLength, setLeaderboardFilterLength] = useState<GameLength>('FULL');
  const [leaderboardRefreshCounter, setLeaderboardRefreshCounter] = useState(0);
  // Podcast season standings (host device), shown on the leaderboard and the stream screen's results.
  const [seasonRows, setSeasonRows] = useState<SeasonRow[]>(() => seasonStandings(getSeason()));
  const startNewSeason = () => {
    resetSeason();
    setSeasonRows([]);
  };
  const [highScoreCelebration, setHighScoreCelebration] = useState<{
    rank: number;
    isHighScore: boolean;
    score: number;
    opponent: OpponentMode;
    tier: TriviaTier;
    format: AnswerFormat;
    length: GameLength;
  } | null>(null);

  // Game setup options
  const [difficulty, setDifficulty] = useState<AIDifficulty>('MEDIUM');
  const [answerMode, setAnswerMode] = useState<AnswerMode>('STANDARD');
  // Full: 6 categories x 5 clues per round. Short: 5 categories x 3 clues per round.
  const [gameLength, setGameLengthState] = useState<GameLength>(() => {
    const code = normalizeEpisodeCode(new URLSearchParams(window.location.search).get('episode') || '');
    return code ? episodeLength(code) : 'FULL';
  });
  // Episode code: deals the same boards on any device (a link with ?episode=F-7KQ2 fills it in).
  const [episodeCode, setEpisodeCodeState] = useState(() => normalizeEpisodeCode(new URLSearchParams(window.location.search).get('episode') || ''));
  const setEpisodeCode = useCallback((input: string) => {
    const code = normalizeEpisodeCode(input);
    setEpisodeCodeState(code);
    if (code) setGameLengthState(episodeLength(code));
  }, []);
  const makeEpisodeCode = useCallback(() => setEpisodeCodeState(newEpisodeCode(gameLength)), [gameLength]);
  // Changing the game length drops a code made for the other length.
  const setGameLength = useCallback((length: GameLength) => {
    setGameLengthState(length);
    setEpisodeCodeState((code) => (code && episodeLength(code) !== length ? '' : code));
  }, []);
  const [isTwoPlayerMode, setIsTwoPlayerMode] = useState(false);
  // Whether this host device also plays as Player 1. Off, it only hosts (a laptop on the
  // stream) and all three players are on phones, with the first phone to join as P1.
  const [hostPlays, setHostPlaysState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('host_plays') !== 'false';
    } catch {
      return true;
    }
  });
  const hostPlaysRef = useRef(hostPlays);
  hostPlaysRef.current = hostPlays;
  // Read each clue aloud. The buzzers wait until it has been read. The stream screen does the
  // reading when one is connected, otherwise the host device does.
  const [readAloud, setReadAloudState] = useState(() => {
    try {
      return isSpeechSupported && localStorage.getItem('read_aloud') === 'on';
    } catch {
      return false;
    }
  });
  const setReadAloud = useCallback((on: boolean) => {
    setReadAloudState(on);
    if (on) unlockSpeech();
    try {
      localStorage.setItem('read_aloud', on ? 'on' : 'off');
    } catch {
      // Private browsing: the setting just isn't remembered.
    }
  }, []);

  // How fast the host voice reads. Set on the host, and passed to the stream screen.
  const [voiceSpeed, setVoiceSpeedState] = useState<VoiceSpeed>(() => getVoiceSpeed());
  const setVoiceSpeed = useCallback((s: VoiceSpeed) => {
    setSpeechSpeed(s);
    setVoiceSpeedState(s);
  }, []);

  // Core Game State
  const [gameState, setGameState] = useState<GameState>({
    status: 'START',
    score: 0,
    level: 1,
  });

  const [currentRound, setCurrentRound] = useState<RoundType>('ROUND_1');
  const [round1Board, setRound1Board] = useState<TriviaCategory[]>([]);
  const [round2Board, setRound2Board] = useState<TriviaCategory[]>([]);
  const [answeredClueIds, setAnsweredClueIds] = useState<Set<string>>(new Set());
  // Top tile value on the board in play caps the smallest Daily Double wager.
  // Read from the board itself so joined phones get it without extra syncing.
  const roundMaxClue = useMemo(() => {
    const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
    const values = board.flatMap((cat) => cat.clues.map((c) => c.value));
    return values.length ? Math.max(...values) : currentRound === 'ROUND_1' ? 1000 : 2000;
  }, [currentRound, round1Board, round2Board]);

  // Board grid shape: 6 x 5 for a full game, 5 x 3 for a short one.
  const boardColsClass =
    (currentRound === 'ROUND_1' ? round1Board : round2Board).length === 5 ? 'grid-cols-5' : 'grid-cols-6';
  const boardRowIndexes = useMemo(() => {
    const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
    const rows = Math.max(0, ...board.map((cat) => cat.clues.length));
    return Array.from({length: rows}, (_, i) => i);
  }, [currentRound, round1Board, round2Board]);

  // NFL question bank, built weekly from nflverse data
  const [bankInfo, setBankInfo] = useState<ExternalBankInfo | null>(null);
  // A game can't start until the bank is in: the built-in questions only fill half a Round 1
  // board and no Round 2 board at all.
  const [bankStatus, setBankStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const loadBank = useCallback(() => {
    setBankStatus('loading');
    loadExternalQuestionBank().then((info) => {
      if (info) setBankInfo(info);
      setBankStatus(info ? 'ready' : 'failed');
    });
  }, []);

  // Only the host deals questions. Phones and the stream screen never load the bank, which
  // saves them a 1.4 MB download and the work of preparing 4,000 questions as they join.
  useEffect(() => {
    if (deviceRole !== 'HOST' || bankInfo) return;
    loadBank();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceRole]);

  // Keep screens on in a room: a phone that locks mid-game drops out, and a host that sleeps freezes everyone.
  useWakeLock(deviceRole !== 'HOST' ? p2pStatus !== 'error' : gameState.status === 'PLAYING' || isClientConnected);

  // Anti-repeat question statistics
  const seenQuestionsCount = useMemo(() => {
    return getSeenQuestionsCount();
  }, [seenCountRefresh, gameState.status, currentRound]);
  const heldBackQuestionsCount = useMemo(() => {
    return getHeldBackCount();
  }, [seenCountRefresh, gameState.status, currentRound]);

  const totalQuestionCount = useMemo(() => {
    return getTotalAvailableQuestionCount();
  }, [bankInfo]);

  const totalCategoryCount = useMemo(() => {
    return getTotalCategoryCount();
  }, [bankInfo]);

  // Control of the Board
  const [activeSelector, setActiveSelector] = useState<ContestantId>('player');
  const [aiPickingTile, setAiPickingTile] = useState<{catIdx: number; clueIdx: number} | null>(null);
  const [aiThinkingStatus, setAiThinkingStatus] = useState<string | null>(null);

  // Contestants
  const [contestants, setContestants] = useState<Record<ContestantId, Contestant>>({
    coach: {
      id: 'coach',
      name: 'Coach Dave',
      shortName: 'Coach',
      title: 'Gridiron Tactician',
      score: 0,
      reaction: 'idle',
      correctCount: 0,
      wrongCount: 0,
      wager: 0,
    },
    player: {
      id: 'player',
      name: playerName || 'Champion',
      shortName: 'P1',
      title: 'Host Champion',
      score: 0,
      reaction: 'idle',
      correctCount: 0,
      wrongCount: 0,
      wager: 0,
    },
    analyst: {
      id: 'analyst',
      name: 'Stats Riley',
      shortName: 'Riley',
      title: 'Analytics Guru',
      score: 0,
      reaction: 'idle',
      correctCount: 0,
      wrongCount: 0,
      wager: 0,
    },
    player2: {
      id: 'player2',
      name: 'Player 2',
      shortName: 'P2',
      title: 'Online Duelist',
      score: 0,
      reaction: 'idle',
      correctCount: 0,
      wrongCount: 0,
      wager: 0,
    },
  });

  // Active Clue modal state
  const [activeClue, setActiveClue] = useState<ActiveClueState | null>(null);

  // Final Showdown states
  const [finalClue, setFinalClue] = useState<QuestionClue | null>(null);
  const [playerFinalWager, setPlayerFinalWager] = useState(1000);
  const [player2FinalWager, setPlayer2FinalWager] = useState(1000);
  const [finalShowdownPhase, setFinalShowdownPhase] = useState<FinalPhase>('WAGER');
  const [finalTimer, setFinalTimer] = useState<Countdown>(frozenCountdown(TIMES.final));
  const [finalPlayerInput, setFinalPlayerInput] = useState('');
  const [finalPlayer2Input, setFinalPlayer2Input] = useState('');
  const [player3FinalWager, setPlayer3FinalWager] = useState(1000);
  const [finalPlayer3Input, setFinalPlayer3Input] = useState('');

  // Every device (host, phones, stream screen) remembers each question it actually showed,
  // so a tile nobody opened isn't held back, and any device can bring the group's history
  // to the next game it hosts or joins.
  const shownClueId = activeClue?.clue.id;
  useEffect(() => {
    if (shownClueId) markQuestionsSeen([shownClueId]);
  }, [shownClueId]);
  const shownFinalId = currentRound === 'FINAL_SHOWDOWN' && finalShowdownPhase !== 'WAGER' ? finalClue?.id : undefined;
  useEffect(() => {
    if (shownFinalId) markQuestionsSeen([shownFinalId]);
  }, [shownFinalId]);
  // Multiple choice games get choices in the Final too (empty for typed and mic-only games).
  const [finalOptions, setFinalOptions] = useState<string[]>([]);

  // The biggest single win of the match, for the recap.
  const [bigPlay, setBigPlay] = useState<BigPlay | null>(null);
  // The category reveal at the start of a round (when clues are read aloud): `shown` columns
  // are revealed so far. Nobody can pick a tile until it's done or skipped.
  const [categoryIntro, setCategoryIntro] = useState<{round: RoundType; shown: number} | null>(null);
  const categoryIntroRef = useRef(categoryIntro);
  categoryIntroRef.current = categoryIntro;
  const introducedRoundsRef = useRef(new Set<RoundType>());
  // The Final Showdown reveal: players' results in `order`, `shown` of them revealed so far.
  // The Final's results wait in the ref until the reveal ends.
  const [finalReveal, setFinalReveal] = useState<{order: ContestantId[]; shown: number} | null>(null);
  const pendingFinalRef = useRef<{after: Record<ContestantId, Contestant>; finalScores: Record<ContestantId, number>} | null>(null);
  /** False while this player's Final result is still waiting to be revealed. */
  const finalShownFor = (id: ContestantId) => !finalReveal || !finalReveal.order.includes(id) || finalReveal.order.indexOf(id) < finalReveal.shown;

  // Match statistics for post-game
  const [matchStats, setMatchStats] = useState<MatchStats>({
    totalQuestions: 0,
    playerCorrect: 0,
    playerWrong: 0,
    highestScore: 0,
    buzzerWins: 0,
    bonusWagersHit: 0,
  });

  // Client: what this phone's player is typing. Kept apart from activeClue because the
  // host's state sync replaces activeClue several times a second.
  const [clientTypedInput, setClientTypedInput] = useState('');
  useEffect(() => setClientTypedInput(''), [activeClue?.clue.id, activeClue?.buzzedContestantId]);
  // Client: the Daily Double wager being typed on this phone (as text, so the box can be cleared).
  const [clientWager, setClientWager] = useState('');
  useEffect(() => {
    if (activeClue?.isBonusWager) setClientWager(String(activeClue.bonusWagerInput));
    // Only when a new Daily Double opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClue?.clue.id, activeClue?.isBonusWager]);

  // P2P Manager Ref
  const p2pRef = useRef<P2PConnectionManager | null>(null);

  // Host: which seat each friend's phone holds, by PeerJS id. Client: the seat this phone holds.
  const [remoteSeats, setRemoteSeats] = useState<Record<string, RemoteSeat>>({});
  const remoteSeatsRef = useRef(remoteSeats);
  const [mySeat, setMySeat] = useState<RemoteSeat>('player2');
  // Host: stream screens watching this game, by PeerJS id.
  const screenPeersRef = useRef(new Set<string>());
  const [screenCount, setScreenCount] = useState(0);
  // Stream screen: the podium lineup the host is showing.
  const [syncedLineup, setSyncedLineup] = useState<ContestantId[]>(['player', 'player2', 'analyst']);
  const player3Human = Object.values(remoteSeats).includes('analyst');
  // Switching who plays P1 only makes sense before anyone has a seat.
  const setHostPlays = useCallback((next: boolean) => {
    if (Object.keys(remoteSeatsRef.current).length > 0) return;
    setHostPlaysState(next);
    try {
      localStorage.setItem('host_plays', String(next));
    } catch {
      /* storage blocked: the choice lasts until reload */
    }
  }, []);
  const onlineRemoteSeats = Object.values(remoteSeats);
  const isHumanSeat = (id: ContestantId) => id === 'player' || id === 'player2' || (id === 'analyst' && player3Human);

  // Host: seats whose phone dropped during a match, with that player's name, so they can rejoin
  // into the same seat and score. Stats Riley covers an away Player 3; an away Player 2 sits out.
  const [awaySeats, setAwaySeats] = useState<Partial<Record<RemoteSeat, string>>>({});
  const awaySeatsRef = useRef(awaySeats);
  // Host: which phone (by its device id) last sat in each seat.
  const seatDevicesRef = useRef<Partial<Record<RemoteSeat, string>>>({});
  const player2Away = awaySeats.player2 !== undefined;
  // Only a phone playing P1 (when the host doesn't play) can be away.
  const player1Away = awaySeats.player !== undefined;

  // Seats that take part in buzzer races right now.
  const buzzerSeats = useMemo<ContestantId[]>(
    () =>
      isTwoPlayerMode || isClientConnected
        ? (['player', 'player2', 'analyst'] as ContestantId[]).filter(
            (id) => !(id === 'player2' && player2Away) && !(id === 'player' && player1Away)
          )
        : ['player', 'coach', 'analyst'],
    [isTwoPlayerMode, isClientConnected, player2Away, player1Away]
  );

  // The podium lineup. A stream screen shows whatever the host shows.
  const activeContestantsList = useMemo(() => {
    if (deviceRole === 'SCREEN') return syncedLineup;
    if (isTwoPlayerMode || isClientConnected) {
      return ['player', 'player2', 'analyst'] as ContestantId[];
    }
    return ['coach', 'player', 'analyst'] as ContestantId[];
  }, [deviceRole, syncedLineup, isTwoPlayerMode, isClientConnected]);

  // Final Showdown: which players have locked their wager and their answer.
  const [finalLocks, setFinalLocks] = useState<FinalLocks>(NO_FINAL_LOCKS);

  // Latest values for timers and network callbacks that outlive a render.
  const activeClueRef = useRef(activeClue);
  activeClueRef.current = activeClue;
  // Host: changes to the open clue go through here, so a timer or network message handled
  // before the next render already sees the new clue.
  // Host: when the buzzers last opened, to time how fast each buzz-in was (for Quick Draw).
  const buzzersOpenedAtRef = useRef(0);
  const commitClue = (next: ActiveClueState | null) => {
    const prev = activeClueRef.current;
    if (next?.phase === 'BUZZER_OPEN' && (prev?.phase !== 'BUZZER_OPEN' || prev.clue.id !== next.clue.id)) {
      buzzersOpenedAtRef.current = Date.now();
    }
    activeClueRef.current = next;
    setActiveClue(next);
  };
  const contestantsRef = useRef(contestants);
  contestantsRef.current = contestants;
  const gameStatusRef = useRef(gameState.status);
  gameStatusRef.current = gameState.status;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;

  // Toast notification helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  // Open Contestant Tag Editor Modal
  const openTagEditorModal = useCallback(() => {
    gameAudio.playCrispClick();
    setTagEditorInput(playerName);
    setIsTagEditorOpen(true);
  }, [playerName]);

  // Save Contestant Tag
  const handleSaveTag = useCallback(
    (newTag?: string) => {
      const candidate = (newTag !== undefined ? newTag : tagEditorInput).trim();
      const clean = candidate.slice(0, 18) || 'Champion';
      setPlayerName(clean);
      setLastPlayerName(clean);
      if (typeof window !== 'undefined') {
        localStorage.setItem('contestant_name', clean);
        localStorage.setItem('player_tag', clean);
      }

      // A phone playing P1 has its own name; the host's tag only names P1 when the host plays.
      if (hostPlays) {
        setContestants((prev) => ({
          ...prev,
          player: {
            ...prev.player,
            name: isTwoPlayerMode || isClientConnected ? `${clean} (P1)` : clean,
          },
        }));
      }

      setIsTagEditorOpen(false);
      gameAudio.playConfirmSelect();
      showToast(`✓ Contestant tag saved as "${clean}"`);
    },
    [tagEditorInput, isTwoPlayerMode, isClientConnected, showToast, hostPlays]
  );

  // Reset Seen Questions History
  const handleResetQuestionHistory = useCallback(() => {
    gameAudio.playConfirmSelect();
    resetSeenQuestions();
    setSeenCountRefresh((c) => c + 1);
    showToast('✓ Question history reset! Pool refreshed.');
  }, [showToast]);

  // Compute current active match's opponent mode
  const currentOpponentMode = useMemo((): OpponentMode => {
    if (isClientConnected) return 'ONLINE_DUEL';
    if (isTwoPlayerMode) return 'PASS_PLAY';
    if (difficulty === 'EASY') return 'ROOKIE_AI';
    if (difficulty === 'MEDIUM') return 'PRO_AI';
    if (difficulty === 'HARD') return 'ALL_STAR_AI';
    return 'LEGEND_AI';
  }, [isClientConnected, isTwoPlayerMode, difficulty]);

  // Compute shareable join URL for QR and direct copy
  const shareableJoinUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?room=${encodeURIComponent(roomCode)}&role=join`;
  }, [roomCode]);
  const streamScreenUrl = shareableJoinUrl.replace(/role=join$/, 'role=screen');
  const greenScreenUrl = `${streamScreenUrl}&bg=green`;

  // Sync SDK lifecycle score with player's cash bankroll
  useEffect(() => {
    setGameState((prev) => ({
      ...prev,
      score: contestants.player.score,
      level: currentRound === 'ROUND_1' ? 1 : currentRound === 'CHAMPIONSHIP' ? 2 : 3,
    }));
  }, [contestants.player.score, currentRound]);


  // Generate a fresh unique room code
  const generateRoomCode = useCallback(() => {
    const num = Math.floor(1000 + Math.random() * 9000);
    const code = `SPORT-${num}`;
    setRoomCode(code);
    showToast(`New Room Code: ${code}`);
    return code;
  }, [showToast]);

  // Setup Board data with strict session-wide deduplication & Daily Doubles
  // (1 in Round 1, 2 in Round 2; a short game has half the clues, so just 1 in Round 2)
  const initializeBoards = useCallback(() => {
    // With an episode code every pick (columns, clues, Daily Doubles, the Final) comes from the code.
    const random = episodeCode ? seededRandom(`${episodeCode}|${bankInfo?.dataThrough ?? ''}`) : Math.random;
    const session = dealWith(episodeCode ? random : null, () => createFullGameSession(difficulty, gameLength));
    const r1 = session.round1Board;
    const r2 = session.round2Board;
    const r1Rows = r1[0]?.clues.length || 5;
    const r2Rows = r2[0]?.clues.length || 5;

    // 1 Daily Double hidden in Round 1
    const r1Cat = Math.floor(random() * r1.length);
    const r1Clue = Math.floor(random() * r1Rows);
    if (r1[r1Cat]?.clues[r1Clue]) {
      r1[r1Cat].clues[r1Clue].isBonusWager = true;
    }

    // Daily Doubles hidden in Round 2, in different categories
    const bonus1Cat = Math.floor(random() * r2.length);
    const bonus1Clue = Math.floor(random() * r2Rows);
    if (r2[bonus1Cat]?.clues[bonus1Clue]) {
      r2[bonus1Cat].clues[bonus1Clue].isBonusWager = true;
    }

    if (gameLength === 'FULL') {
      let bonus2Cat = Math.floor(random() * r2.length);
      let bonus2Clue = Math.floor(random() * r2Rows);
      if (bonus2Cat === bonus1Cat && bonus2Clue === bonus1Clue) {
        bonus2Cat = (bonus1Cat + 2) % r2.length;
      }
      if (r2[bonus2Cat]?.clues[bonus2Clue]) {
        r2[bonus2Cat].clues[bonus2Clue].isBonusWager = true;
      }
    }

    // Development only: ?board=2x2 plays a tiny board (2 categories of 2 clues) for quick tests.
    const params = new URLSearchParams(window.location.search);
    const small = import.meta.env.DEV && params.get('board')?.match(/^(\d)x(\d)$/);
    const shrink = (board: TriviaCategory[]) => {
      if (!small) return board;
      const out = board.slice(0, +small[1]).map((cat) => ({...cat, clues: cat.clues.slice(0, +small[2])}));
      const last = out[0]?.clues[out[0].clues.length - 1];
      for (const cat of out) for (const q of cat.clues) q.isBonusWager = false;
      // Daily Double on the last tile of the first category, unless &dd=0.
      if (last && params.get('dd') !== '0') last.isBonusWager = true;
      return out;
    };

    setRound1Board(shrink(r1));
    setRound2Board(shrink(r2));
    setAnsweredClueIds(new Set());

    // Set Final Clue from deduplicated session
    setFinalClue(session.finalClue);
    setSeenCountRefresh((c) => c + 1);
  }, [difficulty, gameLength, episodeCode, bankInfo]);

  // AI reflex and accuracy configuration
  const aiConfig = useMemo(() => aiSettings(difficulty), [difficulty]);

  // A Daily Double's answer clock, which starts once the wager is in. Read aloud, it also
  // gets the time it takes to read the clue.
  const dailyDoubleClock = (clue: QuestionClue, now: number) =>
    startCountdown(TIMES.dailyDouble + (readAloud ? readingSeconds(clue.clue, 0, speechRate()) : 0), now);

  // Helper to shuffle distractors and construct options array with guaranteed 8-choice / 4-choice integrity
  const generateOptions = useCallback((clue: QuestionClue, mode: AnswerMode): string[] => {
    if (isOpenAnswerMode(mode)) return [];
    return buildQuestionOptions(clue, mode);
  }, []);

  // Turn what a player said into an answer. Multiple choice picks the option they named;
  // typed mode submits the recognizer's best guess. Returns a hint when it can't tell.
  // A phone doesn't know the answer, so it passes every guess along and the host picks.
  const answerByVoice = (heard: string[], submit: (answer: string, guesses?: string[]) => void): string | void => {
    if (!activeClue) return;
    if (isOpenAnswerMode(answerMode)) {
      const answer = pickSpokenTypedAnswer(heard, activeClue.clue, SETTINGS.fuzzyMatchThreshold);
      if (!answer) return answerMode === 'VOICE' ? "Didn't catch that. Tap the mic and try again." : "Didn't catch that. Try again or type it.";
      setActiveClue((prev) => (prev ? {...prev, typedInput: answer} : null));
      submit(answer, heard);
      return;
    }
    const match = matchSpokenOption(heard, activeClue.options);
    if (!match) return `Heard "${heard[0]}". Not sure which one you meant, so tap it.`;
    submit(match, heard);
  };

  // Final Showdown answers are typed, so voice fills the box and the player checks it before submitting.
  const finalAnswerByVoice = (heard: string[], setAnswer: (answer: string) => void): string | void => {
    if (!finalClue) return;
    if (finalOptions.length) {
      const match = matchSpokenOption(heard, finalOptions);
      if (!match) return `Heard "${heard[0]}". Not sure which one you meant, so tap it.`;
      setAnswer(match);
      return;
    }
    const answer = pickSpokenTypedAnswer(heard, finalClue, SETTINGS.fuzzyMatchThreshold);
    if (!answer) return "Didn't catch that. Try again or type it.";
    setAnswer(answer);
    return `Heard "${answer}". Fix it if needed, then submit.`;
  };

  // Open a clue card (authoritative selection on host)
  const selectClue = useCallback(
    (categoryIndex: number, clueIndex: number, pickerId: ContestantId = activeSelector) => {
      if (activeClue || categoryIntroRef.current) return;
      const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
      const clue = board[categoryIndex]?.clues[clueIndex];
      if (!clue || answeredClueIds.has(clue.id)) return;

      gameAudio.playCrispClick();

      const isBonus = Boolean(clue.isBonusWager);
      const options = generateOptions(clue, answerMode);

      const pickerScore = contestants[pickerId]?.score || 0;
      const aiWager = aiDailyDoubleWager(pickerId === 'coach' ? aiConfig.coachAcc : aiConfig.analystAcc, roundMaxClue, pickerScore);

      if (isBonus) {
        gameAudio.playPowerupChime();
      }

      setActiveClue({
        clue,
        catIndex: categoryIndex,
        clueIndex,
        phase: isBonus ? 'ANSWERING' : 'READING',
        buzzedContestantId: isBonus ? pickerId : null,
        buzzerLockout: {coach: false, player: false, analyst: false, player2: false},
        // A Daily Double's clock waits for the wager.
        ...(isBonus
          ? frozenCountdown(TIMES.dailyDouble)
          : startCountdown(
              // A Who Am I? clue reads only its first hint before the buzzers open.
              readAloud
                ? readingSeconds(partsText(spokenClue(clue, clue.hints && clue.hints.length > 1 ? clue.hints[0] : clue.clue)), SETTINGS.buzzerLightDelay, speechRate())
                : SETTINGS.buzzerLightDelay,
              Date.now()
            )),
        options,
        isBonusWager: isBonus,
        bonusSelectingPlayerId: pickerId,
        bonusWagerInput: isBonus
          ? isHumanSeat(pickerId)
            ? defaultDailyDoubleWager(roundMaxClue, pickerScore)
            : aiWager
          : clue.value,
        bonusWagerLocked: false, // Daily Double starts UNLOCKED so clue text is completely obscured/hidden!
        selectedOption: null,
        typedInput: '',
        feedbackText: isBonus
          ? isHumanSeat(pickerId)
            ? `★ DAILY DOUBLE! (${contestants[pickerId].name}) Enter your strategic wager!`
            : `★ DAILY DOUBLE! ${contestants[pickerId].name} is placing their wager...`
          : 'Host is reading clue...',
      });

      // Reset contestant reactions
      setContestants((prev) => ({
        ...prev,
        coach: {...prev.coach, reaction: isBonus && pickerId === 'coach' ? 'answering' : 'idle'},
        player: {...prev.player, reaction: isBonus && pickerId === 'player' ? 'answering' : 'idle'},
        analyst: {...prev.analyst, reaction: isBonus && pickerId === 'analyst' ? 'answering' : 'idle'},
        player2: {...prev.player2, reaction: isBonus && pickerId === 'player2' ? 'answering' : 'idle'},
      }));
    },
    [activeClue, currentRound, round1Board, round2Board, roundMaxClue, answeredClueIds, activeSelector, contestants, answerMode, aiConfig, player3Human, readAloud]
  );

  // Automatic AI Wager Announcement & Reveal for Daily Doubles
  useEffect(() => {
    if (
      deviceRole !== 'HOST' ||
      !activeClue ||
      !activeClue.isBonusWager ||
      activeClue.bonusWagerLocked
    ) {
      return;
    }

    const pickerId = activeClue.bonusSelectingPlayerId;
    if (pickerId !== 'coach' && pickerId !== 'analyst') return;
    if (pickerId === 'analyst' && player3Human) return;

    const timer = setTimeout(() => {
      const prev = activeClueRef.current;
      if (!prev || !prev.isBonusWager || prev.bonusWagerLocked) return;
      gameAudio.playConfirmSelect();
      const pName = contestantsRef.current[pickerId]?.name || 'Opponent';
      commitClue({
        ...prev,
        ...dailyDoubleClock(prev.clue, Date.now()),
        bonusWagerLocked: true,
        feedbackText: `${pName} locked in wager at $${prev.bonusWagerInput.toLocaleString()}! Reading clue...`,
      });
    }, 1800);

    return () => clearTimeout(timer);
  }, [deviceRole, activeClue?.isBonusWager, activeClue?.bonusWagerLocked, activeClue?.bonusSelectingPlayerId, player3Human, readAloud]);

  // Initialize and start match
  const startMatch = useCallback(() => {
    if (bankStatus !== 'ready') return;
    gameAudio.playConfirmSelect();
    initializeBoards();
    setCurrentRound('ROUND_1');
    setActiveSelector('player');
    setAiPickingTile(null);
    setAiThinkingStatus(null);
    setHighScoreCelebration(null);
    setBigPlay(null);
    if (readAloud) unlockSpeech();

    setContestants((prev) => ({
      coach: {
        id: 'coach',
        name: 'Coach Dave',
        shortName: 'Coach',
        title: 'Gridiron Tactician',
        score: 0,
        reaction: 'idle',
        correctCount: 0,
        wrongCount: 0,
        wager: 0,
      },
      player: {
        id: 'player',
        // A phone playing P1 keeps the name it joined with.
        name: !hostPlays ? prev.player.name : isTwoPlayerMode || isClientConnected ? `${playerName} (P1)` : `${playerName}`,
        shortName: 'P1',
        title: hostPlays ? 'Host Champion' : 'Online Challenger',
        score: 0,
        reaction: 'idle',
        correctCount: 0,
        wrongCount: 0,
        wager: 0,
      },
      analyst: {
        id: 'analyst',
        name: player3Human ? prev.analyst.name : 'Stats Riley',
        shortName: player3Human ? 'P3' : 'Riley',
        title: player3Human ? 'Online Challenger' : 'Analytics Guru',
        score: 0,
        reaction: 'idle',
        correctCount: 0,
        wrongCount: 0,
        wager: 0,
      },
      player2: {
        id: 'player2',
        name: isClientConnected ? prev.player2.name : 'Player 2',
        shortName: 'P2',
        title: 'Online Challenger',
        score: 0,
        reaction: 'idle',
        correctCount: 0,
        wrongCount: 0,
        wager: 0,
      },
    }));

    setMatchStats({
      totalQuestions: 0,
      playerCorrect: 0,
      playerWrong: 0,
      highestScore: 0,
      buzzerWins: 0,
      bonusWagersHit: 0,
    });

    commitClue(null);
    setFinalShowdownPhase('WAGER');
    setFinalTimer(frozenCountdown(TIMES.final));
    setFinalPlayerInput('');
    setFinalPlayer2Input('');
    setPlayerFinalWager(1000);
    setPlayer2FinalWager(1000);
    setFinalPlayer3Input('');
    setPlayer3FinalWager(1000);
    setFinalOptions([]);
    setFinalLocks(NO_FINAL_LOCKS);
    awaySeatsRef.current = {};
    setAwaySeats({});
    introducedRoundsRef.current = new Set();
    setCategoryIntro(null);
    pendingFinalRef.current = null;
    setFinalReveal(null);
    setGameState((prev) => ({...prev, status: 'PLAYING', score: 0, level: 1}));
    setIsGameMenuOpen(false);
    setIsHowToPlayOpen(false);
    setIsInviteModalOpen(false);
    setIsLeaderboardOpen(false);
    setIsTagEditorOpen(false);
  }, [initializeBoards, isTwoPlayerMode, isClientConnected, playerName, player3Human, readAloud, hostPlays, bankStatus]);

  // Buzzer races. With friends on phones, buzzes are collected for a moment and the earliest
  // press wins, counting each phone's network delay, so the host's own phone has no head start.
  const BUZZ_WINDOW_MS = 250;
  const pendingBuzzesRef = useRef<{id: ContestantId; at: number; clueId: string}[]>([]);
  const buzzWindowRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const awardBuzz = (contestantId: ContestantId, clueId: string, pressedAt = Date.now()) => {
    const current = activeClueRef.current;
    if (
      !current ||
      current.clue.id !== clueId ||
      current.phase !== 'BUZZER_OPEN' ||
      current.buzzedContestantId ||
      current.buzzerLockout[contestantId]
    ) {
      return;
    }
    const isAI = contestantId === 'coach' || (contestantId === 'analyst' && !player3Human);
    const name = contestantsRef.current[contestantId]?.name || 'Player';
    // AI answers quickly; mic-only answers get a little longer, so a missed word can be said again.
    const seconds = isAI ? TIMES.aiAnswer : answerMode === 'VOICE' ? TIMES.voiceAnswer : TIMES.humanAnswer;

    // Each seat's buzz-in sound plays from the effect that watches who buzzed (on the stream screen too).
    if (contestantId === 'player' && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
    if (contestantId === 'player') {
      setMatchStats((ms) => ({...ms, buzzerWins: ms.buzzerWins + 1}));
    }
    setContestants((c) => ({...c, [contestantId]: {...c[contestantId], reaction: 'buzzing'}}));

    commitClue({
      ...current,
      ...startCountdown(seconds, Date.now()),
      phase: 'ANSWERING',
      buzzedContestantId: contestantId,
      // A Who Am I? clue is worth what it was when they buzzed, before the next hint lowers it.
      ...(hintCount(current) ? {stakeAtBuzz: currentWorth(current)} : {}),
      buzzMs: Math.max(0, pressedAt - buzzersOpenedAtRef.current),
      feedbackText: isAI
        ? `${name} buzzed in!`
        : answerMode === 'VOICE'
        ? `${name}'s Turn! Say your answer!`
        : `${name}'s Turn! Select or type your answer!`,
    });
  };
  const awardBuzzRef = useRef(awardBuzz);
  awardBuzzRef.current = awardBuzz;

  // Phone: when this phone first showed the buzzer open for the current clue.
  const buzzerSeenRef = useRef<{clueId: string; at: number}>({clueId: '', at: 0});
  /** Phone: buzz in, with the reaction time since this phone showed the light (none if it hasn't yet). */
  const sendClientBuzz = (early = false) => {
    const seen = buzzerSeenRef.current;
    const clueId = activeClueRef.current?.clue.id;
    p2pRef.current?.send({
      type: 'CLIENT_BUZZ',
      contestantId: mySeat,
      timestamp: Date.now(),
      clueId,
      reactionMs: seen.clueId && seen.clueId === clueId ? Date.now() - seen.at : undefined,
      early,
    });
  };

  // Early buzzes on the open clue: when each player's short lockout ends.
  const earlyBuzzRef = useRef<{clueId: string; until: Partial<Record<ContestantId, number>>}>({clueId: '', until: {}});

  /** Any contestant buzzing in, human or AI. `pressedAt` is when they pressed, on the host's clock. */
  const registerBuzz = (contestantId: ContestantId, pressedAt: number) => {
    const current = activeClueRef.current;
    if (!current || current.phase !== 'BUZZER_OPEN' || current.buzzedContestantId || current.buzzerLockout[contestantId]) return;
    const clueId = current.clue.id;
    const early = earlyBuzzRef.current;
    if (early.clueId === clueId && inEarlyBuzzLockout(pressedAt, early.until[contestantId])) return;

    // Everyone on this device: first come, first served.
    if (Object.keys(remoteSeatsRef.current).length === 0) {
      awardBuzz(contestantId, clueId, pressedAt);
      return;
    }

    const pending = pendingBuzzesRef.current;
    if (pending.some((b) => b.id === contestantId)) return;
    pending.push({id: contestantId, at: pressedAt, clueId});
    if (buzzWindowRef.current) return;
    buzzWindowRef.current = setTimeout(() => {
      buzzWindowRef.current = null;
      const entries = pendingBuzzesRef.current.filter((b) => b.clueId === clueId);
      pendingBuzzesRef.current = [];
      if (!entries.length) return;
      const first = entries.reduce((a, b) => (b.at < a.at ? b : a));
      awardBuzzRef.current(first.id, first.clueId, first.at);
    }, BUZZ_WINDOW_MS);
  };
  const registerBuzzRef = useRef(registerBuzz);
  registerBuzzRef.current = registerBuzz;

  // Host handling of a human buzz (Player 1 here, or a friend's phone)
  const handleContestantBuzz = (contestantId: 'player' | RemoteSeat, pressedAt = Date.now()) => {
    if (!activeClue) return;

    // Buzzing before the light: an error sound and a short lockout, as on TV.
    if (activeClue.phase === 'READING') {
      gameAudio.playErrorBuzz();
      const early = earlyBuzzRef.current;
      if (early.clueId !== activeClue.clue.id) earlyBuzzRef.current = {clueId: activeClue.clue.id, until: {}};
      earlyBuzzRef.current.until[contestantId] = pressedAt + EARLY_BUZZ_LOCKOUT_MS;
      return;
    }

    registerBuzz(contestantId, pressedAt);
  };

  // Score an answer to the open clue (a person's, an AI's, or a timeout) and move the clue on.
  const applyAnswer = (who: ContestantId, correct: boolean, how: AnswerHow) => {
    const prev = activeClueRef.current;
    if (!prev || prev.phase !== 'ANSWERING' || prev.buzzedContestantId !== who) return;
    const stake = clueStake(prev);

    if (correct) {
      gameAudio.playCoinPickup();
      if (prev.isBonusWager && how.kind === 'player') {
        gameAudio.playLevelUpStinger();
        setMatchStats((ms) => ({...ms, bonusWagersHit: ms.bonusWagersHit + 1}));
      }
      // Whoever answers correctly gets control of the board.
      setActiveSelector(who);
      setBigPlay((b) =>
        b && b.amount >= stake ? b : {who, amount: stake, dailyDouble: prev.isBonusWager, category: prev.clue.category}
      );
    } else {
      gameAudio.playErrorBuzz();
    }
    if (who === 'player') {
      const before = contestantsRef.current.player.score;
      setMatchStats((ms) =>
        correct
          ? {...ms, playerCorrect: ms.playerCorrect + 1, highestScore: Math.max(ms.highestScore, before + stake)}
          : {...ms, playerWrong: ms.playerWrong + 1}
      );
    }
    // Daily Doubles have no buzz race, so they don't count toward Quick Draw.
    const awardHow = {buzzMs: prev.isBonusWager ? undefined : prev.buzzMs, byVoice: how.kind === 'player' && how.byVoice};
    setContestants((c) =>
      updateStreaks({...c, [who]: trackAnswer(scoreAnswer(c[who], stake, correct, prev.isBonusWager), correct, prev.clue, awardHow)}, who, correct)
    );

    const name = contestantsRef.current[who]?.name || (how.kind === 'ai' ? 'Opponent' : 'Player');
    commitClue(resolveAnswer(prev, who, correct, how, {name, buzzerSeats, now: Date.now()}));
  };
  const applyAnswerRef = useRef(applyAnswer);
  applyAnswerRef.current = applyAnswer;

  // Host: a person answered (Player 1 here, or a friend's phone).
  const handleContestantSubmitAnswer = (answer: string, answeringId: 'player' | RemoteSeat, spokenGuesses?: string[]) => {
    const current = activeClueRef.current;
    if (!current || current.phase !== 'ANSWERING' || current.buzzedContestantId !== answeringId) return;
    const threshold = SETTINGS.fuzzyMatchThreshold;
    // Phones don't get the answer, so they send all the recognizer's guesses and the host picks.
    if (spokenGuesses?.length && isOpenAnswerMode(answerMode)) {
      answer = pickSpokenTypedAnswer(spokenGuesses, current.clue, threshold) || answer;
    }
    const isCorrect = isOpenAnswerMode(answerMode)
      ? checkTypedAnswer(answer, current.clue, threshold)
      : answer.trim().toLowerCase() === current.clue.correctAnswer.trim().toLowerCase();
    applyAnswer(answeringId, isCorrect, {kind: 'player', answer, byVoice: spokenGuesses !== undefined});
  };

  // P2P Message Dispatcher for Host & Client
  const handleP2PMessage = useCallback(
    (msg: P2PMessage, fromPeerId: string) => {
      // 1. Host receives events from friends' phones
      if (deviceRole === 'HOST') {
        if (msg.type === 'SCREEN_JOIN') {
          if (screenPeersRef.current.has(fromPeerId)) return;
          screenPeersRef.current.add(fromPeerId);
          setScreenCount(screenPeersRef.current.size);
          showToast('📺 Stream screen connected');
          return;
        }
        if (msg.type === 'CLIENT_JOIN') {
          let seats = remoteSeatsRef.current;
          if (seats[fromPeerId]) return;
          // A phone that reloaded comes back before its old connection is noticed as gone:
          // the same device id as a seated phone means it replaces that connection. Names
          // aren't enough here, since two friends can easily share the default name.
          const seatDevices = seatDevicesRef.current;
          const stalePeer = Object.keys(seats).find(
            (peerId) => msg.deviceId && seatDevices[seats[peerId]] === msg.deviceId
          );
          if (stalePeer) {
            const staleSeat = seats[stalePeer];
            seats = {...seats};
            delete seats[stalePeer];
            remoteSeatsRef.current = seats;
            // Kept as away under its current name, so the phone gets its seat and name back below.
            const nextAway = {...awaySeatsRef.current, [staleSeat]: contestantsRef.current[staleSeat].name};
            awaySeatsRef.current = nextAway;
            p2pRef.current?.disconnectPeer(stalePeer);
          }
          const taken = new Set(Object.values(seats));
          const away = awaySeatsRef.current;
          const awayList = (Object.keys(away) as RemoteSeat[]).filter((s) => !taken.has(s));
          // A dropped friend gets their own seat back (matched by device, then by name), a new
          // friend gets an empty seat, and an unnamed phone fills an away seat when nothing else is left.
          const seat =
            awayList.find((s) => msg.deviceId && seatDevices[s] === msg.deviceId) ||
            awayList.find((s) => msg.playerName && away[s] === msg.playerName) ||
            remoteSeatsFor(hostPlaysRef.current).find((s) => !taken.has(s) && away[s] === undefined) ||
            awayList[0];
          if (!seat) {
            showToast('The room is full (3 players max).');
            p2pRef.current?.send({type: 'ROOM_FULL'}, fromPeerId);
            p2pRef.current?.disconnectPeer(fromPeerId);
            return;
          }
          // Pool what this phone has been shown with what the host has, and hand the group's
          // history back, so recently seen questions are held back whichever device hosts next.
          if (mergeHistory(msg.history)) setSeenCountRefresh((c) => c + 1);
          p2pRef.current?.send({type: 'QUESTION_HISTORY', history: exportHistory()}, fromPeerId);
          const next = {...seats, [fromPeerId]: seat};
          remoteSeatsRef.current = next;
          if (msg.deviceId) seatDevicesRef.current = {...seatDevices, [seat]: msg.deviceId};
          setRemoteSeats(next);
          setIsClientConnected(true);
          setIsTwoPlayerMode(true);
          const label = seatLabel(seat);
          const rejoined = away[seat] !== undefined;
          // A phone coming back keeps the name it had (including a " 2" added to tell two Friends apart).
          const wanted = (rejoined && away[seat]) || msg.playerName || `Friend (${label})`;
          // Two phones with the same name get their seat added, so the scoreboard tells them apart.
          const nameTaken = (Object.keys(contestantsRef.current) as (keyof typeof contestantsRef.current)[]).some(
            (id) => id !== seat && contestantsRef.current[id].name === wanted
          );
          const name = nameTaken && !rejoined ? `${wanted} ${label.slice(1)}` : wanted;
          if (rejoined) {
            const nextAway = {...away};
            delete nextAway[seat];
            awaySeatsRef.current = nextAway;
            setAwaySeats(nextAway);
          }
          showToast(rejoined ? `${name} is back as ${label}!` : `🎉 ${name} joined on their phone as ${label}!`);
          gameAudio.playConfirmSelect();
          setContestants((prev) => ({
            ...prev,
            [seat]: {...prev[seat], name, shortName: label, title: 'Online Challenger'},
          }));
          return;
        }

        // Every other message must come from a seated friend, and only acts for that seat.
        const seat = remoteSeatsRef.current[fromPeerId];
        if (!seat) return;

        switch (msg.type) {
          case 'CLIENT_BUZZ': {
            // Timed from when that phone showed the light, so the host's own player has no head start.
            const current = activeClueRef.current;
            // A tap made before the light is an early buzz even if it arrives after the buzzers opened,
            // the same as on the host device. The phone already locked itself out for a moment.
            if (msg.early) {
              if (current?.phase === 'READING') handleContestantBuzz(seat, Date.now());
              break;
            }
            const sameOpening = current?.phase === 'BUZZER_OPEN' && msg.clueId === current.clue.id;
            handleContestantBuzz(
              seat,
              remoteBuzzTime(buzzersOpenedAtRef.current, Date.now(), p2pRef.current?.oneWayDelayMs(fromPeerId) ?? 0, sameOpening ? msg.reactionMs : undefined)
            );
            break;
          }

          case 'CLIENT_ANSWER':
            handleContestantSubmitAnswer(msg.answer, seat, msg.alternatives);
            break;

          case 'CLIENT_SELECT_CLUE':
            if (activeSelector === seat) {
              selectClue(msg.catIdx, msg.clueIdx, seat);
            }
            break;

          case 'CLIENT_SET_WAGER':
          {
            const prev = activeClueRef.current;
            if (!prev || !prev.isBonusWager || prev.bonusSelectingPlayerId !== seat || prev.bonusWagerLocked) break;
            const wager = clampDailyDoubleWager(msg.wager, roundMaxClue, contestants[seat]?.score || 0);
            if (!msg.lockIn) {
              commitClue({...prev, bonusWagerInput: wager});
              break;
            }
            gameAudio.playConfirmSelect();
            commitClue({
              ...prev,
              ...dailyDoubleClock(prev.clue, Date.now()),
              bonusWagerInput: wager,
              bonusWagerLocked: true,
              feedbackText: `${contestants[seat]?.name || seatLabel(seat)} locked wager at $${wager.toLocaleString()}! Provide answer.`,
            });
            break;
          }

          case 'CLIENT_FINAL_WAGER': {
            if (finalShowdownPhase !== 'WAGER' || finalLocks.wager[seat]) break;
            const wager = clampFinalWager(msg.wager, contestants[seat]?.score || 0);
            if (seat === 'player') setPlayerFinalWager(wager);
            else if (seat === 'player2') setPlayer2FinalWager(wager);
            else setPlayer3FinalWager(wager);
            if (msg.lockIn) setFinalLocks((l) => ({...l, wager: {...l.wager, [seat]: true}}));
            break;
          }

          case 'CLIENT_FINAL_ANSWER':
            if (finalShowdownPhase !== 'CLUE' || finalLocks.answer[seat]) break;
            if (seat === 'player') setFinalPlayerInput(msg.answer);
            else if (seat === 'player2') setFinalPlayer2Input(msg.answer);
            else setFinalPlayer3Input(msg.answer);
            if (msg.lockIn) setFinalLocks((l) => ({...l, answer: {...l.answer, [seat]: true}}));
            break;

          default:
            break;
        }
      }

      // 2. Phones and stream screens receive state updates from Host
      if (deviceRole !== 'HOST') {
        if (msg.type === 'QUESTION_HISTORY') {
          if (mergeHistory(msg.history)) setSeenCountRefresh((c) => c + 1);
          return;
        }
        if (msg.type === 'ROOM_FULL') {
          setP2PStatus('error');
          setP2PDetail(
            'This room already has 3 players. To play on this phone, open the game link on it (without scanning) and host from here instead.'
          );
          showToast('This room is full (3 players max).');
          p2pRef.current?.destroy();
          return;
        }
        if (msg.type === 'STATE_SYNC') {
          const s = msg.payload;
          if (s.seats) {
            const mine = s.seats[p2pRef.current?.peerId ?? ''];
            if (mine) setMySeat(mine);
            setRemoteSeats(s.seats);
          }
          if (s.gameState) setGameState(s.gameState);
          if (s.currentRound) setCurrentRound(s.currentRound);
          if (s.round1Board) setRound1Board(s.round1Board);
          if (s.round2Board) setRound2Board(s.round2Board);
          if (s.answeredClueIds) setAnsweredClueIds(new Set(s.answeredClueIds));
          if (s.activeSelector) setActiveSelector(s.activeSelector);
          if (s.contestants) setContestants(s.contestants);
          if (s.activeClue !== undefined) {
            setActiveClue(s.activeClue && countdownFromSync(s.activeClue, Date.now()));
            // Note when this phone first shows the buzzer open, to time the player's reaction from then.
            const open = s.activeClue?.phase === 'BUZZER_OPEN';
            const seen = buzzerSeenRef.current;
            if (!open) buzzerSeenRef.current = {clueId: '', at: 0};
            else if (seen.clueId !== s.activeClue.clue.id) buzzerSeenRef.current = {clueId: s.activeClue.clue.id, at: Date.now()};
          }
          if (s.difficulty) setDifficulty(s.difficulty);
          if (s.answerMode) setAnswerMode(s.answerMode);
          if (s.finalClue) setFinalClue(s.finalClue);
          if (s.finalShowdownPhase) setFinalShowdownPhase(s.finalShowdownPhase);
          if (s.finalTimer) setFinalTimer(countdownFromSync(s.finalTimer, Date.now()));
          if (s.finalLocks) setFinalLocks(s.finalLocks);
          if (s.finalOptions) setFinalOptions(s.finalOptions);
          if (s.readAloud !== undefined) setReadAloudState(s.readAloud);
          if (s.voiceSpeed) {
            setSpeechSpeed(s.voiceSpeed, false);
            setVoiceSpeedState(s.voiceSpeed);
          }
          if (s.gameLength) setGameLength(s.gameLength);
          if (s.season) setSeasonRows(s.season);
          if (s.lineup) setSyncedLineup(s.lineup);
          if (s.bigPlay !== undefined) setBigPlay(s.bigPlay);
          if (s.categoryIntro !== undefined) setCategoryIntro(s.categoryIntro);
          if (s.finalReveal !== undefined) setFinalReveal(s.finalReveal);
          if (s.aiPickingTile !== undefined) setAiPickingTile(s.aiPickingTile);
          if (s.aiThinkingStatus !== undefined) setAiThinkingStatus(s.aiThinkingStatus);
        }
      }
    },
    [deviceRole, handleContestantBuzz, handleContestantSubmitAnswer, activeSelector, selectClue, showToast, contestants, currentRound, roundMaxClue, finalShowdownPhase, finalLocks]
  );

  // The connection lives as long as the room. It reads the latest handler through a ref
  // instead of tearing down and reconnecting every time game state changes.
  const handleP2PMessageRef = useRef(handleP2PMessage);
  handleP2PMessageRef.current = handleP2PMessage;

  // Initialize P2P Connection Manager
  useEffect(() => {
    if (p2pRef.current) {
      p2pRef.current.destroy();
      p2pRef.current = null;
    }

    const role = deviceRole === 'HOST' ? 'host' : 'client';
    screenPeersRef.current = new Set();
    setScreenCount(0);
    const name = playerNameRef.current;
    const mgr = new P2PConnectionManager(
      roomCode,
      role,
      {
        onMessage: (msg, fromPeerId) => handleP2PMessageRef.current(msg, fromPeerId),
        onStatus: (status, detail) => {
          setP2PStatus(status);
          if (detail) setP2PDetail(detail);
          if (status === 'connected' && role === 'client') {
            setIsClientConnected(true);
          } else if (status === 'disconnected' && (role === 'client' || gameStatusRef.current !== 'PLAYING')) {
            // A host mid-match keeps its lineup so friends can rejoin their seats.
            setIsClientConnected(false);
          }
        },
        onPeerLeft: (peerId) => {
          if (screenPeersRef.current.delete(peerId)) {
            setScreenCount(screenPeersRef.current.size);
            showToast('📺 Stream screen disconnected');
            return;
          }
          const seats = {...remoteSeatsRef.current};
          const seat = seats[peerId];
          if (!seat) return;
          delete seats[peerId];
          remoteSeatsRef.current = seats;
          setRemoteSeats(seats);
          if (gameStatusRef.current === 'PLAYING') {
            const nextAway = {...awaySeatsRef.current, [seat]: contestantsRef.current[seat].name};
            awaySeatsRef.current = nextAway;
            setAwaySeats(nextAway);
            showToast(`${seatLabel(seat)} disconnected. They can rejoin with the same room code.`);
          } else {
            showToast(`${seatLabel(seat)} disconnected.`);
            // A stream screen can keep the room open after the last friend leaves the lobby.
            if (Object.keys(seats).length === 0) setIsClientConnected(false);
          }
          if (seat === 'analyst') {
            // Stats Riley (AI) takes the third seat back over.
            setContestants((prev) => ({
              ...prev,
              analyst: {...prev.analyst, name: 'Stats Riley', shortName: 'Riley', title: 'Analytics Guru'},
            }));
          }
        },
      },
      name && name !== 'Champion' ? name : undefined,
      deviceRole === 'SCREEN' ? 'screen' : 'player'
    );

    p2pRef.current = mgr;
    // Lets the browser tests cut a phone's connection to check that it reconnects.
    if (import.meta.env.DEV) (window as unknown as {__p2p?: P2PConnectionManager}).__p2p = mgr;

    return () => {
      mgr.destroy();
    };
  }, [roomCode, deviceRole, showToast]);

  // Host sends STATE_SYNC broadcasts to joined friends in two parts. The boards and settings
  // (most of the data) only go out when they change or someone joins. The live part goes out on
  // whenever play moves on. Clocks aren't sent each tick: phones get how long is left and count down themselves.
  useEffect(() => {
    if (deviceRole !== 'HOST' || !p2pRef.current) return;
    // Phones only need each tile's value; answers and Daily Double spots stay on the host.
    const tilesOnly = (board: TriviaCategory[]) =>
      board.map((cat) => ({...cat, clues: cat.clues.map((q) => ({id: q.id, value: q.value, category: q.category}))}));
    p2pRef.current.send({
      type: 'STATE_SYNC',
      payload: {
        round1Board: tilesOnly(round1Board),
        round2Board: tilesOnly(round2Board),
        difficulty,
        answerMode,
        // The Final's answer goes out once every player's result has been revealed.
        finalClue: finalClue && (finalShowdownPhase === 'RESULTS' && !finalReveal ? finalClue : hideAnswer(finalClue)),
        finalOptions,
        seats: remoteSeats,
        readAloud,
        voiceSpeed,
        gameLength,
        season: seasonRows.slice(0, 8),
      },
    });
  }, [deviceRole, round1Board, round2Board, difficulty, answerMode, finalClue, finalOptions, finalShowdownPhase === 'RESULTS' && !finalReveal, remoteSeats, readAloud, voiceSpeed, gameLength, screenCount, seasonRows]);

  useEffect(() => {
    if (deviceRole !== 'HOST' || !p2pRef.current) return;
    p2pRef.current.send({
      type: 'STATE_SYNC',
      payload: {
        gameState,
        currentRound,
        answeredClueIds: Array.from(answeredClueIds),
        activeSelector,
        contestants,
        activeClue:
          activeClue &&
          countdownForSync(activeClue.phase !== 'REVEALED' ? {...activeClue, clue: hideAnswer(activeClue.clue)} : activeClue, Date.now()),
        finalShowdownPhase,
        finalTimer: countdownForSync(finalTimer, Date.now()),
        finalLocks,
        lineup: activeContestantsList,
        bigPlay,
        aiPickingTile,
        aiThinkingStatus,
        categoryIntro,
        finalReveal,
      },
    });
  }, [
    deviceRole,
    gameState,
    currentRound,
    answeredClueIds,
    activeSelector,
    contestants,
    activeClue,
    finalShowdownPhase,
    finalTimer,
    finalLocks,
    remoteSeats,
    screenCount,
    activeContestantsList,
    bigPlay,
    aiPickingTile,
    aiThinkingStatus,
    categoryIntro,
    finalReveal,
  ]);

  // AI Board Selection turn logic when it's Coach or Analyst's turn to pick
  useEffect(() => {
    if (
      deviceRole !== 'HOST' ||
      gameState.status !== 'PLAYING' ||
      activeClue ||
      categoryIntro ||
      currentRound === 'FINAL_SHOWDOWN' ||
      isGameMenuOpen ||
      isHowToPlayOpen ||
      isInviteModalOpen ||
      isLeaderboardOpen ||
      isTagEditorOpen
    ) {
      return;
    }

    if (
      activeSelector === 'player' ||
      ((isTwoPlayerMode || isClientConnected) && activeSelector === 'player2') ||
      (player3Human && activeSelector === 'analyst')
    ) {
      return; // Human turn to pick
    }

    const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
    if (!board.length) return;

    // Find all unrevealed clues
    const availableClues: {catIdx: number; clueIdx: number; value: number; category: string}[] = [];
    board.forEach((cat, cIdx) => {
      cat.clues.forEach((clue, rIdx) => {
        if (!answeredClueIds.has(clue.id)) {
          availableClues.push({catIdx: cIdx, clueIdx: rIdx, value: clue.value, category: cat.title});
        }
      });
    });

    if (availableClues.length === 0) return;

    const pickerName = contestants[activeSelector]?.name || 'Opponent';
    setAiThinkingStatus(`${pickerName} is selecting a clue from the board...`);

    let chosen = availableClues[Math.floor(Math.random() * availableClues.length)];
    if (activeSelector === 'coach') {
      // The coach plays it safe and usually works down from the cheapest clues.
      const lowest = Math.min(...availableClues.map((c) => c.value));
      const safe = availableClues.filter((c) => c.value === lowest);
      if (Math.random() < 0.7) {
        chosen = safe[Math.floor(Math.random() * safe.length)];
      }
    } else if (activeSelector === 'analyst') {
      const highVal = availableClues.filter((c) => c.value >= 800 || c.category.includes('RECORD'));
      if (highVal.length > 0 && Math.random() < 0.75) {
        chosen = highVal[Math.floor(Math.random() * highVal.length)];
      }
    }

    const highlightTimer = setTimeout(() => {
      setAiPickingTile({catIdx: chosen.catIdx, clueIdx: chosen.clueIdx});
      gameAudio.playHoverMicroTone();
    }, 700);

    const selectTimer = setTimeout(() => {
      setAiPickingTile(null);
      setAiThinkingStatus(null);
      selectClue(chosen.catIdx, chosen.clueIdx, activeSelector);
    }, 1500);

    return () => {
      clearTimeout(highlightTimer);
      clearTimeout(selectTimer);
    };
  }, [
    deviceRole,
    activeSelector,
    activeClue,
    gameState.status,
    currentRound,
    round1Board,
    round2Board,
    answeredClueIds,
    isTwoPlayerMode,
    isClientConnected,
    isGameMenuOpen,
    isHowToPlayOpen,
    isInviteModalOpen,
    isLeaderboardOpen,
    isTagEditorOpen,
    contestants,
    selectClue,
    player3Human,
    categoryIntro,
  ]);

  // Clocks stop while a menu is open on the host.
  const clocksPaused =
    gameState.status !== 'PLAYING' || isGameMenuOpen || isHowToPlayOpen || isInviteModalOpen || isLeaderboardOpen || isTagEditorOpen;

  // Category reveal: when clues are read aloud, each round opens with its columns revealed one
  // at a time and read out, so listeners know the board before play starts. The host paces it
  // by how long each line takes to say.
  const currentBoard = currentRound === 'ROUND_1' ? round1Board : currentRound === 'CHAMPIONSHIP' ? round2Board : [];
  useEffect(() => {
    if (deviceRole !== 'HOST' || gameState.status !== 'PLAYING' || !readAloud || !currentBoard.length) return;
    if (currentRound !== 'ROUND_1' && currentRound !== 'CHAMPIONSHIP') return;
    if (introducedRoundsRef.current.has(currentRound) || activeClue) return;
    introducedRoundsRef.current.add(currentRound);
    setCategoryIntro({round: currentRound, shown: 0});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceRole, gameState.status, readAloud, currentRound, currentBoard.length]);

  useEffect(() => {
    if (deviceRole !== 'HOST' || !categoryIntro || clocksPaused) return;
    const {shown} = categoryIntro;
    // The opening line plays before the first column; each column then stays up while it's read.
    const lines = categoryIntroLines(categoryIntro.round, currentBoard);
    const wait = shown === 0 ? 0.6 : readingSeconds(lines[shown - 1] ?? '', 1.8, speechRate());
    const timer = setTimeout(() => {
      setCategoryIntro((ci) => (!ci ? ci : ci.shown >= currentBoard.length ? null : {...ci, shown: ci.shown + 1}));
    }, wait * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceRole, categoryIntro, clocksPaused]);

  const skipCategoryIntro = () => {
    if (deviceRole !== 'HOST') return;
    stopSpeaking();
    setCategoryIntro(null);
  };

  // Host: when the open clue's clock runs out, move it to the next phase.
  const onClueTimeUp = () => {
    const prev = activeClueRef.current;
    if (!prev || prev.endsAt === null) return;
    const step = clueTimeUp(prev, SETTINGS.questionTimeLimit, Date.now());
    if (step.kind === 'buzzers-open') {
      gameAudio.playHoverMicroTone();
      commitClue(step.next);
    } else if (step.kind === 'nobody-buzzed') {
      gameAudio.playErrorBuzz();
      commitClue(step.next);
    } else if (step.kind === 'answer-timed-out') {
      applyAnswer(step.who, false, {kind: 'timeout'});
    } else {
      // The answer has been shown long enough: back to the board.
      setAnsweredClueIds((ids) => new Set([...ids, prev.clue.id]));
      setMatchStats((ms) => ({...ms, totalQuestions: ms.totalQuestions + 1}));
      setContestants((c) => ({
        coach: {...c.coach, reaction: 'idle'},
        player: {...c.player, reaction: 'idle'},
        analyst: {...c.analyst, reaction: 'idle'},
        player2: {...c.player2, reaction: 'idle'},
      }));
      commitClue(null);
    }
  };
  const onClueTimeUpRef = useRef(onClueTimeUp);
  onClueTimeUpRef.current = onClueTimeUp;

  // Host: one timeout for the end of the clue's current clock, instead of ticking ten times a second.
  useEffect(() => {
    if (deviceRole !== 'HOST' || clocksPaused || !activeClue || activeClue.endsAt === null) return;
    const timeout = setTimeout(() => onClueTimeUpRef.current(), Math.max(0, activeClue.endsAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [deviceRole, clocksPaused, activeClue?.endsAt]);

  // Host: freeze the running clocks when a menu opens and restart them where they were when it closes.
  // A Daily Double waiting for its wager is frozen on purpose, so only clocks this paused are restarted.
  const pausedClueIdRef = useRef<string | null>(null);
  const pausedFinalRef = useRef(false);
  useEffect(() => {
    if (deviceRole !== 'HOST') return;
    const now = Date.now();
    const current = activeClueRef.current;
    if (clocksPaused) {
      stopSpeaking();
      if (current && current.endsAt !== null) {
        pausedClueIdRef.current = current.clue.id;
        commitClue(pauseCountdown(current, now));
      }
      setFinalTimer((t) => {
        if (t.endsAt === null) return t;
        pausedFinalRef.current = true;
        return pauseCountdown(t, now);
      });
      return;
    }
    if (current && current.endsAt === null && pausedClueIdRef.current === current.clue.id) {
      commitClue(resumeCountdown(current, now));
    }
    pausedClueIdRef.current = null;
    if (pausedFinalRef.current) {
      pausedFinalRef.current = false;
      setFinalTimer((t) => resumeCountdown(t, now));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceRole, clocksPaused]);

  // AI Buzzer Simulation when BUZZER_OPEN (Host only)
  useEffect(() => {
    if (deviceRole !== 'HOST' || !activeClue || activeClue.phase !== 'BUZZER_OPEN' || activeClue.isBonusWager) return;

    // Each AI decides once per clue whether it knows this one: it only buzzes when it thinks so,
    // and harder clues outside its specialty make that less likely.
    const {clue} = activeClue;
    const chance = (who: 'coach' | 'analyst') => aiCorrectChance(who === 'coach' ? aiConfig.coachAcc : aiConfig.analystAcc, who, clue.difficulty, clue.categoryId);
    const knows = (who: 'coach' | 'analyst') => Math.random() < aiBuzzChance(chance(who));
    const coachCanBuzz = !isTwoPlayerMode && !isClientConnected && !activeClue.buzzerLockout.coach && knows('coach');
    const analystCanBuzz = !player3Human && !activeClue.buzzerLockout.analyst && knows('analyst');

    const reflexMult = SETTINGS.aiReflexSpeedMultiplier;
    // On a Who Am I? clue an AI never buzzes on the first hint, and waits for a later hint
    // (plus a moment to read it) before its usual reaction time, so a human gets a fair shot.
    const hints = hintCount(activeClue);
    const hintWait = (who: 'coach' | 'analyst') => (hints ? aiWhoAmIWaitMs(hints, activeClue.hintsShown ?? 1, chance(who)) : 0);
    const coachDelay = (aiConfig.coachSpeed + (Math.random() * 1.2 - 0.4)) * 1000 * reflexMult + hintWait('coach');
    const analystDelay = (aiConfig.analystSpeed + (Math.random() * 1.2 - 0.4)) * 1000 * reflexMult + hintWait('analyst');

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    if (coachCanBuzz) {
      timeouts.push(setTimeout(() => registerBuzzRef.current('coach', Date.now()), Math.max(300, coachDelay)));
    }

    if (analystCanBuzz) {
      timeouts.push(setTimeout(() => registerBuzzRef.current('analyst', Date.now()), Math.max(300, analystDelay)));
    }

    return () => {
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [deviceRole, activeClue?.phase, activeClue?.buzzerLockout, activeClue?.isBonusWager, aiConfig, isTwoPlayerMode, isClientConnected, player3Human]);

  // Who Am I?: while the buzzers are open, a new hint shows every few seconds and the tile is worth less.
  useEffect(() => {
    if (deviceRole !== 'HOST' || !activeClue || activeClue.phase !== 'BUZZER_OPEN' || activeClue.endsAt === null) return;
    const total = hintCount(activeClue);
    const shown = activeClue.hintsShown ?? 1;
    if (!total || shown >= total) return;
    const clueId = activeClue.clue.id;
    const timer = setTimeout(() => {
      const prev = activeClueRef.current;
      if (!prev || prev.clue.id !== clueId || prev.phase !== 'BUZZER_OPEN') return;
      const next = {...prev, hintsShown: (prev.hintsShown ?? 1) + 1};
      commitClue({...next, feedbackText: `New hint! Now worth $${currentWorth(next).toLocaleString()}.`});
    }, HINT_SECONDS * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceRole, activeClue?.clue.id, activeClue?.phase, activeClue?.hintsShown, activeClue?.endsAt === null]);

  // AI Answering logic when Coach or Analyst is answering (Host only, only once clue is revealed!)
  useEffect(() => {
    if (
      deviceRole !== 'HOST' ||
      !activeClue ||
      activeClue.phase !== 'ANSWERING' ||
      (activeClue.isBonusWager && !activeClue.bonusWagerLocked)
    ) {
      return;
    }
    const buzzedId = activeClue.buzzedContestantId;
    if (buzzedId !== 'coach' && buzzedId !== 'analyst') return;
    if (buzzedId === 'analyst' && player3Human) return;

    const isCoach = buzzedId === 'coach';
    const clueNow = activeClue.clue;
    const accuracy = aiCorrectChance(isCoach ? aiConfig.coachAcc : aiConfig.analystAcc, buzzedId, clueNow.difficulty, clueNow.categoryId);
    const isCorrect = Math.random() < accuracy;
    const thinkTime = 1400 + Math.random() * 1200;

    const timer = setTimeout(() => {
      const clue = activeClue.clue;
      // A wrong AI answer is one of the choices everyone else can see.
      const wrongChoices = activeClue.options.length
        ? activeClue.options.filter((o) => o !== clue.correctAnswer)
        : clue.distractors;
      const answer = isCorrect
        ? clue.correctAnswer
        : wrongChoices[Math.floor(Math.random() * wrongChoices.length)] || 'no idea';
      applyAnswerRef.current(buzzedId, isCorrect, {kind: 'ai', answer});
    }, thinkTime);

    return () => clearTimeout(timer);
  }, [deviceRole, activeClue?.phase, activeClue?.buzzedContestantId, activeClue?.isBonusWager, activeClue?.bonusWagerLocked, aiConfig, player3Human]);

  // Each seat's own buzz-in sound, on the host and on a stream screen (phones just vibrate).
  useEffect(() => {
    if (deviceRole === 'CLIENT' || !activeClue || activeClue.phase !== 'ANSWERING' || activeClue.isBonusWager) return;
    if (activeClue.buzzedContestantId) gameAudio.playBuzzIn(activeClue.buzzedContestantId);
    // Only when someone new buzzes in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceRole, activeClue?.clue.id, activeClue?.buzzedContestantId]);

  // Reading aloud happens on one device: the stream screen if one is watching, otherwise the host.
  const speaksHere =
    readAloud && isSpeechSupported && (deviceRole === 'SCREEN' || (deviceRole === 'HOST' && screenCount === 0));

  // Host: once the clue has been read, the buzzers light up a moment later instead of waiting
  // out the estimated reading time.
  const openBuzzersAfterReading = (clueId: string) => {
    const prev = activeClueRef.current;
    if (deviceRole !== 'HOST' || !prev || prev.clue.id !== clueId || prev.phase !== 'READING' || prev.endsAt === null) return;
    const beat = 250;
    if (prev.endsAt - Date.now() > beat) commitClue({...prev, ...startCountdown(beat / 1000, Date.now())});
  };
  const openBuzzersAfterReadingRef = useRef(openBuzzersAfterReading);
  openBuzzersAfterReadingRef.current = openBuzzersAfterReading;

  // Read the clue when it opens (a Daily Double once the wager is in), stop when someone buzzes,
  // and say the answer when it is shown.
  useEffect(() => {
    if (!speaksHere || !activeClue) return;
    const {clue, phase} = activeClue;
    if (phase === 'READING') {
      speak(spokenClue(clue, shownClueText(activeClue)), () => openBuzzersAfterReadingRef.current(clue.id));
    } else if (phase === 'ANSWERING' && activeClue.isBonusWager) {
      if (activeClue.bonusWagerLocked) speak([{text: 'Here is your Daily Double.', hype: true}, clue.clue]);
    } else if (phase === 'ANSWERING') {
      stopSpeaking();
    } else if (phase === 'REVEALED' && clue.correctAnswer) {
      // A player on a hot streak gets a shout-out after the answer.
      const who = activeClue.buzzedContestantId;
      const hot = who && streakLine(contestants[who].name, contestants[who].streak || 0);
      speak(hot ? [{text: answerLine(clue.correctAnswer), hype: true}, {text: hot, hype: true}] : {text: answerLine(clue.correctAnswer), hype: true});
    }
    // Only when the clue moves to a new phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaksHere, activeClue?.clue.id, activeClue?.phase, activeClue?.bonusWagerLocked]);

  // The newest hint is read out as it appears.
  useEffect(() => {
    if (!speaksHere || !activeClue || activeClue.phase !== 'BUZZER_OPEN' || !hintCount(activeClue)) return;
    const shown = activeClue.hintsShown ?? 1;
    if (shown > 1) speak(activeClue.clue.hints![shown - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaksHere, activeClue?.clue.id, activeClue?.hintsShown]);

  // Read each column out as the category reveal shows it.
  useEffect(() => {
    if (!speaksHere || !categoryIntro || categoryIntro.shown === 0) return;
    const line = categoryIntroLines(categoryIntro.round, currentBoard)[categoryIntro.shown - 1];
    if (line) speak({text: line, hype: categoryIntro.shown === 1});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaksHere, categoryIntro?.round, categoryIntro?.shown]);

  // The Final Showdown clue is read when it is revealed, and its answer at the results.
  useEffect(() => {
    if (!speaksHere || currentRound !== 'FINAL_SHOWDOWN' || !finalClue) return;
    if (finalShowdownPhase === 'CLUE') speak(spokenFinal(finalClue));
    else if (finalShowdownPhase === 'RESULTS' && !finalReveal && finalClue.correctAnswer) speak({text: answerLine(finalClue.correctAnswer), hype: true});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaksHere, currentRound, finalShowdownPhase, finalClue?.id, finalClue?.correctAnswer, Boolean(finalReveal)]);

  // Each player's Final answer and wager is read as it's revealed.
  useEffect(() => {
    if (!speaksHere || !finalReveal || finalReveal.shown === 0) return;
    const id = finalReveal.order[finalReveal.shown - 1];
    speak({text: finalRevealLine(contestants[id]), hype: true});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaksHere, finalReveal?.shown]);

  // Spacebar, Enter, number (1-8), and letter (A-H) shortcuts for buzzing and answering
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (deviceRole === 'SCREEN' || document.activeElement?.tagName === 'INPUT') return;
      if (!activeClue) return;

      // When answering in Multiple Choice (4-choice or 8-choice mode)
      if (
        activeClue.phase === 'ANSWERING' &&
        (!activeClue.isBonusWager || activeClue.bonusWagerLocked) &&
        !isOpenAnswerMode(answerMode)
      ) {
        const key = e.key.toUpperCase();
        const num = parseInt(e.key, 10);
        let chosenIdx = -1;

        if (!isNaN(num) && num >= 1 && num <= activeClue.options.length) {
          chosenIdx = num - 1;
        } else if (['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(key)) {
          chosenIdx = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].indexOf(key);
        }

        if (chosenIdx >= 0 && chosenIdx < activeClue.options.length) {
          const selectedAnswer = activeClue.options[chosenIdx];
          if (deviceRole === 'CLIENT' && activeClue.buzzedContestantId === mySeat) {
            e.preventDefault();
            p2pRef.current?.send({
              type: 'CLIENT_ANSWER',
              contestantId: mySeat,
              answer: selectedAnswer,
            });
            return;
          } else if (
            deviceRole === 'HOST' &&
            ((activeClue.buzzedContestantId === 'player' && hostPlays) ||
              (activeClue.buzzedContestantId === 'player2' && !isClientConnected))
          ) {
            e.preventDefault();
            handleContestantSubmitAnswer(selectedAnswer, activeClue.buzzedContestantId as 'player' | 'player2');
            return;
          }
        }
      }

      if (activeClue.phase !== 'BUZZER_OPEN' && activeClue.phase !== 'READING') return;

      if (deviceRole === 'CLIENT') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          sendClientBuzz();
        }
        return;
      }

      // Host Local Keybindings (none when Player 1 is on a phone)
      if (!hostPlays) return;
      if (e.key === ' ' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleContestantBuzz('player');
      } else if (isTwoPlayerMode && !isClientConnected && (e.key === 'Enter' || e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        handleContestantBuzz('player2');
      } else if (!isTwoPlayerMode && !isClientConnected && e.key === 'Enter') {
        e.preventDefault();
        handleContestantBuzz('player');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeClue, handleContestantBuzz, handleContestantSubmitAnswer, answerMode, isTwoPlayerMode, isClientConnected, deviceRole, mySeat, hostPlays]);

  // Check Round Completion & Transition (Host only)
  useEffect(() => {
    if (deviceRole !== 'HOST' || activeClue) return;
    const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
    if (!board.length) return;

    const allClueIds = board.flatMap((cat) => cat.clues.map((c) => c.id));
    const answeredCount = allClueIds.filter((id) => answeredClueIds.has(id)).length;

    // A round with no board (it should never happen) goes straight to the Final instead of
    // leaving everyone waiting on a board that isn't there.
    if (currentRound === 'ROUND_1' && answeredCount >= allClueIds.length && round2Board.length) {
      gameAudio.playLevelUpStinger();
      setCurrentRound('CHAMPIONSHIP');
      const sortedContestants = [...buzzerSeats];
      sortedContestants.sort((a, b) => contestants[a].score - contestants[b].score);
      setActiveSelector(sortedContestants[0]);
    } else if (currentRound !== 'FINAL_SHOWDOWN' && answeredCount >= allClueIds.length) {
      gameAudio.playPowerupChime();
      setCurrentRound('FINAL_SHOWDOWN');
      setFinalShowdownPhase('WAGER');
      setPlayerFinalWager(maxFinalWager(contestants.player.score));
      setPlayer2FinalWager(maxFinalWager(contestants.player2.score));
      setPlayer3FinalWager(maxFinalWager(contestants.analyst.score));
      // Players with no money sit the Final out: their wager and answer count as locked from the start.
      const sitters = (Object.keys(contestants) as ContestantId[]).filter((id) => !playsFinal(contestants[id].score));
      setContestants((c) => {
        const next = {...c};
        for (const id of Object.keys(c) as ContestantId[]) next[id] = {...c[id], sitsOutFinal: sitters.includes(id)};
        return next;
      });
      const locked = Object.fromEntries(sitters.map((id) => [id, true]));
      setFinalLocks({wager: {...locked}, answer: {...locked}});
      setFinalOptions(finalClue ? generateOptions(finalClue, answerMode) : []);
    }
  }, [deviceRole, activeClue, currentRound, round1Board, round2Board, answeredClueIds, contestants, buzzerSeats, finalClue, answerMode, generateOptions]);

  // Client: start the Final Showdown wager box at the same amount the host assumes (the whole bank).
  useEffect(() => {
    if (deviceRole !== 'CLIENT' || currentRound !== 'FINAL_SHOWDOWN') return;
    setPlayer2FinalWager(maxFinalWager(contestants[mySeat].score));
    setFinalPlayer2Input('');
    // Only when the round starts, not on every score sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceRole, currentRound, mySeat]);

  // Host: a friend who dropped can't pick a tile, so another player takes the board until they're back.
  useEffect(() => {
    if (deviceRole !== 'HOST' || activeClue) return;
    const away = (activeSelector === 'player2' && player2Away) || (activeSelector === 'player' && player1Away);
    if (away && buzzerSeats[0]) setActiveSelector(buzzerSeats[0]);
  }, [deviceRole, player2Away, player1Away, activeSelector, activeClue, buzzerSeats]);

  // Final Showdown Wager Confirmation (Host)
  const confirmFinalWagers = useCallback(() => {
    gameAudio.playConfirmSelect();

    const maxScore = Math.max(
      contestants.coach.score,
      contestants.analyst.score,
      contestants.player.score,
      (isTwoPlayerMode || isClientConnected) ? contestants.player2.score : -9999
    );

    setContestants((c) => ({
      ...c,
      coach: {
        ...c.coach,
        wager: aiFinalWager(c.coach.score, c.coach.score === maxScore),
      },
      analyst: {
        ...c.analyst,
        wager: c.analyst.sitsOutFinal
          ? 0
          : player3Human
          ? player3FinalWager
          : aiFinalWager(c.analyst.score, c.analyst.score === maxScore),
      },
      player: {
        ...c.player,
        wager: player1Away || c.player.sitsOutFinal ? 0 : playerFinalWager,
      },
      player2: {
        ...c.player2,
        wager: player2Away || c.player2.sitsOutFinal ? 0 : player2FinalWager,
      },
    }));

    setFinalShowdownPhase('CLUE');
    const reading = readAloud && finalClue ? readingSeconds(partsText(spokenFinal(finalClue)), 0, speechRate()) : 0;
    setFinalTimer(startCountdown(TIMES.final + reading, Date.now()));
  }, [contestants, playerFinalWager, player2FinalWager, player3FinalWager, player3Human, player2Away, player1Away, isTwoPlayerMode, isClientConnected, readAloud, finalClue]);

  // Record every human player's result on this device's leaderboard. The celebration is for Player 1.
  const saveMatchToLeaderboard = useCallback(
    (finalScores: Record<ContestantId, number>) => {
      const opp = currentOpponentMode;
      const tier = difficulty as TriviaTier;
      const format = answerMode as AnswerFormat;
      const humans: ContestantId[] = ['player'];
      if (isTwoPlayerMode || isClientConnected) humans.push('player2');
      if (player3Human) humans.push('analyst');

      for (const id of humans) {
        const c = contestants[id];
        const attempts = c.correctCount + c.wrongCount;
        const result = recordLeaderboardEntry(
          opp,
          tier,
          format,
          {
            playerName: id === 'player' && hostPlays ? playerName || 'Champion' : c.name,
            score: finalScores[id],
            accuracy: attempts > 0 ? (c.correctCount / attempts) * 100 : 100,
            questionsAnswered: attempts,
            dailyDoublesWon: c.bonusHits || 0,
          },
          gameLength
        );
        if (id === 'player' && result.isTop10) {
          setHighScoreCelebration({rank: result.rank, isHighScore: result.isHighScore, score: finalScores[id], opponent: opp, tier, format, length: gameLength});
          if (result.isHighScore) gameAudio.playVictoryFanfare();
        }
      }
      setLeaderboardRefreshCounter((c) => c + 1);
    },
    [currentOpponentMode, difficulty, answerMode, gameLength, playerName, contestants, isTwoPlayerMode, isClientConnected, player3Human, hostPlays]
  );

  // Final Showdown Resolution (Host)
  const finalizeFinalShowdown = useCallback(() => {
    // Runs once: the submit button and the countdown can both get here. When nobody has money
    // for the Final it ends straight from the wager screen.
    const nobodyPlays = activeContestantsList.every((id) => contestants[id].sitsOutFinal);
    if (!finalClue || !(finalShowdownPhase === 'CLUE' || (finalShowdownPhase === 'WAGER' && nobodyPlays))) return;

    const threshold = SETTINGS.fuzzyMatchThreshold;
    const isRight = (input: string) => isFinalAnswerRight(input, finalClue, finalOptions, threshold);
    // A wrong AI answer is one of the choices everyone else saw.
    const wrongChoices = finalOptions.length
      ? finalOptions.filter((o) => o !== finalClue.correctAnswer)
      : finalClue.distractors;
    const aiAnswer = (correct: boolean, pick: number) =>
      correct ? finalClue.correctAnswer : wrongChoices[pick] || wrongChoices[0] || '(No Answer)';

    const answers: Record<ContestantId, {correct: boolean; answer: string}> = {
      player: {correct: isRight(finalPlayerInput), answer: finalPlayerInput || '(No Answer)'},
      player2:
        isTwoPlayerMode || isClientConnected
          ? {correct: isRight(finalPlayer2Input), answer: finalPlayer2Input || '(No Answer)'}
          : {correct: false, answer: '(No Answer)'},
      analyst: player3Human
        ? {correct: isRight(finalPlayer3Input), answer: finalPlayer3Input || '(No Answer)'}
        : (() => {
            const correct = Math.random() < aiConfig.analystAcc;
            return {correct, answer: aiAnswer(correct, 1)};
          })(),
      coach: (() => {
        const correct = Math.random() < aiConfig.coachAcc;
        return {correct, answer: aiAnswer(correct, 0)};
      })(),
    };

    // Players who sat out keep their score.
    const finalScores = {} as Record<ContestantId, number>;
    const after = {} as Record<ContestantId, Contestant>;
    for (const id of Object.keys(contestants) as ContestantId[]) {
      const c = contestants[id];
      if (c.sitsOutFinal) {
        finalScores[id] = c.score;
        after[id] = {...c, reaction: 'idle', finalCorrect: undefined, finalAnswer: undefined};
        continue;
      }
      const {correct, answer} = answers[id];
      finalScores[id] = c.score + (correct ? c.wager : -c.wager);
      after[id] = {...c, score: finalScores[id], reaction: correct ? 'correct' : 'wrong', finalCorrect: correct, finalAnswer: answer};
    }
    setFinalShowdownPhase('RESULTS');
    // Reveal each player's answer and wager one at a time, lowest score first, as on TV. The
    // game ends once everyone has been revealed.
    const order = activeContestantsList
      .filter((id) => !contestants[id].sitsOutFinal)
      .sort((a, b) => contestants[a].score - contestants[b].score);
    pendingFinalRef.current = {after, finalScores};
    if (order.length) {
      setFinalReveal({order, shown: 0});
      return;
    }
    finishGameRef.current();
  }, [finalClue, finalOptions, finalShowdownPhase, finalPlayerInput, finalPlayer2Input, finalPlayer3Input, player3Human, isTwoPlayerMode, isClientConnected, aiConfig, contestants, activeContestantsList]);

  // Host: one player's Final result at a time, then the end of the game.
  useEffect(() => {
    if (deviceRole !== 'HOST' || !finalReveal || clocksPaused) return;
    const {order, shown} = finalReveal;
    const pending = pendingFinalRef.current;
    if (!pending) return;
    const done = shown >= order.length;
    const seconds = shown === 0 ? 1.5 : readAloud ? Math.max(4, readingSeconds(finalRevealLine(pending.after[order[shown - 1]]), 0, speechRate())) : 3.5;
    const timer = setTimeout(() => {
      if (done) {
        finishGameRef.current();
        return;
      }
      const id = order[shown];
      const c = pending.after[id];
      if (c.finalCorrect) gameAudio.playCoinPickup();
      else gameAudio.playErrorBuzz();
      setContestants((all) => ({...all, [id]: c}));
      setFinalReveal({order, shown: shown + 1});
    }, (done ? 2.5 : seconds) * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceRole, finalReveal, clocksPaused]);

  // Host: the Final is over. Apply every score, save the leaderboard and show the results.
  const finishGame = () => {
    const pending = pendingFinalRef.current;
    if (!pending) return;
    pendingFinalRef.current = null;
    setFinalReveal(null);
    const {after, finalScores} = pending;
    setContestants(after);
    const {coach: finalCoachScore, analyst: finalAnalystScore, player: finalPlayerScore, player2: finalPlayer2Score} = finalScores;

    const highestScore = Math.max(
      finalPlayerScore,
      (isTwoPlayerMode || isClientConnected) ? finalPlayer2Score : -9999,
      !(isTwoPlayerMode || isClientConnected) ? finalCoachScore : -9999,
      finalAnalystScore
    );

    const humanWon =
      finalPlayerScore === highestScore ||
      ((isTwoPlayerMode || isClientConnected) && finalPlayer2Score === highestScore) ||
      (player3Human && finalAnalystScore === highestScore);

    // Save final match score to persistent Leaderboard
    saveMatchToLeaderboard(finalScores);

    // Add the game to the podcast season: every person who played, with the top score as the win.
    const topScore = Math.max(...activeContestantsList.map((id) => finalScores[id]));
    const people = activeContestantsList.filter((id) => id === 'player' || id === 'player2' || (id === 'analyst' && player3Human));
    setSeasonRows(
      recordSeasonGame(
        people.map((id) => ({
          name: id === 'player' && hostPlays ? playerName || 'Champion' : after[id].name,
          score: finalScores[id],
          won: finalScores[id] === topScore,
          finalCorrect: after[id].sitsOutFinal ? undefined : after[id].finalCorrect,
        }))
      )
    );

    if (humanWon) {
      gameAudio.playVictoryFanfare();
      setGameState((prev) => ({...prev, status: 'VICTORY', score: Math.max(finalPlayerScore, finalPlayer2Score)}));
    } else {
      gameAudio.playDefeatMotif();
      setGameState((prev) => ({...prev, status: 'GAME_OVER', score: finalPlayerScore}));
    }
  };
  const finishGameRef = useRef(finishGame);
  finishGameRef.current = finishGame;

  // With friends on phones, the Final waits until each player has locked in (or the clock runs out).
  const allRemoteWagersLocked = onlineRemoteSeats.every((seat) => finalLocks.wager[seat]);
  // A phone playing P1 is one of the online seats; otherwise P1 locks on this device.
  const allFinalAnswersLocked =
    (!hostPlays || Boolean(finalLocks.answer.player)) && onlineRemoteSeats.every((seat) => finalLocks.answer[seat]);
  useEffect(() => {
    if (deviceRole !== 'HOST' || finalShowdownPhase !== 'CLUE' || onlineRemoteSeats.length === 0) return;
    if (allFinalAnswersLocked) finalizeFinalShowdownRef.current();
  }, [deviceRole, finalShowdownPhase, allFinalAnswersLocked, onlineRemoteSeats.length]);

  // The Final's clock reads the latest finalize through a ref, so typing doesn't restart it.
  const finalizeFinalShowdownRef = useRef(finalizeFinalShowdown);
  finalizeFinalShowdownRef.current = finalizeFinalShowdown;

  // Host: end the Final when its clock runs out.
  useEffect(() => {
    if (deviceRole !== 'HOST' || currentRound !== 'FINAL_SHOWDOWN' || finalShowdownPhase !== 'CLUE' || clocksPaused) return;
    if (finalTimer.endsAt === null) return;
    const timeout = setTimeout(() => finalizeFinalShowdownRef.current(), Math.max(0, finalTimer.endsAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [deviceRole, currentRound, finalShowdownPhase, clocksPaused, finalTimer.endsAt]);

  // The end-of-game recap card, shared from any device once the match is over.
  const recapMomentsList = useMemo(
    () => recapMoments(activeContestantsList.map((id) => contestants[id]), bigPlay, finalClue?.correctAnswer),
    [activeContestantsList, contestants, bigPlay, finalClue?.correctAnswer]
  );
  const recapAwardsList = useMemo(
    () => recapAwards(activeContestantsList.map((id) => contestants[id])),
    [activeContestantsList, contestants]
  );
  const shareRecap = useCallback(async () => {
    const formats: Record<AnswerMode, string> = {STANDARD: '4-Choice', HARD: '8-Choice', EXPERT: 'Typed', VOICE: 'Mic Only'};
    const vsAI = activeContestantsList.includes('coach') ? ' · vs. AI' : '';
    const level = difficulty.charAt(0) + difficulty.slice(1).toLowerCase();
    try {
      const canvas = drawRecapCard({
        standings: activeContestantsList.map((id) => contestants[id]).sort((a, b) => b.score - a.score),
        moments: recapMomentsList,
        awards: recapAwardsList,
        mode: `${gameLength === 'SHORT' ? 'Short' : 'Full'} Game · ${formats[answerMode]} · ${level}${vsAI}`,
        date: new Date(),
        url: `${window.location.origin}${window.location.pathname}`,
      });
      const result = await shareRecapCard(canvas);
      if (result === 'saved') showToast('✓ Recap card saved to your downloads');
    } catch {
      showToast('Could not make the recap card on this device.');
    }
  }, [activeContestantsList, contestants, recapMomentsList, recapAwardsList, difficulty, gameLength, answerMode, showToast]);

  // Copy Room Link to Clipboard
  const handleCopyInviteLink = useCallback(() => {
    navigator.clipboard
      .writeText(shareableJoinUrl)
      .then(() => {
        gameAudio.playConfirmSelect();
        showToast('✓ Join link copied! Send to your friend.');
      })
      .catch(() => {
        showToast(`Room: ${roomCode}`);
      });
  }, [shareableJoinUrl, roomCode, showToast]);

  const handleCopyRoomCode = useCallback(() => {
    navigator.clipboard
      .writeText(roomCode)
      .then(() => {
        gameAudio.playConfirmSelect();
        showToast(`✓ Room code "${roomCode}" copied!`);
      })
      .catch(() => {
        showToast(`Room Code: ${roomCode}`);
      });
  }, [roomCode, showToast]);

  // Determine current active BGM
  const activeBgmUrl = useMemo(() => {
    if (currentRound === 'FINAL_SHOWDOWN') {
      return BGM_FINAL;
    }
    return BGM_TRIVIA;
  }, [currentRound]);

  // Active Leaderboard Entries query
  const displayedLeaderboardEntries = useMemo(() => {
    return getLeaderboard(
      leaderboardFilterOpponent,
      leaderboardFilterTier,
      leaderboardFilterFormat,
      leaderboardFilterLength
    );
  }, [leaderboardFilterOpponent, leaderboardFilterTier, leaderboardFilterFormat, leaderboardFilterLength, leaderboardRefreshCounter]);

  // Player's personal best in currently selected category
  const myBestRecord = useMemo(() => {
    return displayedLeaderboardEntries.find((e) => e.isLocalPlayer || e.playerName === playerName);
  }, [displayedLeaderboardEntries, playerName]);

  const isMusicPlaying = gameState.status === 'PLAYING' && !musicMuted && !isGameMenuOpen && !isLeaderboardOpen && !isTagEditorOpen;
  const startButtonRef = useAutoFocus<HTMLButtonElement>(gameState.status === 'START');

  // Open Leaderboard pre-filtered to given or current settings
  const openLeaderboardWithConfig = useCallback(
    (opp?: OpponentMode, tier?: TriviaTier, format?: AnswerFormat) => {
      gameAudio.playCrispClick();
      setLeaderboardFilterOpponent(opp || currentOpponentMode);
      setLeaderboardFilterTier(tier || (difficulty as TriviaTier));
      setLeaderboardFilterFormat(format || (answerMode as AnswerFormat));
      setIsLeaderboardOpen(true);
    },
    [currentOpponentMode, difficulty, answerMode]
  );


  return {
    sfxMuted,
    setSfxMuted,
    musicMuted,
    setMusicMuted,
    deviceRole,
    setDeviceRole,
    roomCode,
    setRoomCode,
    joinInputCode,
    setJoinInputCode,
    p2pStatus,
    p2pDetail,
    isClientConnected,
    setIsClientConnected,
    inviteModalTab,
    setInviteModalTab,
    isGameMenuOpen,
    setIsGameMenuOpen,
    isHowToPlayOpen,
    setIsHowToPlayOpen,
    isInviteModalOpen,
    setIsInviteModalOpen,
    isLeaderboardOpen,
    setIsLeaderboardOpen,
    isTagEditorOpen,
    setIsTagEditorOpen,
    tagEditorInput,
    setTagEditorInput,
    toastMessage,
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
    highScoreCelebration,
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
    setGameState,
    currentRound,
    round1Board,
    round2Board,
    answeredClueIds,
    roundMaxClue,
    boardColsClass,
    boardRowIndexes,
    bankInfo,
    bankStatus,
    loadBank,
    seenQuestionsCount,
    heldBackQuestionsCount,
    totalQuestionCount,
    totalCategoryCount,
    activeSelector,
    aiPickingTile,
    aiThinkingStatus,
    contestants,
    activeClue,
    setActiveClue,
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
    matchStats,
    clientTypedInput,
    setClientTypedInput,
    clientWager,
    setClientWager,
    p2pRef,
    remoteSeats,
    mySeat,
    hostPlays,
    setHostPlays,
    player3Human,
    onlineRemoteSeats,
    finalLocks,
    setFinalLocks,
    showToast,
    openTagEditorModal,
    handleSaveTag,
    handleResetQuestionHistory,
    currentOpponentMode,
    shareableJoinUrl,
    generateRoomCode,
    answerByVoice,
    finalAnswerByVoice,
    selectClue,
    startMatch,
    dailyDoubleClock,
    readAloud,
    setReadAloud,
    voiceSpeed,
    setVoiceSpeed,
    screenCount,
    streamScreenUrl,
    greenScreenUrl,
    bigPlay,
    categoryIntro,
    skipCategoryIntro,
    finalReveal,
    finalShownFor,
    seasonRows,
    startNewSeason,
    sendClientBuzz,
    recapMomentsList,
    recapAwardsList,
    shareRecap,
    handleContestantBuzz,
    handleContestantSubmitAnswer,
    confirmFinalWagers,
    finalizeFinalShowdown,
    allRemoteWagersLocked,
    handleCopyInviteLink,
    handleCopyRoomCode,
    activeContestantsList,
    activeBgmUrl,
    displayedLeaderboardEntries,
    myBestRecord,
    isMusicPlaying,
    startButtonRef,
    openLeaderboardWithConfig,
  };
}

export type Game = ReturnType<typeof useGameController>;
