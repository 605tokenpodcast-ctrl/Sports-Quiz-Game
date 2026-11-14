// Phone reactions: players (and the host) tap an emoji, and it floats up on the stream screen
// next to their name. Only these emoji are passed along, and each seat can send one every
// REACTION_GAP_MS, so the screen never floods.
export const REACTION_EMOJI = ['👏', '🔥', '😂', '😱', '🏈'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];
export const REACTION_GAP_MS = 1200;
/** How long a reaction stays on screen. */
export const REACTION_SHOW_MS = 2600;

export interface Reaction {
  id: number;
  emoji: ReactionEmoji;
  /** The seat that sent it: player (P1), player2 (P2) or analyst (P3). */
  seat: string;
  at: number;
}

export const isReactionEmoji = (e: unknown): e is ReactionEmoji => typeof e === 'string' && (REACTION_EMOJI as readonly string[]).includes(e);

/** Lets a seat react at most once every REACTION_GAP_MS. Returns true when this one may go out. */
export function reactionGate(gap = REACTION_GAP_MS) {
  const last = new Map<string, number>();
  return (seat: string, now = Date.now()) => {
    if (now - (last.get(seat) ?? -Infinity) < gap) return false;
    last.set(seat, now);
    return true;
  };
}
