// Show notes: after a game, every clue that was played (who got it, who missed it), the final
// scores, the Stumper of the game (the priciest clue nobody got) and the Stumper of the week
// (the priciest one this device has seen go unanswered in the last 7 days), as Markdown to
// paste into podcast notes or a post.

export interface LoggedClue {
  id: string;
  round: 'ROUND_1' | 'ROUND_2' | 'FINAL';
  category: string;
  value: number;
  clue: string;
  answer: string;
  right: string[];
  wrong: string[];
}

export interface Stumper extends LoggedClue {
  day: string;
}

const STUMPERS_KEY = 'sports_arena_stumpers_v1';
const WEEK_MS = 7 * 86400000;

/** The priciest clue nobody got right. One somebody tried beats one nobody buzzed on, at the same value. */
export function stumperOf(log: LoggedClue[]): LoggedClue | null {
  const missed = log.filter((c) => c.round !== 'FINAL' && c.right.length === 0);
  missed.sort((a, b) => b.value - a.value || b.wrong.length - a.wrong.length);
  return missed[0] ?? null;
}

function loadStumpers(): Stumper[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STUMPERS_KEY) ?? '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/** Remembers this game's stumper for the week's pick. */
export function rememberStumper(s: LoggedClue | null, now = Date.now()): void {
  if (!s) return;
  try {
    const kept = loadStumpers().filter((x) => now - Date.parse(x.day) < WEEK_MS && x.id !== s.id);
    kept.push({...s, day: new Date(now).toISOString()});
    localStorage.setItem(STUMPERS_KEY, JSON.stringify(kept.slice(-50)));
  } catch {}
}

/** The priciest clue nobody got, from the games on this device in the last 7 days. */
export function stumperOfTheWeek(now = Date.now()): Stumper | null {
  const week = loadStumpers().filter((x) => now - Date.parse(x.day) < WEEK_MS);
  week.sort((a, b) => b.value - a.value || b.wrong.length - a.wrong.length);
  return week[0] ?? null;
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString()}`;
const who = (c: LoggedClue) =>
  [c.right.length ? `✓ ${c.right.join(', ')}` : '', c.wrong.length ? `✗ ${c.wrong.join(', ')}` : '', !c.right.length && !c.wrong.length ? 'nobody buzzed' : '']
    .filter(Boolean)
    .join(' · ');

export function showNotesMarkdown(o: {
  date: Date;
  mode: string;
  standings: {name: string; score: number}[];
  log: LoggedClue[];
  weekStumper: Stumper | null;
  episodeCode?: string;
}): string {
  const date = o.date.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});
  const lines: string[] = [`# Sports Arena Showdown: ${date}`, '', `_${o.mode}${o.episodeCode ? ` · Episode code ${o.episodeCode}` : ''}_`, '', '## Final scores', ''];
  o.standings.forEach((s, i) => lines.push(`${i + 1}. **${s.name}** ${money(s.score)}`));
  const stumper = stumperOf(o.log);
  if (stumper) lines.push('', '## Stumper of the game', '', `> ${stumper.clue}`, '', `**${stumper.answer}** (${stumper.category}, ${money(stumper.value)}, ${who(stumper)})`);
  if (o.weekStumper && o.weekStumper.id !== stumper?.id)
    lines.push('', '## Stumper of the week', '', `> ${o.weekStumper.clue}`, '', `**${o.weekStumper.answer}** (${o.weekStumper.category}, ${money(o.weekStumper.value)})`);
  for (const [round, title] of [['ROUND_1', 'Round 1'], ['ROUND_2', 'Round 2'], ['FINAL', 'Final Showdown']] as const) {
    const clues = o.log.filter((c) => c.round === round);
    if (!clues.length) continue;
    lines.push('', `## ${title}`, '');
    for (const c of clues) {
      lines.push(round === 'FINAL' ? `- **${c.category}**: ${c.clue} **${c.answer}**` : `- **${c.category} ${money(c.value)}**: ${c.clue} **${c.answer}** (${who(c)})`);
    }
  }
  lines.push('', 'Questions from nflverse data (CC BY 4.0).');
  return lines.join('\n');
}
