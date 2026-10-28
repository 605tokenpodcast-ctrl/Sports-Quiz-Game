// The end-of-game recap card: a 1080 x 1350 image (the size social apps show in full) with the
// final standings and best moments, drawn on a canvas and shared or saved as a PNG.
import type {Contestant} from '../game/types';
import {recapMoney, type RecapAward} from '../game/recap';

export interface RecapCardData {
  standings: Contestant[]; // highest score first
  moments: string[];
  awards?: RecapAward[];
  mode: string; // e.g. "Full Game · 4-Choice · Medium"
  date: Date;
  url: string;
}

const W = 1080;
const H = 1350;
const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

/** Splits text into lines that fit `width`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrinks the font until `text` fits on one line. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, width: number) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${FONT}`;
    s -= 2;
  } while (ctx.measureText(text).width > width && s > 20);
}

export function drawRecapCard(data: RecapCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Backdrop and frame
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1a3a');
  bg.addColorStop(1, '#020617');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 12;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fbbf24';
  ctx.font = `900 64px ${FONT}`;
  ctx.fillText('SPORTS ARENA SHOWDOWN', W / 2, 130);
  ctx.fillStyle = '#bfdbfe';
  ctx.font = `600 34px ${FONT}`;
  const day = data.date.toLocaleDateString(undefined, {month: 'long', day: 'numeric', year: 'numeric'});
  ctx.fillText(`NFL Trivia · ${day}`, W / 2, 185);
  ctx.fillStyle = '#94a3b8';
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(data.mode, W / 2, 228);

  // Winner
  const top = data.standings[0]?.score ?? 0;
  const winners = data.standings.filter((c) => c.score === top);
  const headline = winners.length > 1 ? `${winners.map((c) => c.name).join(' & ')} tie!` : `${winners[0]?.name ?? 'Nobody'} wins!`;
  ctx.fillStyle = '#ffffff';
  fit(ctx, `🏆 ${headline}`, 900, 76, W - 140);
  ctx.fillText(`🏆 ${headline}`, W / 2, 345);

  // Standings, a little tighter when there are awards to fit
  const awards = data.awards ?? [];
  const rowH = awards.length ? 90 : 110;
  const medals = ['#fbbf24', '#cbd5e1', '#d97706'];
  let y = 420;
  data.standings.forEach((c, i) => {
    ctx.fillStyle = i === 0 ? 'rgba(245, 158, 11, 0.18)' : 'rgba(30, 58, 138, 0.35)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(90, y, W - 180, rowH, 22);
      ctx.fill();
    } else {
      ctx.fillRect(90, y, W - 180, rowH);
    }
    const mid = y + rowH / 2 + 18;
    ctx.textAlign = 'left';
    ctx.fillStyle = medals[i] ?? '#94a3b8';
    ctx.font = `900 54px ${FONT}`;
    ctx.fillText(`#${i + 1}`, 130, mid);
    ctx.fillStyle = '#f8fafc';
    fit(ctx, c.name, 800, 46, 520);
    ctx.fillText(c.name, 240, mid - 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = c.score >= 0 ? '#34d399' : '#fb7185';
    ctx.font = `900 50px ${FONT}`;
    ctx.fillText(recapMoney(c.score), W - 130, mid);
    y += rowH + 20;
  });

  // Awards, two to a row
  ctx.textAlign = 'center';
  if (awards.length) {
    y += 50;
    ctx.fillStyle = '#fbbf24';
    ctx.font = `900 38px ${FONT}`;
    ctx.fillText('AWARDS', W / 2, y);
    y += 25;
    const boxW = (W - 180 - 20) / 2;
    const boxH = 95;
    awards.forEach((a, i) => {
      const x = 90 + (i % 2) * (boxW + 20);
      const top = y + Math.floor(i / 2) * (boxH + 15);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
      ctx.fillRect(x, top, boxW, boxH);
      ctx.fillStyle = '#fcd34d';
      fit(ctx, `${a.emoji} ${a.title.toUpperCase()}: ${a.winner}`, 800, 30, boxW - 30);
      ctx.fillText(`${a.emoji} ${a.title.toUpperCase()}: ${a.winner}`, x + boxW / 2, top + 42);
      ctx.fillStyle = '#cbd5e1';
      fit(ctx, a.detail, 500, 26, boxW - 30);
      ctx.fillText(a.detail, x + boxW / 2, top + 78);
    });
    y += Math.ceil(awards.length / 2) * (boxH + 15) - 15;
  }

  // Best moments
  y += 50;
  if (data.moments.length && y < H - 200) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = `900 38px ${FONT}`;
    ctx.fillText('BEST MOMENTS', W / 2, y);
    y += 60;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `600 34px ${FONT}`;
    for (const moment of data.moments) {
      for (const line of wrap(ctx, moment, W - 220)) {
        if (y > H - 150) break;
        ctx.fillText(line, W / 2, y);
        y += 46;
      }
      y += 18;
    }
  }

  ctx.fillStyle = '#64748b';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(data.url.replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, H - 70);
  return canvas;
}

/** Opens the share sheet with the card where the browser can share files, otherwise downloads it. */
export async function shareRecapCard(canvas: HTMLCanvasElement): Promise<'shared' | 'saved' | 'cancelled'> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not draw the recap card');
  const file = new File([blob], `nfl-quiz-recap-${new Date().toISOString().slice(0, 10)}.png`, {type: 'image/png'});
  if (navigator.canShare?.({files: [file]})) {
    try {
      await navigator.share({files: [file], title: 'Sports Arena Showdown recap'});
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // Some browsers refuse files after all; fall back to saving it.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'saved';
}
