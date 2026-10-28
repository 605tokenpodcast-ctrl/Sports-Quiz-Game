// Lets every screen read the game without passing it down by hand.
import {createContext, useContext} from 'react';
import type {Game} from './useGameController';

export const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) throw new Error('useGame needs a GameContext.Provider');
  return game;
}
