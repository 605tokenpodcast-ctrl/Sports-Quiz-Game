import {useEffect} from 'react';

/**
 * Keeps this device's screen on while `active`. A phone that dims and locks mid-game drops
 * its connection, so every device in a room asks to stay awake. The browser lets go of the
 * lock whenever the page is hidden, so it is asked for again each time the page comes back.
 * Browsers without the Screen Wake Lock API simply skip this.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release().catch(() => {});
      } catch {
        // Refused (low battery, no user gesture yet): try again on the next tap or visit.
      }
    };
    request();
    document.addEventListener('visibilitychange', request);
    // Some browsers only grant the lock after the person has touched the page.
    document.addEventListener('pointerdown', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      document.removeEventListener('pointerdown', request);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
