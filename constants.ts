import gameConfig from './game-config.json';
import {SpriteConfig} from './utils/helper';

/**
 * Visual Theme for Sports Arena Quiz broadcast
 */
export const THEME = {
  primary: '#f59e0b', // Gold
  secondary: '#3b82f6', // Bright Arena Blue
  accent: '#10b981', // Emerald Victory
  danger: '#ef4444', // Red Buzzer
  bgDark: '#060d1f',
  cardBg: '#0f172a',
  cardBorder: '#1e3a8a',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
};

/**
 * Configuration for the game.
 */
export const CONFIG = {
  title: {
    value: 'Sports Arena Quiz',
    type: 'string',
    label: 'Game Title',
    group: 'GAME',
  },
  baseCanvasWidth: {
    value: 1376,
    type: 'number',
    label: 'Base Canvas Width',
    group: 'GAME',
  },
  baseCanvasHeight: {
    value: 768,
    type: 'number',
    label: 'Base Canvas Height',
    group: 'GAME',
  },
  targetFPS: {
    value: 60,
    type: 'number',
    label: 'Target FPS',
    group: 'SYSTEM',
  },
  stepMs: {
    value: 1000 / 60,
    type: 'number',
    label: 'Step MS',
    group: 'SYSTEM',
  },
  maxSubSteps: {
    value: 5,
    type: 'number',
    label: 'Max Sub Steps',
    group: 'SYSTEM',
  },
  backgroundColor: {
    value: '#060d1f',
    type: 'color',
    label: 'Background Color',
    group: 'THEME',
  },
  primaryColor: {
    value: '#f59e0b',
    type: 'color',
    label: 'Primary Color',
    group: 'THEME',
  },
  fontFamily: {
    value: 'Inter, system-ui, sans-serif',
    type: 'string',
    label: 'Font Family',
    group: 'THEME',
  },
  defaultMusicVolume: {
    value: 0.6,
    type: 'number',
    label: 'Default Music Volume',
    group: 'AUDIO',
  },
  defaultSfxVolume: {
    value: 0.7,
    type: 'number',
    label: 'Default SFX Volume',
    group: 'AUDIO',
  },

  // Gameplay Tuning Rules
  questionTimeLimit: {
    value: 12,
    type: 'number',
    label: 'Question Timer (Seconds)',
    group: 'Rules',
  },
  buzzerLightDelay: {
    value: 3.6,
    type: 'number',
    label: 'Buzzer Read Delay (Seconds)',
    group: 'Rules',
  },
  aiReflexSpeedMultiplier: {
    value: 1.0,
    type: 'number',
    label: 'AI Reflex Speed Multiplier',
    group: 'Rules',
  },
  enableBonusWagers: {
    value: true,
    type: 'boolean',
    label: 'Enable Bonus Daily Double Wagers',
    group: 'Rules',
  },
  fuzzyMatchThreshold: {
    value: 0.75,
    type: 'number',
    label: 'Expert Typing Fuzzy Match Threshold',
    group: 'Rules',
  },

  // Asset dimensions and aspect ratios from read_assets_metadata
  assetBgStudioArenaAspectRatio: {
    value: 1376 / 768, // 1.7916
    type: 'number',
    label: 'Studio Arena Aspect Ratio',
    group: 'ASSETS',
  },
  assetBgStudioArenaWidth: {
    value: 1376,
    type: 'number',
    label: 'Studio Arena Width',
    group: 'ASSETS',
  },
  assetBgStudioArenaHeight: {
    value: 768,
    type: 'number',
    label: 'Studio Arena Height',
    group: 'ASSETS',
  },

  assetAvatarPlayerAspectRatio: {
    value: 443 / 899, // 0.4927
    type: 'number',
    label: 'Player Avatar Aspect Ratio',
    group: 'ASSETS',
  },
  assetAvatarCoachAspectRatio: {
    value: 534 / 698, // 0.7650
    type: 'number',
    label: 'Coach Avatar Aspect Ratio',
    group: 'ASSETS',
  },
  assetAvatarAnalystAspectRatio: {
    value: 521 / 720, // 0.7236
    type: 'number',
    label: 'Analyst Avatar Aspect Ratio',
    group: 'ASSETS',
  },
  assetPodiumAspectRatio: {
    value: 369 / 632, // 0.5838
    type: 'number',
    label: 'Podium Desk Aspect Ratio',
    group: 'ASSETS',
  },
  assetBuzzerAspectRatio: {
    value: 731 / 342, // 2.1374
    type: 'number',
    label: 'Buzzer Aspect Ratio',
    group: 'ASSETS',
  },
  assetTrophyAspectRatio: {
    value: 518 / 668, // 0.7754
    type: 'number',
    label: 'Trophy Aspect Ratio',
    group: 'ASSETS',
  },
};

// Merge the tuned values from game-config.json (originally set in Google Playground)
if (gameConfig.values) {
  for (const [key, value] of Object.entries(gameConfig.values)) {
    if (key in CONFIG) {
      Object.assign(CONFIG[key as keyof typeof CONFIG], {value});
    }
  }
}

/**
 * Type helper for reading values in game code
 */
export type ConfigKey = keyof typeof CONFIG;

/**
 * Gets a configuration value by key.
 * @param key The configuration key.
 * @return The configuration value.
 */
export function getConfig<K extends ConfigKey>(
  key: K,
): (typeof CONFIG)[K]['value'] {
  return CONFIG[key].value;
}
