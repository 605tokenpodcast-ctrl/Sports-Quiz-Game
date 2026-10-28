// Shows a countdown's remaining time. Only this little component redraws as the clock runs,
// not the whole game screen.
import {useEffect, useState} from 'react';
import {msLeft} from '../game/rules';
import type {Countdown} from '../game/types';

export default function TimeLeft({c, format = 'tenths'}: {c: Countdown; format?: 'tenths' | 'seconds' | 'clock'}) {
  const running = c.endsAt !== null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), format === 'tenths' ? 100 : 250);
    return () => clearInterval(id);
  }, [running, format]);

  const seconds = msLeft(c, Date.now()) / 1000;
  if (format === 'tenths') return <>{seconds.toFixed(1)}</>;
  const whole = Math.ceil(seconds);
  return <>{format === 'clock' ? `0:${String(whole).padStart(2, '0')}` : whole}</>;
}
