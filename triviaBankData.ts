/**
 * Built-in categories (none now: every column comes from public/questions/nfl.json).
 */

import { SportTag } from './triviaEngine';

export interface CategoryEntry {
  id?: string;
  clue: string;
  answer: string;
  distractors: string[];
  aliases?: string[];
  difficulty: number;
  hints?: string[];
}

export interface CategorySpecData {
  id: string;
  title: string;
  sport: SportTag;
  description: string;
  entries: CategoryEntry[];
}

// The three old hand-written columns were rewritten into scripts/data/legends.json
// (Legends & Lore, Greatest Hits), which the builder folds into public/questions/nfl.json.
export const BUILT_IN_NFL_SPECS: CategorySpecData[] = [];
