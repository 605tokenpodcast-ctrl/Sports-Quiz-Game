// The game. The host device runs the game and shows the studio; friends' phones show a controller,
// and a stream screen shows the game big. Each loads only its own screens.
import {lazy, Suspense} from 'react';
import {GameContext} from './game/GameContext';
import {useGameController} from './game/useGameController';

const HostStudio = lazy(() => import('./host/HostStudio'));
const PhoneScreen = lazy(() => import('./phone/PhoneScreen'));
const StreamScreen = lazy(() => import('./screen/StreamScreen'));

export default function App() {
  const game = useGameController();
  const {deviceRole} = game;
  const Screen = deviceRole === 'CLIENT' ? PhoneScreen : deviceRole === 'SCREEN' ? StreamScreen : HostStudio;
  return (
    <GameContext.Provider value={game}>
      <Suspense fallback={<div className="fixed inset-0 bg-slate-950" />}>
        <Screen />
      </Suspense>
    </GameContext.Provider>
  );
}
