import gameConfig from './game-config.json';

// Tunable game settings, read from game-config.json.
export interface GameSettings {
  questionTimeLimit: number; // seconds to answer a Daily Double / after the buzz window
  buzzerLightDelay: number; // seconds the question is read before buzzers open
  aiReflexSpeedMultiplier: number; // above 1 makes the AI opponents buzz faster
  fuzzyMatchThreshold: number; // 0 to 1, how close a typed answer must be to count
}

export const SETTINGS: GameSettings = gameConfig;
