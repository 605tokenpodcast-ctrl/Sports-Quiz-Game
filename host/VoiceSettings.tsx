// Voice and speed for reading clues aloud, with a button to hear it.
import {useEffect, useState} from 'react';
import {Play} from 'lucide-react';
import {AI_VOICES, aiState, AiState, loadAiVoice, onAiState} from '../utils/aiVoice';
import {
  currentVoiceName,
  getChosenVoice,
  onVoicesChanged,
  rankedVoices,
  sampleLine,
  setChosenVoice,
  speak,
  unlockSpeech,
  VOICE_SPEEDS,
  VoiceEngine,
  VoiceSpeed,
} from '../utils/speech';

/** "Microsoft Andrew Online (Natural) - English (United States)" -> "Andrew (Natural)". */
const shortName = (name: string) =>
  name
    .replace(/^(Microsoft|Google|Apple)\s+/i, '')
    .replace(/\s*-\s*English.*$/i, '')
    .replace(/\bOnline\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

export default function VoiceSettings({
  voiceSpeed,
  setVoiceSpeed,
  voiceEngine,
  setVoiceEngine,
  aiVoice,
  setAiVoice,
  speaksElsewhere,
}: {
  voiceSpeed: VoiceSpeed;
  setVoiceSpeed: (s: VoiceSpeed) => void;
  voiceEngine: VoiceEngine;
  setVoiceEngine: (e: VoiceEngine) => void;
  aiVoice: string;
  setAiVoice: (v: string) => void;
  /** The stream screen reads the clues, so the voice picked here isn't the one heard. */
  speaksElsewhere: boolean;
}) {
  const [voices, setVoices] = useState(() => rankedVoices());
  const [chosen, setChosen] = useState(() => getChosenVoice());
  useEffect(() => onVoicesChanged(() => setVoices(rankedVoices())), []);
  const [ai, setAi] = useState<AiState>(() => aiState());
  useEffect(() => onAiState(setAi), []);
  const useAi = voiceEngine === 'ai';
  // Download on the device that reads; the stream screen downloads its own copy.
  useEffect(() => {
    if (useAi && !speaksElsewhere) loadAiVoice();
  }, [useAi, speaksElsewhere]);

  const test = () => {
    unlockSpeech();
    speak(sampleLine());
  };
  const aiStatus = speaksElsewhere
    ? 'The stream screen downloads the AI voice (about 90 MB, once) and reads with it.'
    : ai.status === 'ready'
      ? 'AI voice ready.'
      : ai.status === 'error'
        ? 'The AI voice could not load here, so the device voice reads instead.'
        : `Downloading the AI voice${ai.progress ? ` (${ai.progress}%)` : ''}, about 90 MB, only once. The device voice reads until it's ready.`;
  const autoName = voices[0] ? shortName(voices[0].name) : '';

  return (
    <div className="w-full flex flex-col gap-2 text-left">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase text-slate-400 w-12 shrink-0">Speed</span>
        <div className="flex-1 grid grid-cols-3 gap-1">
          {VOICE_SPEEDS.map((s) => (
            <button
              key={s.id}
              onClick={() => setVoiceSpeed(s.id)}
              className={`min-h-[36px] rounded-lg border text-xs font-bold transition-colors ${
                voiceSpeed === s.id ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-blue-500'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase text-slate-400 w-12 shrink-0">Reader</span>
        <div className="flex-1 grid grid-cols-2 gap-1">
          {(
            [
              ['ai', 'AI voice'],
              ['device', 'Device voice'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setVoiceEngine(id)}
              className={`min-h-[36px] rounded-lg border text-xs font-bold transition-colors ${
                voiceEngine === id ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-blue-500'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {useAi && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase text-slate-400 w-12 shrink-0">Voice</span>
          <select
            value={aiVoice}
            onChange={(e) => setAiVoice(e.target.value)}
            className="flex-1 min-w-0 min-h-[36px] rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 px-2">
            {AI_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            onClick={test}
            title="Hear this voice"
            className="min-w-[36px] min-h-[36px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center">
            <Play className="w-4 h-4" />
          </button>
        </div>
      )}
      {!useAi && voices.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase text-slate-400 w-12 shrink-0">Voice</span>
          <select
            value={chosen ?? ''}
            onChange={(e) => {
              const name = e.target.value || null;
              setChosenVoice(name);
              setChosen(name);
            }}
            className="flex-1 min-w-0 min-h-[36px] rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 px-2">
            <option value="">Best available{autoName ? ` (${autoName})` : ''}</option>
            {voices.map((v) => (
              <option key={v.voiceURI || v.name} value={v.name}>
                {shortName(v.name)}
              </option>
            ))}
          </select>
          <button
            onClick={test}
            title="Hear this voice"
            className="min-w-[36px] min-h-[36px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center">
            <Play className="w-4 h-4" />
          </button>
        </div>
      )}
      <span className="text-[9px] text-slate-400">
        {useAi
          ? aiStatus
          : speaksElsewhere
          ? 'The stream screen reads with its own best voice at this speed.'
          : `Reading with ${shortName(currentVoiceName() ?? '') || 'this device’s voice'}. Sounds robotic? Edge and iPhone/Mac Enhanced voices sound most natural.`}
      </span>
    </div>
  );
}
