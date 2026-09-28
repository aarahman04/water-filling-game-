import { useEffect, useLayoutEffect, useReducer, useRef, useSyncExternalStore, type RefObject } from 'react';
import type { GameState } from '../game';
import type { RewardedStatus } from '../ads';
import type { SaveData } from '../persistence/progress';
import { ads, controller, progress } from './services';

export function useGameState(): GameState {
  return useSyncExternalStore(controller.subscribe, controller.getState);
}

export function useSave(): SaveData {
  return useSyncExternalStore(progress.subscribe, progress.get);
}

export function useRewardedStatus(): RewardedStatus {
  return useSyncExternalStore(ads.subscribe, ads.rewardedStatus);
}

export function usePrivacyOptionsRequired(): boolean {
  return useSyncExternalStore(ads.subscribe, ads.privacyOptionsRequired);
}

/** Re-render once performance.now() passes `at` (e.g. a CTA enable time). */
export function useRerenderAt(...times: (number | null | undefined)[]): void {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const key = times.join('|');
  useEffect(() => {
    const now = performance.now();
    const timers = times
      .filter((t): t is number => typeof t === 'number' && t > now)
      .map((t) => window.setTimeout(force, t - now + 1));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

function systemReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function subscribeMotion(fn: () => void) {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}

export function useReducedMotion(): boolean {
  const save = useSave();
  const system = useSyncExternalStore(subscribeMotion, systemReducedMotion);
  return save.reducedMotion === 'on' || system;
}

export function isReducedMotion(): boolean {
  return progress.get().reducedMotion === 'on' || systemReducedMotion();
}

/** Ref that always holds the latest value, for callbacks registered once. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
