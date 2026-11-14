// Emoji reactions rising over a player's podium (or name, on the scoreboard strip).
import type {Reaction} from '../utils/reactions';
import {REACTION_SHOW_MS} from '../utils/reactions';

const KEYFRAMES = `@keyframes reaction-rise{0%{transform:translate(-50%,0) scale(.6);opacity:0}12%{transform:translate(-50%,-10%) scale(1.15);opacity:1}100%{transform:translate(-50%,-260%) scale(1);opacity:0}}`;

export default function ReactionFloat({reactions, seat, size = 'clamp(2rem,6vh,3.5rem)'}: {reactions: Reaction[]; seat: string; size?: string}) {
  const mine = reactions.filter((r) => r.seat === seat);
  if (!mine.length) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full h-0" aria-hidden="true">
      <style>{KEYFRAMES}</style>
      {mine.map((r) => (
        <span
          key={r.id}
          data-reaction={r.emoji}
          className="absolute bottom-0"
          // Spread side by side a little, so a few in a row don't stack exactly.
          style={{left: `${30 + ((r.id * 37) % 40)}%`, fontSize: size, animation: `reaction-rise ${REACTION_SHOW_MS}ms ease-out forwards`}}>
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
