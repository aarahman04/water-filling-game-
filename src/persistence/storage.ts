/**
 * Device-local key/value storage. Capacitor Preferences on Android (survives WebView
 * cache clears), localStorage on the web, in-memory if both are unavailable
 * (private mode, blocked storage). Never throws.
 */

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
  };
}

function localStore(): KeyValueStore | null {
  try {
    const probe = '__fill_line_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch {
    return null;
  }
  return {
    get: async (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: async (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* quota / blocked: progress stays in memory for this session */
      }
    },
  };
}

function preferencesStore(): KeyValueStore {
  return {
    get: async (key) => {
      try {
        return (await Preferences.get({ key })).value;
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      try {
        await Preferences.set({ key, value });
      } catch {
        /* ignore */
      }
    },
  };
}

export function createStore(): KeyValueStore {
  if (Capacitor.isNativePlatform()) return preferencesStore();
  return localStore() ?? memoryStore();
}
