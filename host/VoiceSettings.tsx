// Voice and speed for reading clues aloud, with a button to hear it.
import {useEffect, useState} from 'react';
import {Play} from 'lucide-react';
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
  speaksElsewhere,
}: {
  voiceSpeed: VoiceSpeed;
  setVoiceSpeed: (s: VoiceSpeed) => void;
  /** The stream screen reads the clues, so the voice picked here isn't the one heard. */
  speaksElsewhere: boolean;
}) {
  const [voices, setVoices] = useState(() => rankedVoices());
  const [chosen, setChosen] = useState(() => getChosenVoice());
  useEffect(() => onVoicesChanged(() => setVoices(rankedVoices())), []);

  const test = () => {
    unlockSpeech();
    speak(sampleLine());
  };
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
      {voices.length > 0 && (
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
        {speaksElsewhere
          ? 'The stream screen reads with its own best voice at this speed.'
          : `Reading with ${shortName(currentVoiceName() ?? '') || 'this device’s voice'}. Sounds robotic? Edge and iPhone/Mac Enhanced voices sound most natural.`}
      </span>
    </div>
  );
}
