// The host device's studio: scoreboard, board, clue card and menus. Loaded only on the host,
// so phones and the stream screen don't download it.
import {Sparkles} from 'lucide-react';
import BackgroundMusic from '../utils/BackgroundMusic';
import {IMG_STUDIO} from '../ui/shared';
import {useGame} from '../game/GameContext';
import Scoreboard from './Scoreboard';
import Stage from './Stage';
import ClueCard from './ClueCard';
import TagEditor from './TagEditor';
import LeaderboardModal from './LeaderboardModal';
import StartMenu from './StartMenu';
import InviteModal from './InviteModal';
import GameMenu from './GameMenu';
import HowToPlay from './HowToPlay';
import ResultsOverlay from './ResultsOverlay';

export default function HostStudio() {
  const {musicMuted, toastMessage, activeBgmUrl, isMusicPlaying, pendingJoins, answerJoinRequest} = useGame();
  return (
    <div className="fixed inset-0 overflow-hidden touch-none flex flex-col bg-slate-950 text-white font-sans select-none">
      {/* Background BGM */}
      <BackgroundMusic url={activeBgmUrl} isPlaying={isMusicPlaying} isMuted={musicMuted} />

      {/* Arena Visual Backdrop */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <img
          src={IMG_STUDIO}
          alt=""
          className="w-full h-full object-cover opacity-35 filter blur-[1px] transform scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-blue-950/50" />
      </div>

      {/* Toast Alert Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 bg-amber-500 text-slate-950 font-black rounded-full shadow-2xl border-2 border-white flex items-center gap-2 text-xs sm:text-sm animate-bounce">
          <Sparkles className="w-4 h-4 fill-slate-950" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* The room locks when the game starts: a new phone needs the host's OK. */}
      {pendingJoins.length > 0 && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[110] w-[min(92vw,26rem)] flex flex-col gap-1.5" role="alert">
          {pendingJoins.map((j) => (
            <div key={j.peerId} className="flex items-center gap-2 rounded-xl border-2 border-amber-400 bg-slate-950/95 px-3 py-2 shadow-2xl">
              <span className="flex-1 min-w-0 text-xs sm:text-sm font-bold text-white truncate">
                <span className="text-amber-400">{j.name}</span> wants to join
              </span>
              <button onClick={() => answerJoinRequest(j.peerId, true)} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-black">
                Let in
              </button>
              <button onClick={() => answerJoinRequest(j.peerId, false)} className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-black">
                Turn away
              </button>
            </div>
          ))}
        </div>
      )}

      <Scoreboard />
      <Stage />
      <ClueCard />
      <TagEditor />
      <LeaderboardModal />
      <StartMenu />
      <InviteModal />
      <GameMenu />
      <HowToPlay />
      <ResultsOverlay />
    </div>
  );
}
