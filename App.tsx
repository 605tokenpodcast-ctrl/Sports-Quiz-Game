// tslint:disable
/* eslint-disable */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Play,
  RotateCw,
  Volume2,
  VolumeX,
  Menu as MenuIcon,
  HelpCircle,
  Trophy,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Award,
  Users,
  Share2,
  Copy,
  Check,
  Flame,
  Shield,
  Star,
  Sparkles,
  User,
  ArrowRight,
  Info,
  Smartphone,
  Wifi,
  QrCode,
  ExternalLink,
  Radio,
  Gamepad2,
  RefreshCw,
  ArrowLeft,
  Medal,
  Filter,
  Trash2,
  Edit3,
  X,
  Lock,
} from 'lucide-react';
import {getConfig, THEME} from './constants';
import BackgroundMusic from './utils/BackgroundMusic';
import {
  formatTime,
  gameAudio,
  GameState,
  MenuOverlay,
  useAssets,
  useAutoFocus,
  useIsMobile,
} from './utils/helper';
import {
  buildQuestionOptions,
  checkTypedAnswer,
  matchSpokenOption,
  pickSpokenTypedAnswer,
  createFullGameSession,
  FINAL_SHOWDOWN_QUESTIONS,
  getCategoriesForRound,
  getFreshFinalShowdownClue,
  getSeenQuestionsCount,
  getTotalAvailableQuestionCount,
  getTotalCategoryCount,
  loadExternalQuestionBank,
  resetSeenQuestions,
  ExternalBankInfo,
  QuestionClue,
  TriviaCategory,
} from './triviaData';
import {generateQRCodeMatrix} from './utils/qrCode';
import {P2PConnectionManager, P2PMessage} from './utils/p2pSync';
import VoiceAnswerButton, {isVoiceSupported} from './utils/VoiceAnswerButton';
import {
  AnswerFormat,
  FORMAT_OPTIONS,
  getLeaderboard,
  getLastPlayerName,
  LeaderboardEntry,
  OPPONENT_OPTIONS,
  OpponentMode,
  recordLeaderboardEntry,
  resetAllLeaderboards,
  resetLeaderboardCategory,
  setLastPlayerName,
  TIER_OPTIONS,
  TriviaTier,
} from './utils/leaderboard';

// Asset manifests
const ASSETS_MANIFEST: Record<string, string> = {
  bgStudio: 'assets/images/bg_studio_arena.png',
  podium: 'assets/images/podium_contestant.png',
  buzzerActive: 'assets/images/icon_buzzer_active.png',
  trophyGold: 'assets/images/icon_trophy_gold.png',
};

const BGM_TRIVIA = 'assets/audio/bgm_trivia_stage.mp3';
const BGM_FINAL = 'assets/audio/bgm_final_showdown.mp3';

export type AIDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
export type AnswerMode = 'STANDARD' | 'HARD' | 'EXPERT' | 'VOICE'; // 4-choice, 8-choice, Typed, Mic only

// Typed and mic-only modes show no options and check the answer with fuzzy matching.
const isOpenAnswerMode = (mode: AnswerMode) => mode === 'EXPERT' || mode === 'VOICE';
export type RoundType = 'ROUND_1' | 'CHAMPIONSHIP' | 'FINAL_SHOWDOWN' | 'RESULTS';
export type ContestantId = 'coach' | 'player' | 'analyst' | 'player2';

// Seats a friend's phone can take. The third seat is the AI analyst ("Stats Riley")
// unless a second friend joins online, in which case that friend plays it as P3.
export type RemoteSeat = 'player2' | 'analyst';
const REMOTE_SEATS: RemoteSeat[] = ['player2', 'analyst'];
const seatLabel = (seat: ContestantId) => (seat === 'analyst' ? 'P3' : seat === 'player2' ? 'P2' : 'P1');
export type DeviceRole = 'HOST' | 'CLIENT';

interface Contestant {
  id: ContestantId;
  name: string;
  shortName: string;
  title: string;
  score: number;
  reaction: 'idle' | 'buzzing' | 'answering' | 'correct' | 'wrong' | 'locked';
  correctCount: number;
  wrongCount: number;
  wager: number;
  finalAnswer?: string;
  finalCorrect?: boolean;
}

interface ActiveClueState {
  clue: QuestionClue;
  catIndex: number;
  clueIndex: number;
  phase: 'READING' | 'BUZZER_OPEN' | 'ANSWERING' | 'REVEALED';
  buzzedContestantId: ContestantId | null;
  buzzerLockout: Record<ContestantId, boolean>;
  timer: number;
  maxTimer: number;
  options: string[];
  isBonusWager: boolean;
  bonusSelectingPlayerId: ContestantId;
  bonusWagerInput: number;
  bonusWagerLocked: boolean;
  selectedOption: string | null;
  typedInput: string;
  feedbackText: string;
}

const PRESET_TAG_SUGGESTIONS = [
  '🏆 Champion',
  '⚡ BlitzMaster',
  '🎯 ClutchShot',
  '🐐 The GOAT',
  '👑 KingPlay',
  '🔥 HotHand',
  '🏈 GridironAce',
  '🏀 HoopMaster',
  '⚾ SluggerKing',
  '🏒 IceTitan',
  '🏆 HeismanHero',
  '🎓 MarchMadnessAce',
];

