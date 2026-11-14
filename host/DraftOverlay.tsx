// The category draft on the host screen, over the board until every strike is in.
import CategoryDraft from '../ui/CategoryDraft';
import {draftTurn} from '../game/types';
import {useGame} from '../game/GameContext';

export default function DraftOverlay() {
  const {draft, round1Board, round2Board, contestants, hostPlays, isTwoPlayerMode, isClientConnected, strikeDraftColumn, gameState} = useGame();
  if (!draft || gameState.status !== 'PLAYING') return null;
  const turn = draftTurn(draft);
  const mine = (turn === 'player' && hostPlays) || (turn === 'player2' && isTwoPlayerMode && !isClientConnected);
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/95 overflow-y-auto p-3 sm:p-6 flex items-center">
      <CategoryDraft
        draft={draft}
        board={draft.round === 'ROUND_1' ? round1Board : round2Board}
        contestants={contestants}
        mine={mine}
        onStrike={(id) => strikeDraftColumn(id, turn)}
      />
    </div>
  );
}
