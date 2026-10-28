import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Mic, MicOff} from 'lucide-react';

// The Web Speech API is prefixed in Safari and some Chromium builds.
const SpeechRecognitionImpl: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;

export const isVoiceSupported = Boolean(SpeechRecognitionImpl);

interface VoiceAnswerButtonProps {
  /** Called with the recognizer's guesses, best first. Return a message to show, or nothing. */
  onHeard: (alternatives: string[]) => string | void;
  label?: string;
  className?: string;
  /** Start listening as soon as the button appears (mic-only mode). */
  autoStart?: boolean;
  size?: 'normal' | 'large';
}

/**
 * Tap-to-talk button for answering out loud. Listens for one phrase (up to about
 * 6 seconds), then hands every guess the browser heard to `onHeard`.
 */
export default function VoiceAnswerButton({
  onHeard,
  label = 'SAY IT',
  className = '',
  autoStart = false,
  size = 'normal',
}: VoiceAnswerButtonProps) {
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  // An automatic start can be refused by browsers that want a tap first, so it gets a gentler message.
  const autoStartedRef = useRef(false);
  const onHeardRef = useRef(onHeard);
  onHeardRef.current = onHeard;

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const start = useCallback(() => {
    if (!SpeechRecognitionImpl) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognitionImpl();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.continuous = false;

    let gotResult = false;
    rec.onresult = (event: any) => {
      gotResult = true;
      const result = event.results[0];
      const alternatives: string[] = [];
      for (let i = 0; i < result.length; i++) alternatives.push(result[i].transcript);
      const reply = onHeardRef.current(alternatives);
      setMessage(reply || null);
    };
    rec.onerror = (event: any) => {
      if (autoStartedRef.current && event.error === 'not-allowed') {
        setMessage('Tap the mic to answer.');
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMessage('Microphone is blocked. Allow mic access for this site, then try again.');
      } else if (event.error === 'no-speech') {
        setMessage("Didn't catch that. Tap and try again.");
      } else if (event.error !== 'aborted') {
        setMessage('Voice input hit a snag. Tap your answer instead.');
      }
    };
    rec.onend = () => {
      // Ignore a session that was already replaced (or aborted on unmount).
      if (recognitionRef.current !== rec) return;
      autoStartedRef.current = false;
      setListening(false);
      recognitionRef.current = null;
      if (!gotResult) setMessage((m) => m ?? "Didn't catch that. Tap and try again.");
    };

    recognitionRef.current = rec;
    setMessage(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      if (autoStartedRef.current) setMessage('Tap the mic to answer.');
      autoStartedRef.current = false;
    }
    // Safety stop in case the browser never ends the session on its own.
    setTimeout(() => {
      if (recognitionRef.current === rec) rec.stop();
    }, 6000);
  }, [listening]);

  useEffect(() => {
    if (!autoStart) return;
    autoStartedRef.current = true;
    start();
    // Only on mount: each new question remounts the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SpeechRecognitionImpl) return null;

  return (
    <div className="w-full flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={start}
        aria-label={listening ? 'Stop listening' : 'Answer by voice'}
        className={`${size === 'large' ? 'min-h-[96px] text-lg' : 'min-h-[48px] text-sm'} w-full px-4 py-2 rounded-xl border-2 font-black tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 ${
          listening
            ? 'bg-rose-600 border-rose-300 text-white animate-pulse'
            : 'bg-slate-900 border-emerald-400 text-emerald-300 hover:bg-slate-800'
        } ${className}`}>
        {listening ? <MicOff className={size === 'large' ? 'w-8 h-8' : 'w-5 h-5'} /> : <Mic className={size === 'large' ? 'w-8 h-8' : 'w-5 h-5'} />}
        <span>{listening ? 'LISTENING... TAP TO STOP' : `🎙️ ${label}`}</span>
      </button>
      {message && (
        <div className={`${size === 'large' ? 'text-sm' : 'text-[11px]'} text-amber-300 font-bold text-center`}>{message}</div>
      )}
    </div>
  );
}
