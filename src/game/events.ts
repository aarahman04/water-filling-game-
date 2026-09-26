import type { GameEvent, GameEventMap, GameEventName } from './types';

type Listener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

/**
 * Named-hook form for the design layer:
 *   controller.attach({ onFillStart: …, onLevelPass: … })
 */
export type GameHooks = {
  [K in GameEventName as `on${Capitalize<K>}`]?: Listener<K>;
};

export class GameEmitter {
  private listeners = new Map<GameEventName, Set<Listener<never>>>();

  on<K extends GameEventName>(type: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn as Listener<never>);
    return () => set.delete(fn as Listener<never>);
  }

  attach(hooks: GameHooks): () => void {
    const offs = Object.entries(hooks).map(([key, fn]) => {
      const type = (key.charAt(2).toLowerCase() + key.slice(3)) as GameEventName;
      return this.on(type, fn as Listener<GameEventName>);
    });
    return () => offs.forEach((off) => off());
  }

  emit(event: GameEvent): void {
    const set = this.listeners.get(event.type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (p: unknown) => void)(event.payload);
      } catch (err) {
        // A broken animation hook must never break game logic.
        console.error(`[fill-line] ${event.type} listener threw`, err);
      }
    }
  }
}
