// The game. The host device runs the game and shows the studio; friends' phones show a controller.
import {Sparkles} from 'lucide-react';
import BackgroundMusic from './utils/BackgroundMusic';
import {IMG_STUDIO} from './ui/shared';
import {GameContext} from './game/GameContext';
import {useGameController} from './game/useGameController';
import PhoneScreen from './phone/PhoneScreen';
import Scoreboard from './host/Scoreboard';
import Stage from './host/Stage';
import ClueCard from './host/ClueCard';
import TagEditor from './host/TagEditor';
import LeaderboardModal from './host/LeaderboardModal';
import StartMenu from './host/StartMenu';
import InviteModal from './host/InviteModal';
import GameMenu from './host/GameMenu';
import HowToPlay from './host/HowToPlay';
import ResultsOverlay from './host/ResultsOverlay';

export default function App() {
  const game = useGameController();
  const {musicMuted, deviceRole, toastMessage, activeBgmUrl, isMusicPlaying} = game;

  // A friend's phone shows the controller; the host shows the whole studio.
  if (deviceRole === 'CLIENT') {
    return (
      <GameContext.Provider value={game}>
        <PhoneScreen />
      </GameContext.Provider>
    );
  }

  return (
    <GameContext.Provider value={game}>
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
    </GameContext.Provider>
  );
}
