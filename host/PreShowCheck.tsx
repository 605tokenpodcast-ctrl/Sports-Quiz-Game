// Pre-show check: one screen to run down before recording. Are the questions current, is every
// phone in its seat with a good connection, is the stream screen watching, can the voice and
// the buzzer sounds be heard? Each line shows green, amber (worth a look) or red (fix it first).
import {useEffect, useState} from 'react';
import {ClipboardCheck, X} from 'lucide-react';
import {gameAudio} from '../utils/helper';
import {isSpeechSupported, speak, currentVoiceName, unlockSpeech} from '../utils/speech';
import {useGame} from '../game/GameContext';
import {seatLabel, type RemoteSeat} from '../game/types';

type Level = 'good' | 'warn' | 'bad';
const DOT: Record<Level, string> = {good: 'bg-emerald-400', warn: 'bg-amber-400', bad: 'bg-rose-500'};

/** Round trip in ms: under 150 is great for buzzer races, over 400 a phone will feel slow. */
export function pingLevel(rttMs: number | null): Level {
  if (rttMs === null) return 'warn';
  return rttMs <= 150 ? 'good' : rttMs <= 400 ? 'warn' : 'bad';
}

/** How fresh the questions are: the weekly refresh runs Tuesdays, so older than 9 days means it was missed. */
export function bankAgeLevel(generatedAt: string | undefined, now = Date.now()): Level {
  if (!generatedAt) return 'warn';
  const days = (now - Date.parse(generatedAt)) / 86400000;
  return !Number.isFinite(days) ? 'warn' : days <= 9 ? 'good' : 'warn';
}

function Row({level, title, detail, children}: {level: Level; title: string; detail: string; children?: React.ReactNode}) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-slate-800 last:border-0" data-check={title} data-level={level}>
      <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[level]}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="text-[11px] text-slate-400 leading-snug">{detail}</div>
        {children}
      </div>
    </div>
  );
}

export default function PreShowCheck({onClose}: {onClose: () => void}) {
  const {bankInfo, bankStatus, totalQuestionCount, p2pRef, remoteSeats, contestants, screenCount, hostPlays, readAloud, roomCode, awaySeats} = useGame();
  // Pings come in with the heartbeat every few seconds, so look again each second.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const seats: RemoteSeat[] = hostPlays ? ['player2', 'analyst'] : ['player', 'player2', 'analyst'];
  const peerOf = (seat: RemoteSeat) => Object.entries(remoteSeats).find(([, s]) => s === seat)?.[0];
  const phones = seats.map((seat) => {
    const peer = peerOf(seat);
    const oneWay = peer ? p2pRef.current?.oneWayDelayMs(peer) ?? 0 : 0;
    return {seat, peer, rtt: peer && oneWay > 0 ? Math.round(oneWay * 2) : null, away: Boolean(awaySeats?.[seat])};
  });
  const seated = phones.filter((p) => p.peer);
  const needed = hostPlays ? 1 : 2;
  const generatedAt = bankInfo?.generatedAt;
  const ageLevel = bankStatus !== 'ready' ? 'bad' : bankAgeLevel(generatedAt);
  const worst = (levels: Level[]): Level => (levels.includes('bad') ? 'bad' : levels.includes('warn') ? 'warn' : 'good');
  const phoneLevel = seated.length < needed ? 'bad' : worst(seated.map((p) => pingLevel(p.rtt)));
  const voice = isSpeechSupported ? currentVoiceName() : null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/95 overflow-y-auto" role="dialog" aria-label="Pre-show check">
      <div className="max-w-md mx-auto p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="flex items-center gap-2 text-lg font-black text-amber-400 uppercase tracking-wider">
            <ClipboardCheck className="w-5 h-5" /> Pre-show check
          </h2>
          <button onClick={onClose} aria-label="Close" className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3">
          <Row
            level={ageLevel}
            title="Questions"
            detail={
              bankStatus !== 'ready'
                ? bankStatus === 'loading' ? 'Still loading the question bank.' : "The question bank didn't load. Check the internet connection."
                : `${totalQuestionCount.toLocaleString()} questions, data through ${bankInfo?.dataThrough ?? 'unknown'}.${
                    ageLevel === 'warn' ? " This week's refresh may have been missed: run Refresh NFL questions on GitHub." : ''
                  }`
            }
          />
          <Row
            level={phoneLevel}
            title={`Phones (${seated.length} of ${seats.length})`}
            detail={
              seated.length < needed
                ? `At least ${needed} phone${needed > 1 ? 's' : ''} must join room ${roomCode || '...'} before the game can start.`
                : phoneLevel === 'good'
                ? 'Every phone has a quick connection.'
                : 'A slow connection makes that phone lose buzzer races. Move closer to Wi-Fi or switch networks.'
            }>
            <ul className="mt-1 space-y-0.5">
              {phones.map((p) => (
                <li key={p.seat} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-2 h-2 rounded-full ${p.peer ? DOT[pingLevel(p.rtt)] : 'bg-slate-600'}`} />
                  <span className="font-bold text-slate-200 w-7">{seatLabel(p.seat)}</span>
                  <span className="flex-1 truncate text-slate-300">{p.peer ? contestants[p.seat].name : p.away ? 'Away (can rejoin)' : 'Empty'}</span>
                  <span className="font-mono text-slate-400">{p.peer ? (p.rtt === null ? 'measuring' : `${p.rtt} ms`) : ''}</span>
                </li>
              ))}
            </ul>
          </Row>
          <Row
            level={screenCount > 0 ? 'good' : 'warn'}
            title="Stream screen"
            detail={screenCount > 0 ? `${screenCount} connected. It shows the board and reads clues aloud.` : 'Not connected. Fine if you aren\'t streaming; otherwise open the Stream Screen link from Invite Phones.'}
          />
          <Row
            level={!readAloud ? 'good' : voice ? 'good' : 'bad'}
            title="Read-aloud voice"
            detail={!readAloud ? 'Read Clues Aloud is off.' : voice ? `Voice: ${voice}${screenCount > 0 ? ' (the stream screen uses its own)' : ''}.` : 'This browser has no voice to read with.'}>
            {isSpeechSupported && (
              <button
                onClick={() => {
                  unlockSpeech();
                  speak("Welcome to the Sports Arena. This is how the clues will sound.");
                }}
                className="mt-1 min-h-[36px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white">
                Test the voice
              </button>
            )}
          </Row>
          <Row level="good" title="Sound" detail="Each seat has its own buzzer sound. Play them to check the volume on the stream.">
            <button
              onClick={() => {
                gameAudio.resume();
                (['player', 'player2', 'analyst'] as const).forEach((seat, i) => setTimeout(() => gameAudio.playBuzzIn(seat), i * 700));
              }}
              className="mt-1 min-h-[36px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white">
              Play the buzzers
            </button>
          </Row>
        </div>
        <button onClick={onClose} className="w-full mt-3 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase">
          Done
        </button>
      </div>
    </div>
  );
}
