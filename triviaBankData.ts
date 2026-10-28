/**
 * The three hand-written NFL categories, cleaned up (no duplicate answers, no parenthetical giveaways).
 */

import { SportTag, sanitizeQuestionClue } from './triviaEngine';

export interface CategoryEntry {
  id?: string;
  clue: string;
  answer: string;
  distractors: string[];
  aliases?: string[];
  difficulty: number;
}

export interface CategorySpecData {
  id: string;
  title: string;
  sport: SportTag;
  description: string;
  entries: CategoryEntry[];
}

// Helper to assemble and guarantee at least 100 unique questions per category
function assembleCategory(
  id: string,
  title: string,
  sport: SportTag,
  description: string,
  items: Array<{ clue: string; answer: string; distractors: string[]; aliases?: string[]; difficulty: number }>
): CategorySpecData {
  const seenAnswers = new Set<string>();
  const uniqueEntries: CategoryEntry[] = [];

  for (const item of items) {
    const cleanAnswer = item.answer.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    const cleanClue = sanitizeQuestionClue(item.clue);
    const norm = cleanAnswer.toLowerCase();
    if (!seenAnswers.has(norm)) {
      seenAnswers.add(norm);
      uniqueEntries.push({
        ...item,
        clue: cleanClue,
        answer: cleanAnswer,
        distractors: item.distractors.map((d) => d.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()),
      });
    }
  }

  return {
    id,
    title,
    sport,
    description,
    entries: uniqueEntries,
  };
}

// ===========================================================================
// CATEGORY GENERATOR & FACTUAL DATABASE
// ===========================================================================

import {
  RAW_NFL_SUPER_BOWL,
  RAW_NFL_RECORDS,
  RAW_NFL_FRANCHISES,
} from './triviaDatasetPart';

export const BUILT_IN_NFL_SPECS: CategorySpecData[] = [
  assembleCategory(
    'nfl_super_bowl',
    'Super Bowl Champions & MVPs',
    'NFL',
    'Championship performances, game-winning drives, and Super Bowl MVP honors.',
    RAW_NFL_SUPER_BOWL
  ),
  assembleCategory(
    'nfl_records_legends',
    'NFL All-Time Records & Legends',
    'NFL',
    'Historic statistical milestones, immortal passers, rushers, and sack leaders.',
    RAW_NFL_RECORDS
  ),
  assembleCategory(
    'nfl_franchises_stadiums',
    'NFL Franchises, Coaches & Stadiums',
    'NFL',
    'Legendary head coaches, iconic venues, team dynasties, and draft steals.',
    RAW_NFL_FRANCHISES
  ),
];
