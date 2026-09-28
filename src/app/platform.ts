/**
 * Interruptions → PAUSE (design-handoff §4.C): tab hidden, app backgrounded, window
 * blur mid-pour, Android Back. The rAF loop is stopped while hidden to save battery.
 */

import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ads, controller, now } from './services';

const IN_RUN = new Set(['LEVEL_INTRO', 'READY', 'FILLING', 'SETTLING', 'RESULT']);

export function pauseIfInRun() {
  if (ads.fullscreenActive) return; // a full-screen ad backgrounds the WebView; it isn't a user interruption
  if (IN_RUN.has(controller.state.tag)) controller.dispatch({ type: 'PAUSE', now: now() });
}

export interface BackHandler {
  /** Return true if a UI layer (dialog) consumed the Back press. */
  (): boolean;
}

export function installPlatformHandlers(onBack: BackHandler): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      pauseIfInRun();
      controller.stop();
    } else {
      controller.start();
    }
  };
  const onBlur = () => {
    if (controller.state.tag === 'FILLING') pauseIfInRun();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pagehide', pauseIfInRun);

  const nativeOffs: Promise<{ remove: () => Promise<void> }>[] = [];
  if (Capacitor.isNativePlatform()) {
    nativeOffs.push(
      CapApp.addListener('pause', () => pauseIfInRun()),
      CapApp.addListener('backButton', () => {
        if (onBack()) return;
        const tag = controller.state.tag;
        if (IN_RUN.has(tag)) pauseIfInRun();
        else if (tag === 'PAUSED') controller.dispatch({ type: 'RESUME', now: now() });
        else if (tag === 'MENU') void CapApp.exitApp();
        else controller.dispatch({ type: 'QUIT', now: now() });
      }),
    );
  }

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('pagehide', pauseIfInRun);
    nativeOffs.forEach((p) => void p.then((h) => h.remove()));
  };
}