// Scannable SVG QR Code Generator Component
function QRCodeView({ value, size = 180 }: { value: string; size?: number }) {
  const matrix = useMemo(() => {
    try {
      return generateQRCodeMatrix(value);
    } catch (e) {
      return [];
    }
  }, [value]);

  if (!matrix || matrix.length === 0) {
    return (
      <div className="w-44 h-44 bg-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-400">
        Generating QR Code...
      </div>
    );
  }

  const n = matrix.length;
  const padding = 2;
  const viewBoxSize = n + padding * 2;

  return (
    <div className="p-2 bg-white rounded-xl shadow-xl inline-block border-2 border-amber-400">
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        width={size}
        height={size}
        className="block shape-rendering-crispEdges"
      >
        <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((cell, c) =>
            cell ? (
              <rect
                key={`${r}-${c}`}
                x={c + padding}
                y={r + padding}
                width={1}
                height={1}
                fill="#0f172a"
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const {assets, isReady: assetsReady} = useAssets(ASSETS_MANIFEST);

  // Audio mute controls: Music MUST be OFF by default, SFX MUST be ON by default
  const [sfxMuted, setSfxMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(true);

  // Device Role & Multiplayer Lobby Management
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(() => {
    if (typeof window === 'undefined') return 'HOST';
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const roleParam = params.get('role') || hashParams.get('role');
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
  const [leaderboardRefreshCounter, setLeaderboardRefreshCounter] = useState(0);
  const [highScoreCelebration, setHighScoreCelebration] = useState<{
    rank: number;
    isHighScore: boolean;
    score: number;
    opponent: OpponentMode;
    tier: TriviaTier;
    format: AnswerFormat;
  } | null>(null);

  // Game setup options
  const [difficulty, setDifficulty] = useState<AIDifficulty>('MEDIUM');
  const [answerMode, setAnswerMode] = useState<AnswerMode>('STANDARD');
  const [isTwoPlayerMode, setIsTwoPlayerMode] = useState(false);

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

  // NFL question bank, built weekly from nflverse data
  const [bankInfo, setBankInfo] = useState<ExternalBankInfo | null>(null);

  useEffect(() => {
    loadExternalQuestionBank().then((info) => {
      if (info) setBankInfo(info);
    });
  }, []);

  // Anti-repeat question statistics
  const seenQuestionsCount = useMemo(() => {
    return getSeenQuestionsCount();
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
  const [finalShowdownPhase, setFinalShowdownPhase] = useState<'WAGER' | 'CLUE' | 'RESULTS'>('WAGER');
  const [finalShowdownTimer, setFinalShowdownTimer] = useState(25);
  const [finalPlayerInput, setFinalPlayerInput] = useState('');
  const [finalPlayer2Input, setFinalPlayer2Input] = useState('');
  const [player3FinalWager, setPlayer3FinalWager] = useState(1000);
  const [finalPlayer3Input, setFinalPlayer3Input] = useState('');

  // Match statistics for post-game
  const [matchStats, setMatchStats] = useState({
    totalQuestions: 0,
    playerCorrect: 0,
    playerWrong: 0,
    highestScore: 0,
    buzzerWins: 0,
    bonusWagersHit: 0,
  });

  // Early buzzer lockout flash
  const [earlyBuzzFlash, setEarlyBuzzFlash] = useState(false);

  // P2P Manager Ref
  const p2pRef = useRef<P2PConnectionManager | null>(null);

  // Host: which seat each friend's phone holds, by PeerJS id. Client: the seat this phone holds.
  const [remoteSeats, setRemoteSeats] = useState<Record<string, RemoteSeat>>({});
  const remoteSeatsRef = useRef(remoteSeats);
  const [mySeat, setMySeat] = useState<RemoteSeat>('player2');
  const player3Human = Object.values(remoteSeats).includes('analyst');
  const isHumanSeat = (id: ContestantId) => id === 'player' || id === 'player2' || (id === 'analyst' && player3Human);
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

      setContestants((prev) => ({
        ...prev,
        player: {
          ...prev.player,
          name: isTwoPlayerMode || isClientConnected ? `${clean} (P1)` : clean,
        },
      }));

      setIsTagEditorOpen(false);
      gameAudio.playConfirmSelect();
      showToast(`✓ Contestant tag saved as "${clean}"`);
    },
    [tagEditorInput, isTwoPlayerMode, isClientConnected, showToast]
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

  // Setup Board data with strict session-wide deduplication & Daily Doubles (1 in Round 1, 2 in Round 2, 6x5 symmetry)
  const initializeBoards = useCallback(() => {
    const session = createFullGameSession(difficulty);
    const r1 = session.round1Board;
    const r2 = session.round2Board;

    // 1 Daily Double hidden in Round 1
    const r1Cat = Math.floor(Math.random() * r1.length);
    const r1Clue = Math.floor(Math.random() * 5);
    if (r1[r1Cat]?.clues[r1Clue]) {
      r1[r1Cat].clues[r1Clue].isBonusWager = true;
    }

    // 2 distinct Daily Doubles hidden in Round 2
    const bonus1Cat = Math.floor(Math.random() * r2.length);
    const bonus1Clue = Math.floor(Math.random() * 5);
    if (r2[bonus1Cat]?.clues[bonus1Clue]) {
      r2[bonus1Cat].clues[bonus1Clue].isBonusWager = true;
    }

    let bonus2Cat = Math.floor(Math.random() * r2.length);
    let bonus2Clue = Math.floor(Math.random() * 5);
    if (bonus2Cat === bonus1Cat && bonus2Clue === bonus1Clue) {
      bonus2Cat = (bonus1Cat + 2) % r2.length;
    }
    if (r2[bonus2Cat]?.clues[bonus2Clue]) {
      r2[bonus2Cat].clues[bonus2Clue].isBonusWager = true;
    }

    setRound1Board(r1);
    setRound2Board(r2);
    setAnsweredClueIds(new Set());

    // Set Final Clue from deduplicated session
    setFinalClue(session.finalClue);
    setSeenCountRefresh((c) => c + 1);
  }, [difficulty]);

  // AI reflex and accuracy configuration
  const aiConfig = useMemo(() => {
    switch (difficulty) {
      case 'EASY':
        return {coachSpeed: 3.8, analystSpeed: 4.2, coachAcc: 0.45, analystAcc: 0.48};
      case 'HARD':
        return {coachSpeed: 1.4, analystSpeed: 1.3, coachAcc: 0.82, analystAcc: 0.86};
      case 'EXPERT':
        return {coachSpeed: 0.8, analystSpeed: 0.75, coachAcc: 0.94, analystAcc: 0.96};
      case 'MEDIUM':
      default:
        return {coachSpeed: 2.3, analystSpeed: 2.1, coachAcc: 0.68, analystAcc: 0.72};
    }
  }, [difficulty]);

  // Helper to shuffle distractors and construct options array with guaranteed 8-choice / 4-choice integrity
  const generateOptions = useCallback((clue: QuestionClue, mode: AnswerMode): string[] => {
    if (isOpenAnswerMode(mode)) return [];
    return buildQuestionOptions(clue, mode);
  }, []);

  // Turn what a player said into an answer. Multiple choice picks the option they named;
  // typed mode submits the recognizer's best guess. Returns a hint when it can't tell.
  const answerByVoice = (heard: string[], submit: (answer: string) => void): string | void => {
    if (!activeClue) return;
    if (isOpenAnswerMode(answerMode)) {
      const answer = pickSpokenTypedAnswer(heard, activeClue.clue, getConfig('fuzzyMatchThreshold') as number);
      if (!answer) return answerMode === 'VOICE' ? "Didn't catch that. Tap the mic and try again." : "Didn't catch that. Try again or type it.";
      setActiveClue((prev) => (prev ? {...prev, typedInput: answer} : null));
      submit(answer);
      return;
    }
    const match = matchSpokenOption(heard, activeClue.options);
    if (!match) return `Heard "${heard[0]}". Not sure which one you meant, so tap it.`;
    submit(match);
  };

  // Final Showdown answers are typed, so voice fills the box and the player checks it before submitting.
  const finalAnswerByVoice = (heard: string[], setAnswer: (answer: string) => void): string | void => {
    if (!finalClue) return;
    const answer = pickSpokenTypedAnswer(heard, finalClue, getConfig('fuzzyMatchThreshold') as number);
    if (!answer) return "Didn't catch that. Try again or type it.";
    setAnswer(answer);
    return `Heard "${answer}". Fix it if needed, then submit.`;
  };

  // Open a clue card (authoritative selection on host)
  const selectClue = useCallback(
    (categoryIndex: number, clueIndex: number, pickerId: ContestantId = activeSelector) => {
      if (activeClue) return;
      const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
      const clue = board[categoryIndex]?.clues[clueIndex];
      if (!clue || answeredClueIds.has(clue.id)) return;

      gameAudio.playCrispClick();

      const isBonus = Boolean(clue.isBonusWager);
      const options = generateOptions(clue, answerMode);

      const roundMaxClue = currentRound === 'ROUND_1' ? 1000 : 2000;
      const pickerScore = contestants[pickerId]?.score || 0;
      const maxWager = Math.max(roundMaxClue, pickerScore);

      // AI Smart Wager Calculation
      let aiWager = 500;
      if (isBonus && !isHumanSeat(pickerId)) {
        const acc = pickerId === 'coach' ? aiConfig.coachAcc : aiConfig.analystAcc;
        if (acc > 0.8) {
          aiWager = Math.floor(maxWager * 0.9);
        } else if (acc > 0.6) {
          aiWager = Math.floor(maxWager * 0.65);
        } else {
          aiWager = Math.max(roundMaxClue, Math.floor(maxWager * 0.4));
        }
        aiWager = Math.max(5, Math.min(maxWager, Math.round(aiWager / 50) * 50));
      }

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
        timer: isBonus ? 12.0 : (getConfig('buzzerLightDelay') as number),
        maxTimer: isBonus ? 12.0 : (getConfig('buzzerLightDelay') as number),
        options,
        isBonusWager: isBonus,
        bonusSelectingPlayerId: pickerId,
        bonusWagerInput: isBonus
          ? isHumanSeat(pickerId)
            ? Math.min(roundMaxClue, maxWager)
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
    [activeClue, currentRound, round1Board, round2Board, answeredClueIds, activeSelector, contestants, answerMode, aiConfig, player3Human]
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
      setActiveClue((prev) => {
        if (!prev || !prev.isBonusWager || prev.bonusWagerLocked) return prev;
        gameAudio.playConfirmSelect();
        const pName = contestants[pickerId]?.name || 'Opponent';
        return {
          ...prev,
          bonusWagerLocked: true,
          timer: (getConfig('questionTimeLimit') as number) || 12.0,
          maxTimer: (getConfig('questionTimeLimit') as number) || 12.0,
          feedbackText: `${pName} locked in wager at $${prev.bonusWagerInput.toLocaleString()}! Reading clue...`,
        };
      });
    }, 1800);

    return () => clearTimeout(timer);
  }, [deviceRole, activeClue?.isBonusWager, activeClue?.bonusWagerLocked, activeClue?.bonusSelectingPlayerId, contestants, player3Human]);

  // Initialize and start match
  const startMatch = useCallback(() => {
    gameAudio.playConfirmSelect();
    initializeBoards();
    setCurrentRound('ROUND_1');
    setActiveSelector('player');
    setAiPickingTile(null);
    setAiThinkingStatus(null);
    setHighScoreCelebration(null);

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
        name: isTwoPlayerMode || isClientConnected ? `${playerName} (P1)` : `${playerName}`,
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

    setActiveClue(null);
    setFinalShowdownPhase('WAGER');
    setFinalPlayerInput('');
    setFinalPlayer2Input('');
    setPlayerFinalWager(1000);
    setPlayer2FinalWager(1000);
    setFinalPlayer3Input('');
    setPlayer3FinalWager(1000);
    setGameState((prev) => ({...prev, status: 'PLAYING', score: 0, level: 1}));
    setIsGameMenuOpen(false);
    setIsHowToPlayOpen(false);
    setIsInviteModalOpen(false);
    setIsLeaderboardOpen(false);
    setIsTagEditorOpen(false);
  }, [initializeBoards, isTwoPlayerMode, isClientConnected, playerName, player3Human]);

  // Host handling of Player Buzz Action (Player 1 or Player 2)
  const handleContestantBuzz = useCallback(
    (contestantId: 'player' | RemoteSeat) => {
      if (!activeClue) return;

      // Early buzz penalty during READING phase
      if (activeClue.phase === 'READING') {
        gameAudio.playErrorBuzz();
        setEarlyBuzzFlash(true);
        setTimeout(() => setEarlyBuzzFlash(false), 500);
        return;
      }

      if (activeClue.phase !== 'BUZZER_OPEN' || activeClue.buzzerLockout[contestantId]) return;

      gameAudio.playConfirmSelect();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(60);
      }

      if (contestantId === 'player') {
        setMatchStats((ms) => ({...ms, buzzerWins: ms.buzzerWins + 1}));
      }

      setContestants((c) => ({
        ...c,
        [contestantId]: {...c[contestantId], reaction: 'buzzing'},
      }));

      setActiveClue((prev) => {
        if (!prev || prev.phase !== 'BUZZER_OPEN') return prev;
        const name = contestants[contestantId]?.name || 'Player';
        return {
          ...prev,
          phase: 'ANSWERING',
          buzzedContestantId: contestantId,
          // Mic-only answers get a little longer, so a missed word can be said again.
          timer: answerMode === 'VOICE' ? 10.0 : 8.0,
          maxTimer: answerMode === 'VOICE' ? 10.0 : 8.0,
          feedbackText:
            answerMode === 'VOICE' ? `${name}'s Turn! Say your answer!` : `${name}'s Turn! Select or type your answer!`,
        };
      });
    },
    [activeClue, contestants, answerMode]
  );

  // Host handling contestant answer submission
  const handleContestantSubmitAnswer = useCallback(
    (answer: string, answeringId: 'player' | RemoteSeat) => {
      if (!activeClue || activeClue.phase !== 'ANSWERING' || activeClue.buzzedContestantId !== answeringId) return;

      const isBonus = activeClue.isBonusWager;
      const wagerAmount = isBonus ? activeClue.bonusWagerInput : activeClue.clue.value;
      const threshold = getConfig('fuzzyMatchThreshold') as number;

      const isCorrect =
        isOpenAnswerMode(answerMode)
          ? checkTypedAnswer(answer, activeClue.clue, threshold)
          : answer.trim().toLowerCase() === activeClue.clue.correctAnswer.trim().toLowerCase();

      const pName = contestants[answeringId]?.name || 'Player';

      if (isCorrect) {
        gameAudio.playCoinPickup();
        if (isBonus) {
          gameAudio.playLevelUpStinger();
          setMatchStats((ms) => ({...ms, bonusWagersHit: ms.bonusWagersHit + 1}));
        }

        setContestants((c) => ({
          ...c,
          [answeringId]: {
            ...c[answeringId],
            score: c[answeringId].score + wagerAmount,
            reaction: 'correct',
            correctCount: c[answeringId].correctCount + 1,
          },
        }));

        if (answeringId === 'player') {
          setMatchStats((ms) => ({
            ...ms,
            playerCorrect: ms.playerCorrect + 1,
            highestScore: Math.max(ms.highestScore, contestants.player.score + wagerAmount),
          }));
        }

        // Contestant who answered correctly gets control of the board!
        setActiveSelector(answeringId);

        setActiveClue((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            phase: 'REVEALED',
            selectedOption: answer,
            timer: 2.8,
            feedbackText: `CORRECT! ${pName} earned +$${wagerAmount.toLocaleString()} and won Board Control!`,
          };
        });
      } else {
        gameAudio.playErrorBuzz();
        setContestants((c) => ({
          ...c,
          [answeringId]: {
            ...c[answeringId],
            score: c[answeringId].score - wagerAmount,
            reaction: 'wrong',
            wrongCount: c[answeringId].wrongCount + 1,
          },
        }));

        if (answeringId === 'player') {
          setMatchStats((ms) => ({...ms, playerWrong: ms.playerWrong + 1}));
        }

        const newLockouts = {...activeClue.buzzerLockout, [answeringId]: true};
        const activeList: ContestantId[] = isTwoPlayerMode || isClientConnected ? ['player', 'player2', 'analyst'] : ['player', 'coach', 'analyst'];
        const allLocked = activeList.every((id) => newLockouts[id]);

        if (isBonus || allLocked) {
          setActiveClue((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              phase: 'REVEALED',
              selectedOption: answer,
              timer: 3.0,
              feedbackText: `INCORRECT! (-$${wagerAmount.toLocaleString()}) Correct answer: ${prev.clue.correctAnswer}`,
            };
          });
        } else {
          setActiveClue((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              phase: 'BUZZER_OPEN',
              buzzedContestantId: null,
              buzzerLockout: newLockouts,
              timer: 4.5,
              feedbackText: `${pName} was Incorrect (-$${wagerAmount.toLocaleString()}). Buzzers re-opened!`,
            };
          });
        }
      }
    },
    [activeClue, answerMode, contestants, isTwoPlayerMode, isClientConnected]
  );

  // P2P Message Dispatcher for Host & Client
  const handleP2PMessage = useCallback(
    (msg: P2PMessage, fromPeerId: string) => {
      // 1. Host receives events from friends' phones
      if (deviceRole === 'HOST') {
        if (msg.type === 'CLIENT_JOIN') {
          const seats = remoteSeatsRef.current;
          if (seats[fromPeerId]) return;
          const taken = new Set(Object.values(seats));
          const seat = REMOTE_SEATS.find((s) => !taken.has(s));
          if (!seat) {
            showToast('The room is full (3 players max).');
            p2pRef.current?.send({type: 'ROOM_FULL'}, fromPeerId);
            p2pRef.current?.disconnectPeer(fromPeerId);
            return;
          }
          const next = {...seats, [fromPeerId]: seat};
          remoteSeatsRef.current = next;
          setRemoteSeats(next);
          setIsClientConnected(true);
          setIsTwoPlayerMode(true);
          const label = seatLabel(seat);
          const name = msg.playerName || `Friend (${label})`;
          showToast(`🎉 ${name} joined on their phone as ${label}!`);
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
          case 'CLIENT_BUZZ':
            handleContestantBuzz(seat);
            break;

          case 'CLIENT_ANSWER':
            handleContestantSubmitAnswer(msg.answer, seat);
            break;

          case 'CLIENT_SELECT_CLUE':
            if (activeSelector === seat) {
              selectClue(msg.catIdx, msg.clueIdx, seat);
            }
            break;

          case 'CLIENT_SET_WAGER':
            setActiveClue((prev) => {
              if (!prev || !prev.isBonusWager || prev.bonusSelectingPlayerId !== seat || prev.bonusWagerLocked) return prev;
              const isLock = Boolean(msg.lockIn);
              if (isLock) {
                gameAudio.playConfirmSelect();
              }
              return {
                ...prev,
                bonusWagerInput: msg.wager,
                bonusWagerLocked: isLock,
                timer: isLock ? 12.0 : prev.timer,
                maxTimer: isLock ? 12.0 : prev.maxTimer,
                feedbackText: isLock
                  ? `${contestants[seat]?.name || seatLabel(seat)} locked wager at $${msg.wager.toLocaleString()}! Provide answer.`
                  : prev.feedbackText,
              };
            });
            break;

          case 'CLIENT_FINAL_WAGER':
            if (seat === 'player2') setPlayer2FinalWager(msg.wager);
            else setPlayer3FinalWager(msg.wager);
            break;

          case 'CLIENT_FINAL_ANSWER':
            if (seat === 'player2') setFinalPlayer2Input(msg.answer);
            else setFinalPlayer3Input(msg.answer);
            break;

          default:
            break;
        }
      }

      // 2. Client receives state updates from Host
      if (deviceRole === 'CLIENT') {
        if (msg.type === 'ROOM_FULL') {
          setP2PStatus('error');
          setP2PDetail('This room is full (3 players max).');
          showToast('This room is full (3 players max).');
          p2pRef.current?.destroy();
          return;
        }
        if (msg.type === 'STATE_SYNC') {
          const s = msg.payload;
          if (s.seats) {
            const mine = s.seats[p2pRef.current?.peerId ?? ''];
            if (mine) setMySeat(mine);
          }
          if (s.gameState) setGameState(s.gameState);
          if (s.currentRound) setCurrentRound(s.currentRound);
          if (s.round1Board) setRound1Board(s.round1Board);
          if (s.round2Board) setRound2Board(s.round2Board);
          if (s.answeredClueIds) setAnsweredClueIds(new Set(s.answeredClueIds));
          if (s.activeSelector) setActiveSelector(s.activeSelector);
          if (s.contestants) setContestants(s.contestants);
          if (s.activeClue !== undefined) setActiveClue(s.activeClue);
          if (s.difficulty) setDifficulty(s.difficulty);
          if (s.answerMode) setAnswerMode(s.answerMode);
          if (s.finalClue) setFinalClue(s.finalClue);
          if (s.finalShowdownPhase) setFinalShowdownPhase(s.finalShowdownPhase);
          if (s.finalShowdownTimer !== undefined) setFinalShowdownTimer(s.finalShowdownTimer);
        }
      }
    },
    [deviceRole, handleContestantBuzz, handleContestantSubmitAnswer, activeSelector, selectClue, showToast, contestants]
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
          } else if (status === 'disconnected') {
            setIsClientConnected(false);
          }
        },
        onPeerLeft: (peerId) => {
          const seats = {...remoteSeatsRef.current};
          const seat = seats[peerId];
          if (!seat) return;
          delete seats[peerId];
          remoteSeatsRef.current = seats;
          setRemoteSeats(seats);
          showToast(`${seatLabel(seat)} disconnected.`);
          if (seat === 'analyst') {
            // Stats Riley (AI) takes the third seat back over.
            setContestants((prev) => ({
              ...prev,
              analyst: {...prev.analyst, name: 'Stats Riley', shortName: 'Riley', title: 'Analytics Guru'},
            }));
          }
        },
      },
      name && name !== 'Champion' ? name : undefined
    );

    p2pRef.current = mgr;

    return () => {
      mgr.destroy();
    };
  }, [roomCode, deviceRole, showToast]);

  // Host sends STATE_SYNC broadcast to joined friends
  useEffect(() => {
    if (deviceRole !== 'HOST' || !p2pRef.current) return;

    const snapshot = {
      gameState,
      currentRound,
      round1Board,
      round2Board,
      answeredClueIds: Array.from(answeredClueIds),
      activeSelector,
      contestants,
      activeClue,
      difficulty,
      answerMode,
      finalClue,
      finalShowdownPhase,
      finalShowdownTimer,
      seats: remoteSeats,
    };

    p2pRef.current.send({
      type: 'STATE_SYNC',
      payload: snapshot,
    });
  }, [
    deviceRole,
    gameState,
    currentRound,
    round1Board,
    round2Board,
    answeredClueIds,
    activeSelector,
    contestants,
    activeClue,
    difficulty,
    answerMode,
    finalClue,
    finalShowdownPhase,
    finalShowdownTimer,
    remoteSeats,
  ]);

  // AI Board Selection turn logic when it's Coach or Analyst's turn to pick
  useEffect(() => {
    if (
      deviceRole !== 'HOST' ||
      gameState.status !== 'PLAYING' ||
      activeClue ||
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
      const football = availableClues.filter((c) => c.category.includes('NFL') || c.category.includes('NCAA') || c.category.includes('GRIDIRON'));
      if (football.length > 0 && Math.random() < 0.7) {
        chosen = football[Math.floor(Math.random() * football.length)];
      }
    } else if (activeSelector === 'analyst') {
      const highVal = availableClues.filter((c) => c.value >= 800 || c.category.includes('RECORD') || c.category.includes('SCORING'));
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
  ]);

  // Main active clue timer and buzzer loop (Authoritative on Host)
  useEffect(() => {
    if (
      deviceRole !== 'HOST' ||
      !activeClue ||
      gameState.status !== 'PLAYING' ||
      isGameMenuOpen ||
      isHowToPlayOpen ||
      isInviteModalOpen ||
      isLeaderboardOpen ||
      isTagEditorOpen
    ) {
      return;
    }

    const interval = setInterval(() => {
      setActiveClue((prev) => {
        if (!prev) return null;

        // 1. Reading Phase -> Countdown to Buzzer Open
        if (prev.phase === 'READING') {
          const nextTime = prev.timer - 0.1;
          if (nextTime <= 0) {
            gameAudio.playHoverMicroTone();
            return {
              ...prev,
              phase: 'BUZZER_OPEN',
              timer: getConfig('questionTimeLimit') as number,
              maxTimer: getConfig('questionTimeLimit') as number,
              feedbackText: 'BUZZERS ACTIVE! Buzz in now!',
            };
          }
          return {...prev, timer: nextTime};
        }

        // 2. Buzzer Open Phase -> Countdown until time expires
        if (prev.phase === 'BUZZER_OPEN') {
          const nextTime = prev.timer - 0.1;
          if (nextTime <= 0) {
            gameAudio.playErrorBuzz();
            return {
              ...prev,
              phase: 'REVEALED',
              timer: 3.0,
              feedbackText: `Time's up! Correct answer: ${prev.clue.correctAnswer}`,
            };
          }
          return {...prev, timer: nextTime};
        }

        // 3. Answering Phase -> Answering countdown (Paused while Daily Double is unlocking/wager pending)
        if (prev.phase === 'ANSWERING') {
          if (prev.isBonusWager && !prev.bonusWagerLocked) {
            return prev;
          }

          const nextTime = prev.timer - 0.1;
          if (nextTime <= 0) {
            const buzzedId = prev.buzzedContestantId;
            if (buzzedId) {
              gameAudio.playErrorBuzz();
              const deduction = prev.isBonusWager ? prev.bonusWagerInput : prev.clue.value;

              setContestants((c) => ({
                ...c,
                [buzzedId]: {
                  ...c[buzzedId],
                  score: c[buzzedId].score - deduction,
                  reaction: 'wrong',
                  wrongCount: c[buzzedId].wrongCount + 1,
                },
              }));

              if (buzzedId === 'player' || buzzedId === 'player2') {
                setMatchStats((ms) => ({...ms, playerWrong: ms.playerWrong + 1}));
              }

              const newLockouts = {...prev.buzzerLockout, [buzzedId]: true};
              const activeContestantsList: ContestantId[] = isTwoPlayerMode || isClientConnected
                ? ['player', 'player2', 'analyst']
                : ['player', 'coach', 'analyst'];
              const allLocked = activeContestantsList.every((id) => newLockouts[id]);

              if (prev.isBonusWager || allLocked) {
                return {
                  ...prev,
                  phase: 'REVEALED',
                  timer: 3.0,
                  feedbackText: `Time expired! Correct answer: ${prev.clue.correctAnswer}`,
                };
              }

              const contestantName = contestants[buzzedId]?.name || 'Contestant';
              return {
                ...prev,
                phase: 'BUZZER_OPEN',
                buzzedContestantId: null,
                buzzerLockout: newLockouts,
                timer: 5.0,
                feedbackText: `${contestantName} timed out! Buzzers re-opened!`,
              };
            }
          }
          return {...prev, timer: nextTime};
        }

        // 4. Revealed Phase -> Clue finished
        if (prev.phase === 'REVEALED') {
          const nextTime = prev.timer - 0.1;
          if (nextTime <= 0) {
            setAnsweredClueIds((ids) => new Set([...ids, prev.clue.id]));
            setMatchStats((ms) => ({...ms, totalQuestions: ms.totalQuestions + 1}));

            setContestants((c) => ({
              ...c,
              coach: {...c.coach, reaction: 'idle'},
              player: {...c.player, reaction: 'idle'},
              analyst: {...c.analyst, reaction: 'idle'},
              player2: {...c.player2, reaction: 'idle'},
            }));

            return null;
          }
          return {...prev, timer: nextTime};
        }

        return prev;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [deviceRole, activeClue, gameState.status, isGameMenuOpen, isHowToPlayOpen, isInviteModalOpen, isLeaderboardOpen, isTagEditorOpen, isTwoPlayerMode, isClientConnected, contestants]);

  // AI Buzzer Simulation when BUZZER_OPEN (Host only)
  useEffect(() => {
    if (deviceRole !== 'HOST' || !activeClue || activeClue.phase !== 'BUZZER_OPEN' || activeClue.isBonusWager) return;

    const coachCanBuzz = !isTwoPlayerMode && !isClientConnected && !activeClue.buzzerLockout.coach;
    const analystCanBuzz = !player3Human && !activeClue.buzzerLockout.analyst;

    const reflexMult = getConfig('aiReflexSpeedMultiplier') as number;
    const coachDelay = (aiConfig.coachSpeed + (Math.random() * 1.2 - 0.4)) * 1000 * reflexMult;
    const analystDelay = (aiConfig.analystSpeed + (Math.random() * 1.2 - 0.4)) * 1000 * reflexMult;

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    if (coachCanBuzz) {
      timeouts.push(
        setTimeout(() => {
          setActiveClue((prev) => {
            if (!prev || prev.phase !== 'BUZZER_OPEN' || prev.buzzedContestantId) return prev;
            gameAudio.playHoverMicroTone();
            setContestants((c) => ({...c, coach: {...c.coach, reaction: 'buzzing'}}));
            return {
              ...prev,
              phase: 'ANSWERING',
              buzzedContestantId: 'coach',
              timer: 3.5,
              feedbackText: 'Coach Dave buzzed in!',
            };
          });
        }, Math.max(300, coachDelay))
      );
    }

    if (analystCanBuzz) {
      timeouts.push(
        setTimeout(() => {
          setActiveClue((prev) => {
            if (!prev || prev.phase !== 'BUZZER_OPEN' || prev.buzzedContestantId) return prev;
            gameAudio.playHoverMicroTone();
            setContestants((c) => ({...c, analyst: {...c.analyst, reaction: 'buzzing'}}));
            return {
              ...prev,
              phase: 'ANSWERING',
              buzzedContestantId: 'analyst',
              timer: 3.5,
              feedbackText: 'Stats Riley buzzed in!',
            };
          });
        }, Math.max(300, analystDelay))
      );
    }

    return () => {
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [deviceRole, activeClue?.phase, activeClue?.buzzerLockout, activeClue?.isBonusWager, aiConfig, isTwoPlayerMode, isClientConnected, player3Human]);

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
    const accuracy = isCoach ? aiConfig.coachAcc : aiConfig.analystAcc;
    const isCorrect = Math.random() < accuracy;
    const isBonus = activeClue.isBonusWager;
    const clueValue = isBonus ? activeClue.bonusWagerInput : activeClue.clue.value;

    const thinkTime = 1400 + Math.random() * 1200;

    const timer = setTimeout(() => {
      setActiveClue((prev) => {
        if (!prev || prev.phase !== 'ANSWERING' || prev.buzzedContestantId !== buzzedId) return prev;

        const contestantName = contestants[buzzedId]?.name || 'Opponent';
        const answerText = isCorrect
          ? prev.clue.correctAnswer
          : prev.clue.distractors[Math.floor(Math.random() * prev.clue.distractors.length)];

        if (isCorrect) {
          gameAudio.playCoinPickup();
          setContestants((c) => ({
            ...c,
            [buzzedId]: {
              ...c[buzzedId],
              score: c[buzzedId].score + clueValue,
              reaction: 'correct',
              correctCount: c[buzzedId].correctCount + 1,
            },
          }));

          setActiveSelector(buzzedId);

          return {
            ...prev,
            phase: 'REVEALED',
            timer: 2.8,
            feedbackText: `${contestantName} is CORRECT with "${answerText}"! (+$${clueValue.toLocaleString()})`,
          };
        } else {
          gameAudio.playErrorBuzz();
          setContestants((c) => ({
            ...c,
            [buzzedId]: {
              ...c[buzzedId],
              score: c[buzzedId].score - clueValue,
              reaction: 'wrong',
              wrongCount: c[buzzedId].wrongCount + 1,
            },
          }));

          const newLockouts = {...prev.buzzerLockout, [buzzedId]: true};
          const activeList: ContestantId[] = isTwoPlayerMode || isClientConnected ? ['player', 'player2', 'analyst'] : ['player', 'coach', 'analyst'];
          const allLocked = activeList.every((id) => newLockouts[id]);

          if (isBonus || allLocked) {
            return {
              ...prev,
              phase: 'REVEALED',
              timer: 3.0,
              feedbackText: `${contestantName} said "${answerText}" (Incorrect). Correct was: ${prev.clue.correctAnswer}`,
            };
          }

          return {
            ...prev,
            phase: 'BUZZER_OPEN',
            buzzedContestantId: null,
            buzzerLockout: newLockouts,
            timer: 4.5,
            feedbackText: `${contestantName} said "${answerText}" (Incorrect, -$${clueValue.toLocaleString()}). Buzzers re-opened!`,
          };
        }
      });
    }, thinkTime);

    return () => clearTimeout(timer);
  }, [deviceRole, activeClue?.phase, activeClue?.buzzedContestantId, activeClue?.isBonusWager, activeClue?.bonusWagerLocked, aiConfig, contestants, isTwoPlayerMode, isClientConnected, player3Human]);

  // Spacebar, Enter, number (1-8), and letter (A-H) shortcuts for buzzing and answering
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
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
            (activeClue.buzzedContestantId === 'player' || (activeClue.buzzedContestantId === 'player2' && !isClientConnected))
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
          p2pRef.current?.send({
            type: 'CLIENT_BUZZ',
            contestantId: mySeat,
            timestamp: Date.now(),
          });
        }
        return;
      }

      // Host Local Keybindings
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
  }, [activeClue, handleContestantBuzz, handleContestantSubmitAnswer, answerMode, isTwoPlayerMode, isClientConnected, deviceRole, mySeat]);

  // Check Round Completion & Transition (Host only)
  useEffect(() => {
    if (deviceRole !== 'HOST' || activeClue) return;
    const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
    if (!board.length) return;

    const allClueIds = board.flatMap((cat) => cat.clues.map((c) => c.id));
    const answeredCount = allClueIds.filter((id) => answeredClueIds.has(id)).length;

    if (currentRound === 'ROUND_1' && answeredCount >= allClueIds.length) {
      gameAudio.playLevelUpStinger();
      setCurrentRound('CHAMPIONSHIP');
      const sortedContestants = ((isTwoPlayerMode || isClientConnected) ? ['player', 'player2', 'analyst'] : ['player', 'coach', 'analyst']) as ContestantId[];
      sortedContestants.sort((a, b) => contestants[a].score - contestants[b].score);
      setActiveSelector(sortedContestants[0]);
    } else if (currentRound === 'CHAMPIONSHIP' && answeredCount >= allClueIds.length) {
      gameAudio.playPowerupChime();
      setCurrentRound('FINAL_SHOWDOWN');
      setFinalShowdownPhase('WAGER');
      setPlayerFinalWager(Math.max(1000, contestants.player.score));
      setPlayer2FinalWager(Math.max(1000, contestants.player2.score));
      setPlayer3FinalWager(Math.max(1000, contestants.analyst.score));
    }
  }, [deviceRole, activeClue, currentRound, round1Board, round2Board, answeredClueIds, contestants, isTwoPlayerMode, isClientConnected]);

  // Final Showdown Wager Confirmation (Host)
  const confirmFinalWagers = useCallback(() => {
    gameAudio.playConfirmSelect();

    const calculateAIWager = (score: number, isLeader: boolean) => {
      const bank = Math.max(1000, score);
      if (score <= 0) return 1000;
      if (isLeader) return Math.floor(bank * 0.65);
      return Math.floor(bank * (0.8 + Math.random() * 0.2));
    };

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
        wager: calculateAIWager(c.coach.score, c.coach.score === maxScore),
      },
      analyst: {
        ...c.analyst,
        wager: player3Human ? player3FinalWager : calculateAIWager(c.analyst.score, c.analyst.score === maxScore),
      },
      player: {
        ...c.player,
        wager: playerFinalWager,
      },
      player2: {
        ...c.player2,
        wager: player2FinalWager,
      },
    }));

    setFinalShowdownPhase('CLUE');
    setFinalShowdownTimer(30);
  }, [contestants, playerFinalWager, player2FinalWager, player3FinalWager, player3Human, isTwoPlayerMode, isClientConnected]);

  // Record game result to multi-dimensional leaderboard
  const saveMatchToLeaderboard = useCallback(
    (playerScore: number) => {
      const totalAttempts = matchStats.playerCorrect + matchStats.playerWrong;
      const accuracy = totalAttempts > 0 ? (matchStats.playerCorrect / totalAttempts) * 100 : 100;

      const opp = currentOpponentMode;
      const tier = difficulty as TriviaTier;
      const format = answerMode as AnswerFormat;

      const result = recordLeaderboardEntry(opp, tier, format, {
        playerName: playerName || 'Champion',
        score: playerScore,
        accuracy,
        questionsAnswered: totalAttempts,
        dailyDoublesWon: matchStats.bonusWagersHit,
      });

      setLeaderboardRefreshCounter((c) => c + 1);

      if (result.isTop10) {
        setHighScoreCelebration({
          rank: result.rank,
          isHighScore: result.isHighScore,
          score: playerScore,
          opponent: opp,
          tier,
          format,
        });
        if (result.isHighScore) {
          gameAudio.playVictoryFanfare();
        }
      }
    },
    [matchStats, currentOpponentMode, difficulty, answerMode, playerName]
  );

  // Final Showdown Resolution (Host)
  const finalizeFinalShowdown = useCallback(() => {
    if (!finalClue) return;

    const threshold = getConfig('fuzzyMatchThreshold') as number;
    const playerCorrect = checkTypedAnswer(finalPlayerInput, finalClue, threshold);
    const player2Correct = (isTwoPlayerMode || isClientConnected) ? checkTypedAnswer(finalPlayer2Input, finalClue, threshold) : false;

    const coachCorrect = Math.random() < aiConfig.coachAcc;
    const analystCorrect = player3Human
      ? checkTypedAnswer(finalPlayer3Input, finalClue, threshold)
      : Math.random() < aiConfig.analystAcc;

    const coachScoreDelta = coachCorrect ? contestants.coach.wager : -contestants.coach.wager;
    const analystScoreDelta = analystCorrect ? contestants.analyst.wager : -contestants.analyst.wager;
    const playerScoreDelta = playerCorrect ? contestants.player.wager : -contestants.player.wager;
    const player2ScoreDelta = player2Correct ? contestants.player2.wager : -contestants.player2.wager;

    const finalCoachScore = contestants.coach.score + coachScoreDelta;
    const finalAnalystScore = contestants.analyst.score + analystScoreDelta;
    const finalPlayerScore = contestants.player.score + playerScoreDelta;
    const finalPlayer2Score = contestants.player2.score + player2ScoreDelta;

    setContestants((c) => ({
      ...c,
      coach: {
        ...c.coach,
        score: finalCoachScore,
        reaction: coachCorrect ? 'correct' : 'wrong',
        finalCorrect: coachCorrect,
        finalAnswer: coachCorrect ? finalClue.correctAnswer : finalClue.distractors[0],
      },
      analyst: {
        ...c.analyst,
        score: finalAnalystScore,
        reaction: analystCorrect ? 'correct' : 'wrong',
        finalCorrect: analystCorrect,
        finalAnswer: player3Human
          ? finalPlayer3Input || '(No Answer)'
          : analystCorrect
          ? finalClue.correctAnswer
          : finalClue.distractors[1],
      },
      player: {
        ...c.player,
        score: finalPlayerScore,
        reaction: playerCorrect ? 'correct' : 'wrong',
        finalCorrect: playerCorrect,
        finalAnswer: finalPlayerInput || '(No Answer)',
      },
      player2: {
        ...c.player2,
        score: finalPlayer2Score,
        reaction: player2Correct ? 'correct' : 'wrong',
        finalCorrect: player2Correct,
        finalAnswer: finalPlayer2Input || '(No Answer)',
      },
    }));

    setFinalShowdownPhase('RESULTS');

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
    saveMatchToLeaderboard(finalPlayerScore);

    if (humanWon) {
      gameAudio.playVictoryFanfare();
      setGameState((prev) => ({...prev, status: 'VICTORY', score: Math.max(finalPlayerScore, finalPlayer2Score)}));
    } else {
      gameAudio.playDefeatMotif();
      setGameState((prev) => ({...prev, status: 'GAME_OVER', score: finalPlayerScore}));
    }
  }, [finalClue, finalPlayerInput, finalPlayer2Input, finalPlayer3Input, player3Human, isTwoPlayerMode, isClientConnected, aiConfig, contestants, saveMatchToLeaderboard]);

  // Final Showdown Clue Timer Loop (Host)
  useEffect(() => {
    if (deviceRole !== 'HOST' || currentRound !== 'FINAL_SHOWDOWN' || finalShowdownPhase !== 'CLUE' || gameState.status !== 'PLAYING' || isGameMenuOpen || isLeaderboardOpen || isTagEditorOpen) return;

    const interval = setInterval(() => {
      setFinalShowdownTimer((prev) => {
        if (prev <= 1) {
          finalizeFinalShowdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [deviceRole, currentRound, finalShowdownPhase, gameState.status, isGameMenuOpen, isLeaderboardOpen, isTagEditorOpen, finalizeFinalShowdown]);

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

  // Active contestants list for display
  const activeContestantsList = useMemo(() => {
    if (isTwoPlayerMode || isClientConnected) {
      return ['player', 'player2', 'analyst'] as ContestantId[];
    }
    return ['coach', 'player', 'analyst'] as ContestantId[];
  }, [isTwoPlayerMode, isClientConnected]);

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
      leaderboardFilterFormat
    );
  }, [leaderboardFilterOpponent, leaderboardFilterTier, leaderboardFilterFormat, leaderboardRefreshCounter]);

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

  // =========================================================================
  // VIEW 1: DEDICATED MOBILE / SEPARATE DEVICE GAMEPAD CLIENT VIEW (PLAYER 2)
  // =========================================================================
  if (deviceRole === 'CLIENT') {
    const isPlayer2Selector = activeSelector === mySeat;
    const isPlayer2Buzzed = activeClue?.buzzedContestantId === mySeat;
    const isPlayer2Locked = Boolean(activeClue?.buzzerLockout[mySeat]);
    const isDailyDoubleForMe = Boolean(activeClue?.isBonusWager && activeClue.bonusSelectingPlayerId === mySeat);
    const myLabel = seatLabel(mySeat);
    const board = currentRound === 'ROUND_1' ? round1Board : round2Board;
    const isClueObscured = Boolean(activeClue?.isBonusWager && !activeClue.bonusWagerLocked);

    return (
      <div className="fixed inset-0 overflow-y-auto bg-slate-950 text-white font-sans flex flex-col justify-between p-3 sm:p-4 select-none touch-manipulation">
        {/* Background Atmosphere */}
        <div className="absolute inset-0 z-0 bg-gradient-to-t from-slate-950 via-slate-900 to-blue-950 opacity-90 pointer-events-none" />

        {/* Client Top Header Status */}
        <header className="relative z-10 w-full bg-slate-900/95 border border-amber-500/60 rounded-xl p-2.5 shadow-lg flex items-center justify-between gap-2">
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
                <span className="text-slate-300">{p2pStatus === 'connected' ? 'Synced with Host' : p2pDetail || 'Connecting...'}</span>
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
                setDeviceRole('HOST');
                showToast('Switched to Host Arena mode');
              }}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
              title="Switch to Host Arena View">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Client Main Body: Dynamic Gamepad Controls */}
        <main className="relative z-10 flex-1 my-3 flex flex-col justify-center items-center w-full max-w-lg mx-auto">
          {/* 1. If Match has not started or in Start Screen */}
          {gameState.status === 'START' && (
            <div className="w-full bg-slate-900/90 border border-amber-500/50 rounded-2xl p-5 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-amber-400 animate-bounce" />
              </div>
              <h2 className="text-lg font-black text-amber-400 uppercase">
                {p2pStatus === 'error' ? 'COULD NOT JOIN' : p2pStatus === 'connected' ? `CONNECTED AS PLAYER ${myLabel.slice(1)}` : 'CONNECTING...'}
              </h2>
              <p className="text-xs text-slate-300">
                {p2pStatus === 'error'
                  ? p2pDetail
                  : 'You are locked in for the match! Waiting for the host (Player 1) to pick the settings and start the game.'}
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
                    ${activeClue.isBonusWager ? activeClue.bonusWagerInput : activeClue.clue.value}
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
                    {activeClue.clue.clue}
                  </p>
                )}

                <div className="text-xs font-bold text-amber-300">
                  {activeClue.feedbackText}
                </div>
              </div>

              {/* A. Reading Phase -> Lock indicator */}
              {!activeClue.isBonusWager && activeClue.phase === 'READING' && (
                <div className="w-full py-8 px-4 rounded-2xl bg-rose-950/70 border-2 border-rose-600 text-center flex flex-col items-center gap-2 animate-pulse">
                  <Clock className="w-8 h-8 text-rose-400" />
                  <span className="text-sm font-black text-rose-200">WAIT FOR HOST LIGHT TO BUZZ</span>
                  <span className="text-xs text-rose-400 font-mono">Buzzer opens in {activeClue.timer.toFixed(1)}s</span>
                </div>
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
                        p2pRef.current?.send({
                          type: 'CLIENT_BUZZ',
                          contestantId: mySeat,
                          timestamp: Date.now(),
                        });
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

              {/* C. Daily Double Wager for Player 2 */}
              {isDailyDoubleForMe && !activeClue.bonusWagerLocked && (
                <div className="w-full bg-slate-900 border-2 border-amber-400 rounded-2xl p-4 flex flex-col items-center gap-3">
                  <div className="text-xs font-black text-amber-300 uppercase flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>SET YOUR DAILY DOUBLE WAGER</span>
                  </div>

                  <div className="text-[11px] text-slate-300">
                    Bankroll: <strong className="text-amber-400">${contestants[mySeat].score.toLocaleString()}</strong> | Min: $5 | Max: $
                    {Math.max(currentRound === 'ROUND_1' ? 1000 : 2000, contestants[mySeat].score).toLocaleString()}
                  </div>

                  <div className="flex items-center gap-2 w-full justify-center">
                    <span className="text-lg font-bold text-amber-400">$</span>
                    <input
                      type="number"
                      min={5}
                      max={Math.max(currentRound === 'ROUND_1' ? 1000 : 2000, contestants[mySeat].score)}
                      value={activeClue.bonusWagerInput}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 5;
                        p2pRef.current?.send({
                          type: 'CLIENT_SET_WAGER',
                          contestantId: mySeat,
                          wager: val,
                          lockIn: false,
                        });
                      }}
                      className="w-32 bg-slate-950 border-2 border-amber-400 text-amber-300 font-black text-center text-xl py-1 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 w-full">
                    <button
                      onClick={() => {
                        const maxVal = Math.max(currentRound === 'ROUND_1' ? 1000 : 2000, contestants[mySeat].score);
                        p2pRef.current?.send({
                          type: 'CLIENT_SET_WAGER',
                          contestantId: mySeat,
                          wager: maxVal,
                          lockIn: false,
                        });
                      }}
                      className="py-2 px-2 bg-blue-950 border border-blue-700 text-blue-200 rounded-lg text-xs font-bold">
                      TRUE DAILY DOUBLE (MAX)
                    </button>

                    <button
                      onClick={() => {
                        const maxVal = Math.max(currentRound === 'ROUND_1' ? 1000 : 2000, contestants[mySeat].score);
                        p2pRef.current?.send({
                          type: 'CLIENT_SET_WAGER',
                          contestantId: mySeat,
                          wager: Math.max(50, Math.floor(maxVal / 2)),
                          lockIn: false,
                        });
                      }}
                      className="py-2 px-2 bg-blue-950 border border-blue-700 text-blue-200 rounded-lg text-xs font-bold">
                      HALF BANK
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      p2pRef.current?.send({
                        type: 'CLIENT_SET_WAGER',
                        contestantId: mySeat,
                        wager: activeClue.bonusWagerInput,
                        lockIn: true,
                      });
                    }}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black rounded-xl text-sm shadow-lg active:scale-95 flex items-center justify-center gap-1.5">
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>CONFIRM WAGER & REVEAL CLUE</span>
                  </button>
                </div>
              )}

              {/* D. Answering Phase (If Player 2 Buzzed In or Daily Double is Active for P2) */}
              {activeClue.phase === 'ANSWERING' && isPlayer2Buzzed && (!activeClue.isBonusWager || activeClue.bonusWagerLocked) && (
                <div className="w-full flex flex-col gap-2">
                  <div className="text-xs font-black text-emerald-400 text-center uppercase animate-bounce">
                    YOUR TURN TO ANSWER! ({activeClue.timer.toFixed(1)}s)
                  </div>

                  {answerMode === 'VOICE' && isVoiceSupported ? (
                    <VoiceAnswerButton
                      key={activeClue.clue.id}
                      autoStart
                      size="large"
                      label="SAY YOUR ANSWER"
                      onHeard={(heard) =>
                        answerByVoice(heard, (answer) =>
                          p2pRef.current?.send({type: 'CLIENT_ANSWER', contestantId: mySeat, answer})
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
                        value={activeClue.typedInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActiveClue((prev) => (prev ? {...prev, typedInput: val} : null));
                        }}
                        className="flex-1 bg-slate-950 border-2 border-amber-400 px-3 py-2 text-white font-bold rounded-lg"
                      />
                      <button
                        onClick={() => {
                          p2pRef.current?.send({
                            type: 'CLIENT_ANSWER',
                            contestantId: mySeat,
                            answer: activeClue.typedInput,
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
                      answerByVoice(heard, (answer) =>
                        p2pRef.current?.send({type: 'CLIENT_ANSWER', contestantId: mySeat, answer})
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
              {isPlayer2Selector ? (
                <div className="w-full bg-slate-900 border-2 border-emerald-400 rounded-2xl p-3 text-center">
                  <div className="text-xs font-black text-emerald-400 uppercase flex items-center justify-center gap-1.5 mb-2">
                    <Star className="w-4 h-4 fill-emerald-400" />
                    <span>YOU HAVE BOARD CONTROL! Pick a Clue Tile:</span>
                  </div>

                  {/* Compact Mobile Selection Grid */}
                  <div className="grid grid-cols-6 gap-1">
                    {board.map((cat, cIdx) => (
                      <div key={cat.title} className="flex flex-col gap-1">
                        <div className="text-[8px] font-bold text-amber-300 truncate text-center p-1 bg-blue-950 rounded border border-blue-800" title={cat.title}>
                          {cat.title}
                        </div>
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
                              className={`py-1.5 rounded text-[10px] sm:text-xs font-black border transition-all ${
                                isAnswered
                                  ? 'bg-slate-950 text-slate-700 border-slate-800'
                                  : 'bg-blue-900 hover:bg-blue-800 text-amber-300 border-amber-500/60 active:scale-95 shadow'
                              }`}>
                              ${clue.value}
                            </button>
                          );
                        })}
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

          {/* 4. Final Showdown for Player 2 */}
          {gameState.status === 'PLAYING' && currentRound === 'FINAL_SHOWDOWN' && (
            <div className="w-full bg-slate-900 border-2 border-amber-400 rounded-2xl p-4 text-center flex flex-col items-center gap-3">
              <Flame className="w-8 h-8 text-amber-400 animate-pulse" />
              <h2 className="text-base font-black text-amber-400 uppercase">FINAL SHOWDOWN</h2>
              <div className="text-xs text-blue-200">
                CATEGORY: <strong className="text-white">{finalClue?.category}</strong>
              </div>

              {finalShowdownPhase === 'WAGER' && (
                <div className="w-full flex flex-col gap-2">
                  <div className="text-xs text-slate-300">Enter your final cash wager:</div>
                  <div className="flex justify-center items-center gap-2">
                    <span className="text-lg font-bold text-amber-400">$</span>
                    <input
                      type="number"
                      min={0}
                      max={Math.max(1000, contestants[mySeat].score)}
                      value={player2FinalWager}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setPlayer2FinalWager(val);
                        p2pRef.current?.send({
                          type: 'CLIENT_FINAL_WAGER',
                          contestantId: mySeat,
                          wager: val,
                        });
                      }}
                      className="w-32 bg-slate-950 border border-amber-400 px-3 py-1.5 rounded-lg text-amber-300 font-black text-center"
                    />
                  </div>
                </div>
              )}

              {finalShowdownPhase === 'CLUE' && (
                <div className="w-full flex flex-col gap-2">
                  <div className="text-xs font-mono text-rose-400 font-bold">Time Left: {finalShowdownTimer}s</div>
                  <div className="p-3 bg-slate-950 rounded-lg text-xs font-medium text-slate-200 border border-blue-800">
                    {finalClue?.clue}
                  </div>
                  <input
                    type="text"
                    placeholder="Type final answer..."
                    value={finalPlayer2Input}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFinalPlayer2Input(val);
                      p2pRef.current?.send({
                        type: 'CLIENT_FINAL_ANSWER',
                        contestantId: mySeat,
                        answer: val,
                      });
                    }}
                    className="w-full bg-slate-950 border-2 border-amber-400 px-3 py-2 rounded-lg text-white font-bold text-center"
                  />
                  <VoiceAnswerButton
                    label="SAY FINAL ANSWER"
                    onHeard={(heard) =>
                      finalAnswerByVoice(heard, (answer) => {
                        setFinalPlayer2Input(answer);
                        p2pRef.current?.send({type: 'CLIENT_FINAL_ANSWER', contestantId: mySeat, answer});
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}

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

  // =========================================================================
  // VIEW 2: STANDARD ARENA BROADCAST / HOST VIEW
  // =========================================================================
  return (
    <div className="fixed inset-0 overflow-hidden touch-none flex flex-col bg-slate-950 text-white font-sans select-none">
      {/* Background BGM */}
      <BackgroundMusic url={activeBgmUrl} isPlaying={isMusicPlaying} isMuted={musicMuted} />

      {/* Arena Visual Backdrop */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {assetsReady && assets.bgStudio && (
          <img
            src={assets.bgStudio.src}
            alt="Sports Studio Arena"
            className="w-full h-full object-cover opacity-35 filter blur-[1px] transform scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-blue-950/50" />
      </div>

      {/* Toast Alert Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 bg-amber-500 text-slate-950 font-black rounded-full shadow-2xl border-2 border-white flex items-center gap-2 text-xs sm:text-sm animate-bounce">
          <Sparkles className="w-4 h-4 fill-slate-950" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP BROADCAST HUD & SCOREBOARD */}
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

      {/* Main Studio Arena Stage Area */}
      <main className="relative z-10 flex-1 w-full min-h-0 flex flex-col justify-between overflow-hidden p-2 sm:p-4">
        {/* UPPER ARENA: Trivia Board or Final Showdown View */}
        <div className="flex-1 w-full min-h-0 flex flex-col items-center justify-center">
          {currentRound !== 'FINAL_SHOWDOWN' ? (
            /* TRIVIA BOARD (6 Categories x 5 Clues) */
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
              <div className="grid grid-cols-6 gap-1 sm:gap-1.5 text-center">
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

              {/* Clue Dollar Tiles Grid (6 columns x 5 rows) */}
              <div className="grid grid-cols-6 gap-1 sm:gap-1.5 flex-1 min-h-0">
                {[0, 1, 2, 3, 4].map((rowIdx) =>
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
                    Lock in your cash wager based on your confidence in this championship category.
                  </p>

                  <div className="w-full max-w-sm flex flex-col gap-3">
                    {/* Player 1 Wager Input */}
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-amber-500/50">
                      <div className="text-xs font-bold text-amber-300 mb-1">
                        {contestants.player.name} (Bank: ${contestants.player.score.toLocaleString()}):
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-amber-400">$</span>
                        <input
                          type="number"
                          min={0}
                          max={Math.max(1000, contestants.player.score)}
                          step={100}
                          value={playerFinalWager}
                          onChange={(e) =>
                            setPlayerFinalWager(
                              Math.max(
                                0,
                                Math.min(Math.max(1000, contestants.player.score), parseInt(e.target.value) || 0)
                              )
                            )
                          }
                          className="flex-1 bg-slate-900 border border-amber-400 text-amber-400 text-base font-black px-3 py-1.5 rounded-lg text-center"
                        />
                        <button
                          onClick={() => setPlayerFinalWager(Math.max(1000, contestants.player.score))}
                          className="text-[10px] px-2 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded font-bold">
                          MAX
                        </button>
                      </div>
                    </div>

                    {/* Player 2 Wager Input if in 2P Duel */}
                    {(isTwoPlayerMode || isClientConnected) && (
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-amber-500/50">
                        <div className="text-xs font-bold text-amber-300 mb-1">
                          {contestants.player2.name} (Bank: ${contestants.player2.score.toLocaleString()}):
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-amber-400">$</span>
                          <input
                            type="number"
                            min={0}
                            max={Math.max(1000, contestants.player2.score)}
                            step={100}
                            value={player2FinalWager}
                            onChange={(e) =>
                              setPlayer2FinalWager(
                                Math.max(
                                  0,
                                  Math.min(Math.max(1000, contestants.player2.score), parseInt(e.target.value) || 0)
                                )
                              )
                            }
                            className="flex-1 bg-slate-900 border border-amber-400 text-amber-400 text-base font-black px-3 py-1.5 rounded-lg text-center"
                          />
                          <button
                            onClick={() => setPlayer2FinalWager(Math.max(1000, contestants.player2.score))}
                            className="text-[10px] px-2 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded font-bold">
                            MAX
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={confirmFinalWagers}
                    className="min-w-[48px] min-h-[48px] mt-2 px-6 sm:px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm sm:text-base shadow-lg transition-transform active:scale-95 flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    LOCK IN WAGER & REVEAL CLUE
                  </button>
                </div>
              )}

              {finalShowdownPhase === 'CLUE' && (
                <div className="w-full flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-rose-400 text-base sm:text-lg font-black bg-rose-950/60 px-4 py-1.5 rounded-full border border-rose-700 animate-pulse">
                    <Clock className="w-5 h-5" />
                    <span>0:{finalShowdownTimer.toString().padStart(2, '0')}</span>
                  </div>

                  <div className="w-full bg-slate-950/90 border border-blue-800 rounded-xl p-3 sm:p-4 text-xs sm:text-base text-slate-100 font-medium leading-relaxed">
                    {finalClue?.clue}
                  </div>

                  <div className="w-full max-w-md flex flex-col gap-2.5">
                    <input
                      type="text"
                      placeholder={(isTwoPlayerMode || isClientConnected) ? `${playerName} (P1): Type final answer...` : 'Type your final answer here...'}
                      value={finalPlayerInput}
                      onChange={(e) => setFinalPlayerInput(e.target.value)}
                      autoFocus
                      className="w-full bg-slate-950 border-2 border-amber-500 text-white text-sm sm:text-base font-bold px-4 py-2 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <VoiceAnswerButton label="SAY FINAL ANSWER" onHeard={(heard) => finalAnswerByVoice(heard, setFinalPlayerInput)} />

                    {(isTwoPlayerMode || isClientConnected) && !isClientConnected && (
                      <input
                        type="text"
                        placeholder="Player 2: Type final answer..."
                        value={finalPlayer2Input}
                        onChange={(e) => setFinalPlayer2Input(e.target.value)}
                        className="w-full bg-slate-950 border-2 border-amber-500 text-white text-sm sm:text-base font-bold px-4 py-2 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    )}

                    <button
                      onClick={finalizeFinalShowdown}
                      className="min-w-[48px] min-h-[48px] w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-lg shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base">
                      <CheckCircle2 className="w-5 h-5" />
                      SUBMIT FINAL ANSWER
                    </button>
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

      {/* ACTIVE CLUE BROADCAST MODAL OVERLAY (HOST) */}
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
                  <span>READING CLUE... (BUZZER OPENS IN {activeClue.timer.toFixed(1)}s)</span>
                </div>
              )}
              {activeClue.phase === 'BUZZER_OPEN' && (
                <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 text-xs font-black animate-bounce">
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <span>BUZZERS ACTIVE! ({activeClue.timer.toFixed(1)}s)</span>
                </div>
              )}
              {activeClue.phase === 'ANSWERING' && (!activeClue.isBonusWager || activeClue.bonusWagerLocked) && (
                <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-blue-900 border border-blue-500 text-blue-200 text-xs font-bold">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>ANSWER TIMER: {activeClue.timer.toFixed(1)}s</span>
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
                  {Math.max(currentRound === 'ROUND_1' ? 1000 : 2000, contestants[activeClue.bonusSelectingPlayerId]?.score).toLocaleString()}
                </div>

                {activeClue.bonusSelectingPlayerId === 'player' || (!isClientConnected && activeClue.bonusSelectingPlayerId === 'player2') ? (
                  /* Human Wager Controls */
                  <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                    <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border-2 border-amber-400 shadow-inner">
                      <span className="text-base font-bold text-amber-400">$</span>
                      <input
                        type="number"
                        min={5}
                        max={Math.max(currentRound === 'ROUND_1' ? 1000 : 2000, contestants[activeClue.bonusSelectingPlayerId]?.score)}
                        step={50}
                        value={activeClue.bonusWagerInput}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 5;
                          const maxVal = Math.max(currentRound === 'ROUND_1' ? 1000 : 2000, contestants[activeClue.bonusSelectingPlayerId]?.score);
                          setActiveClue((prev) => (prev ? {...prev, bonusWagerInput: Math.max(5, Math.min(maxVal, val))} : null));
                        }}
                        className="w-24 sm:w-32 bg-transparent text-amber-300 font-black text-center text-base sm:text-lg focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={() => {
                        const maxVal = Math.max(currentRound === 'ROUND_1' ? 1000 : 2000, contestants[activeClue.bonusSelectingPlayerId]?.score);
                        setActiveClue((prev) => (prev ? {...prev, bonusWagerInput: maxVal} : null));
                      }}
                      className="px-3 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded-md text-xs font-bold transition-all active:scale-95">
                      TRUE DAILY DOUBLE (MAX)
                    </button>

                    <button
                      onClick={() => {
                        const maxVal = Math.max(currentRound === 'ROUND_1' ? 1000 : 2000, contestants[activeClue.bonusSelectingPlayerId]?.score);
                        setActiveClue((prev) => (prev ? {...prev, bonusWagerInput: Math.max(50, Math.floor(maxVal / 2))} : null));
                      }}
                      className="px-3 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded-md text-xs font-bold transition-all active:scale-95">
                      HALF
                    </button>

                    <button
                      onClick={() => {
                        const roundMax = currentRound === 'ROUND_1' ? 1000 : 2000;
                        setActiveClue((prev) => (prev ? {...prev, bonusWagerInput: roundMax} : null));
                      }}
                      className="px-3 py-1.5 bg-blue-950 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded-md text-xs font-bold transition-all active:scale-95">
                      ${currentRound === 'ROUND_1' ? '1,000' : '2,000'}
                    </button>

                    <button
                      onClick={() => {
                        gameAudio.playConfirmSelect();
                        setActiveClue((prev) =>
                          prev
                            ? {
                                ...prev,
                                bonusWagerLocked: true,
                                timer: 12.0,
                                maxTimer: 12.0,
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
                          const numLabel = idx + 1;
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

      {/* CONTESTANT TAG EDITOR MODAL (ENTER/ESC, EMOJIS, SAVE/CANCEL) */}
      {isTagEditorOpen && (
        <MenuOverlay tone="neutral" zIndex={85}>
          <div className="w-full max-w-md bg-gradient-to-b from-slate-900 via-slate-900 to-blue-950 border-2 border-amber-400 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col text-left">
            <div className="flex items-center justify-between border-b border-blue-900 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 shadow">
                  <User className="w-5 h-5 fill-slate-950" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-amber-400 uppercase tracking-wider">
                    EDIT CONTESTANT TAG
                  </h2>
                  <div className="text-[10px] text-slate-400">
                    Set your custom broadcast name & leaderboard identity
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsTagEditorOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Input Form with Char Limit */}
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex justify-between items-center text-xs">
                <label className="font-bold text-amber-300">Contestant Name / Tag:</label>
                <span className="text-[10px] text-slate-400 font-mono">{tagEditorInput.length} / 18</span>
              </div>
              <input
                type="text"
                maxLength={18}
                value={tagEditorInput}
                onChange={(e) => setTagEditorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTag();
                  if (e.key === 'Escape') setIsTagEditorOpen(false);
                }}
                autoFocus
                placeholder="Enter your name or gamer tag..."
                className="w-full bg-slate-950 border-2 border-amber-400 text-amber-300 font-black text-base px-3.5 py-2.5 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            {/* Quick Preset Ideas */}
            <div className="mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Quick Title Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAG_SUGGESTIONS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setTagEditorInput(preset);
                      gameAudio.playHoverMicroTone();
                    }}
                    className="px-2 py-1 bg-slate-950 hover:bg-blue-900 border border-blue-800/80 rounded-lg text-[11px] text-slate-200 font-bold transition-colors">
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Buttons: Save & Cancel */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => setIsTagEditorOpen(false)}
                className="min-h-[44px] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs sm:text-sm transition-colors">
                Cancel (Esc)
              </button>
              <button
                onClick={() => handleSaveTag()}
                className="min-h-[44px] py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Save Tag (Enter)</span>
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}

      {/* COMPREHENSIVE MULTI-DIMENSIONAL LEADERBOARDS MODAL */}
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
                      leaderboardFilterFormat
                    );
                    setLeaderboardRefreshCounter((c) => c + 1);
                    showToast('Reset category records to benchmark');
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Reset Category</span>
                </button>

                <button
                  onClick={() => {
                    resetAllLeaderboards();
                    setLeaderboardRefreshCounter((c) => c + 1);
                    showToast('All leaderboards reset to benchmarks');
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

      {/* START MENU OVERLAY */}
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
              Face off in NFL trivia with {totalQuestionCount.toLocaleString()} questions in {totalCategoryCount} categories
              {bankInfo ? `, updated through the ${bankInfo.dataThrough}` : ''}.
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
                  <span>{isClientConnected ? `✓ ${Object.keys(remoteSeats).length + 1} Phones Linked` : 'Invite Phones (up to 3)'}</span>
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

            {/* Start Button */}
            <button
              ref={startButtonRef}
              autoFocus
              onClick={startMatch}
              className="min-w-[48px] min-h-[48px] w-full py-3 rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 text-slate-950 font-black text-base shadow-xl transition-transform active:scale-95 flex items-center justify-center gap-2 mb-3">
              <Play className="w-5 h-5 fill-slate-950" />
              ENTER THE ARENA
            </button>

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

      {/* INVITE FRIENDS / CROSS-DEVICE MULTIPLAYER MODAL */}
      {isInviteModalOpen && (
        <MenuOverlay tone="neutral" zIndex={80}>
          <div className="w-full max-w-lg bg-slate-900 border-2 border-emerald-400 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col text-left max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-6 h-6 text-emerald-400" />
                <div>
                  <h2 className="text-base sm:text-lg font-black text-emerald-400 uppercase tracking-wider">
                    PLAY ON SEPARATE DEVICES
                  </h2>
                  <div className="text-[10px] text-slate-400">
                    Host a game & scan QR or join from another phone / PC!
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="min-w-[40px] min-h-[40px] px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors">
                CLOSE
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="grid grid-cols-3 gap-1.5 mb-4 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setInviteModalTab('separate')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  inviteModalTab === 'separate'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <QrCode className="w-3.5 h-3.5" />
                <span>Host (QR Code)</span>
              </button>

              <button
                onClick={() => setInviteModalTab('join')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  inviteModalTab === 'join'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>Join Code</span>
              </button>

              <button
                onClick={() => setInviteModalTab('pass_play')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  inviteModalTab === 'pass_play'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <Users className="w-3.5 h-3.5" />
                <span>Pass & Play</span>
              </button>
            </div>

            {/* TAB 1: HOST GAME & SCANNABLE QR CODE */}
            {inviteModalTab === 'separate' && (
              <div className="flex flex-col gap-3 text-xs sm:text-sm text-slate-300">
                {/* Live Connection Status Badge */}
                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isClientConnected
                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                    : 'bg-slate-950 border-amber-500/50 text-amber-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isClientConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                    <span className="font-bold">
                      {isClientConnected ? '🟢 Friend Connected: Player 2 Ready!' : '🟡 Waiting for friend to scan QR...'}
                    </span>
                  </div>
                  <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded border border-slate-700 font-mono">
                    {roomCode}
                  </span>
                </div>

                {/* QR Code + Instructions */}
                <div className="bg-slate-950 p-4 rounded-xl border border-blue-900/60 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                  <div className="shrink-0">
                    <QRCodeView value={shareableJoinUrl} size={160} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-black text-amber-300 uppercase">
                      1. Scan with Phone Camera
                    </div>
                    <p className="text-[11px] text-slate-300 leading-tight">
                      Open your smartphone camera and point at the QR code to instantly join this match as Player 2!
                    </p>
                    <div className="text-xs font-black text-amber-300 uppercase mt-1">
                      2. Or Share Direct Link
                    </div>
                    <button
                      onClick={handleCopyInviteLink}
                      className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow transition-all active:scale-95">
                      <Share2 className="w-3.5 h-3.5" />
                      <span>COPY SHAREABLE JOIN LINK</span>
                    </button>
                  </div>
                </div>

                {/* Room Code & Quick Test buttons */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Room Code</div>
                    <div className="text-base font-black text-white font-mono">{roomCode}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={generateRoomCode}
                      className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                      title="Generate New Room Code">
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleCopyRoomCode}
                      className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1 shadow">
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </button>
                    <a
                      href={shareableJoinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Test New Tab</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: JOIN A FRIEND'S HOSTED ROOM */}
            {inviteModalTab === 'join' && (
              <div className="flex flex-col gap-3 text-xs sm:text-sm text-slate-300">
                <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/40 flex flex-col gap-3">
                  <div className="text-xs font-bold text-emerald-300 uppercase">
                    Enter Friend's 4-6 Digit Room Code
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. SPORT-1234"
                      value={joinInputCode}
                      onChange={(e) => setJoinInputCode(e.target.value.toUpperCase())}
                      className="flex-1 bg-slate-900 border-2 border-emerald-400 px-3 py-2 text-white font-black text-center rounded-lg text-base uppercase tracking-widest"
                    />
                    <button
                      onClick={() => {
                        const sanitized = joinInputCode.trim();
                        if (sanitized) {
                          setRoomCode(sanitized);
                          setDeviceRole('CLIENT');
                          setIsInviteModalOpen(false);
                          showToast(`Connecting to Room ${sanitized}...`);
                        } else {
                          showToast('Please enter a room code');
                        }
                      }}
                      className="px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-sm shadow">
                      CONNECT
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Connecting switches this browser window into the Player 2 controller view.
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PASS & PLAY SAME DEVICE */}
            {inviteModalTab === 'pass_play' && (
              <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/40 flex flex-col gap-3">
                <div className="text-xs text-amber-300 font-bold uppercase">Same-Device Pass & Play Duel</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Play head-to-head on this single device screen! P1 and P2 take turns selecting clue tiles and buzzing with Spacebar (P1) and Enter (P2) or screen tap buttons.
                </p>
                <button
                  onClick={() => {
                    setIsTwoPlayerMode((prev) => !prev);
                    gameAudio.playConfirmSelect();
                    showToast(isTwoPlayerMode ? 'Switched to Solo Champion' : '2-Player Duel Mode Enabled!');
                  }}
                  className={`min-h-[44px] py-2 px-3 rounded-lg font-black text-xs transition-all flex items-center justify-center gap-2 ${
                    isTwoPlayerMode
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-200 border border-slate-700'
                  }`}>
                  <Users className="w-4 h-4" />
                  <span>{isTwoPlayerMode ? '✓ 2-PLAYER PASS & PLAY ACTIVE' : 'ENABLE 2-PLAYER PASS & PLAY'}</span>
                </button>
              </div>
            )}

            <button
              onClick={() => setIsInviteModalOpen(false)}
              className="min-w-[48px] min-h-[48px] mt-4 w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm transition-colors shadow">
              DONE
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* PAUSE / IN-GAME MENU OVERLAY */}
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
                100+ unique questions per category with strict zero-repeat question, category, and answer enforcement
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

      {/* HOW TO PLAY OVERLAY MODAL */}
      {isHowToPlayOpen && (
        <MenuOverlay tone="neutral" zIndex={70}>
          <div className="w-full max-w-lg bg-slate-900 border-2 border-amber-400 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-lg sm:text-xl font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                HOW TO PLAY & ARENA RULES
              </h2>
              <button
                onClick={() => setIsHowToPlayOpen(false)}
                className="min-w-[44px] min-h-[44px] px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors">
                CLOSE
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs sm:text-sm text-slate-300 leading-relaxed overflow-y-auto max-h-[60vh] pr-1">
              <div>
                <strong className="text-amber-400">🏈 All-NFL Categories:</strong>
                <p className="mt-0.5 text-slate-400">
                  <strong>{totalQuestionCount.toLocaleString()} NFL questions in {totalCategoryCount} categories</strong>, from Super Bowls and the draft to this week's games. Questions are rebuilt every week from nflverse data, and no question, category or answer repeats within a game.
                </p>
              </div>

              <div>
                <strong className="text-amber-400">🏷️ Custom Contestant Name & Tag:</strong>
                <p className="mt-0.5 text-slate-400">
                  Click the <strong>Edit Tag</strong> button or your name badge anytime to personalize your contestant name. Your custom name tag is instantly saved and shared to leaderboards and multiplayer rooms.
                </p>
              </div>

              <div>
                <strong className="text-amber-400">🏆 Hall of Champions Multi-Tier Leaderboards:</strong>
                <p className="mt-0.5 text-slate-400">
                  Every match automatically qualifies for its combination of <strong>Opponent Mode</strong> (Rookie AI, Pro AI, All-Star AI, Legend AI, Pass & Play, Online Duel) + <strong>Trivia Tier</strong> + <strong>Answer Format</strong>! Check your ranks anytime.
                </p>
              </div>

              <div>
                <strong className="text-emerald-400">1. Cross-Device Multiplayer (Phone + Host):</strong>
                <p className="mt-0.5 text-slate-400">
                  Click <strong>Invite / Duel</strong> to generate a room QR code. Friends can scan on their smartphone or enter the code to play directly on their own device with a dedicated buzzer gamepad!
                </p>
              </div>

              <div>
                <strong className="text-amber-300">2. Board Control (Selection Turn):</strong>
                <p className="mt-0.5 text-slate-400">
                  The contestant who correctly answers a clue wins control of the board and chooses the next clue tile!
                </p>
              </div>

              <div>
                <strong className="text-amber-300">3. Daily Double Hidden Wagers:</strong>
                <p className="mt-0.5 text-slate-400">
                  Round 1 features <strong>1 Daily Double</strong>; Round 2 features <strong>2 Daily Doubles</strong>. When picked, the clue is <strong>hidden and classified</strong> until the contestant confirms their strategic cash wager!
                </p>
              </div>

              <div>
                <strong className="text-amber-300">4. Buzzer Timing:</strong>
                <p className="mt-0.5 text-slate-400">
                  Wait for the host light to turn active. Buzz with Spacebar, Enter, screen button, or mobile gamepad!
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsHowToPlayOpen(false)}
              className="min-w-[48px] min-h-[48px] mt-4 w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition-colors shadow">
              GOT IT, LET'S PLAY
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* POST-GAME VICTORY / RESULTS OVERLAY */}
      {(gameState.status === 'VICTORY' || gameState.status === 'GAME_OVER') && (
        <MenuOverlay tone={gameState.status === 'VICTORY' ? 'victory' : 'danger'} zIndex={60}>
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-400 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col items-center text-center">
            {/* Trophy Icon */}
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 mb-1">
              {assetsReady && assets.trophyGold && (
                <img
                  src={assets.trophyGold.src}
                  alt="Championship Trophy"
                  className="w-full h-full object-contain filter drop-shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse"
                />
              )}
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
                  Saved to <strong>{highScoreCelebration.opponent}</strong> ({highScoreCelebration.tier} / {highScoreCelebration.format})
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
    </div>
  );
}
