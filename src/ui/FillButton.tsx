import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { controller, eventTime } from '../app/services';
import { Icon } from './Icon';

type Mode =
  /** Hold-to-fill: pointerdown starts, pointerup / lost capture stops. */
  | { kind: 'hold'; label: string; filling: boolean }
  /** Ordinary button (Play, Next level, Try again). */
  | { kind: 'action'; label: string; onActivate: () => void }
  | { kind: 'disabled'; label: string };

/**
 * The single primary control. Uses Pointer Events only (touch + mouse + pen), captures
 * the active pointer so releasing outside the button still stops the pour, ignores
 * extra pointers, and forwards the *event's* timestamp so scoring is exact.
 */
export function FillButton({ mode }: { mode: Mode }) {
  const activePointer = useRef<number | null>(null);
  const keyHeld = useRef(false);

  // Leaving hold mode (e.g. state moved to SETTLING via overflow) drops any tracked pointer.
  useEffect(() => {
    if (mode.kind !== 'hold') {
      activePointer.current = null;
      keyHeld.current = false;
    }
  }, [mode.kind]);

  const release = (ts: number) => {
    if (controller.state.tag === 'FILLING') controller.dispatch({ type: 'FILL_RELEASE', now: ts });
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (mode.kind !== 'hold' || activePointer.current !== null || !e.isPrimary || e.button > 0) return;
    e.preventDefault();
    activePointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported: pointerup on the element still works */
    }
    controller.dispatch({ type: 'FILL_PRESS', now: eventTime(e) });
  };

  const onPointerEnd = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== activePointer.current) return;
    activePointer.current = null;
    release(eventTime(e));
  };

  const onPointerCancel = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== activePointer.current) return;
    activePointer.current = null;
    // Design: a cancelled hold freezes into PAUSE without scoring.
    if (controller.state.tag === 'FILLING') controller.dispatch({ type: 'PAUSE', now: eventTime(e) });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (mode.kind !== 'hold' || (e.key !== ' ' && e.key !== 'Enter')) return;
    e.preventDefault();
    if (e.repeat || keyHeld.current) return;
    keyHeld.current = true;
    controller.dispatch({ type: 'FILL_PRESS', now: eventTime(e) });
  };

  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (mode.kind === 'hold') e.preventDefault();
    if (!keyHeld.current) return;
    keyHeld.current = false;
    release(eventTime(e));
  };

  const disabled = mode.kind === 'disabled';
  const pressed = mode.kind === 'hold' && mode.filling;

  return (
    <button
      type="button"
      className={`cta cta--primary${pressed ? ' is-pressed' : ''}${mode.kind === 'hold' ? ' cta--hold' : ''}`}
      disabled={disabled}
      aria-pressed={mode.kind === 'hold' ? pressed : undefined}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()}
      onClick={mode.kind === 'action' ? mode.onActivate : undefined}
    >
      <Icon name={disabled ? 'life-empty' : 'life'} size={22} />
      <span key={mode.label} className="cta__label">{mode.label}</span>
    </button>
  );
}
