import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLatest, useReducedMotion } from '../app/hooks';
import type { RewardedStatus } from '../ads';
import { LEVELS, LEVEL_COUNT } from '../game';
import type { SaveData } from '../persistence/progress';
import { Icon } from './Icon';

/** Keep a closing overlay mounted just long enough for its exit transition. */
export function OverlayTransition({ active, children }: { active: boolean; children: ReactNode }) {
  const [previous, setPrevious] = useState(children);
  const reducedMotion = useReducedMotion();
  if (active && previous !== children) setPrevious(children);
  useEffect(() => {
    if (active) return;
    const timer = window.setTimeout(() => setPrevious(null), reducedMotion ? 0 : 180);
    return () => clearTimeout(timer);
  }, [active, reducedMotion]);
  return (
    <div className={`overlay-stack${active ? '' : ' is-leaving'}`} inert={!active} aria-hidden={!active || undefined}>
      {active ? children : previous}
    </div>
  );
}

/** Modal card with focus trap + restore and Escape handling. */
export function Dialog({
  title,
  children,
  onEscape,
  className = '',
  scrim = true,
}: {
  title: string;
  children: ReactNode;
  onEscape?: () => void;
  className?: string;
  scrim?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const escRef = useLatest(onEscape);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    (el.querySelector<HTMLElement>('button, [href], input') ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escRef.current) {
        e.preventDefault();
        escRef.current();
      } else if (e.key === 'Tab') {
        const items = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input')];
        if (items.length === 0) { e.preventDefault(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [escRef]);

  return (
    <div className={`overlay${scrim ? ' overlay--scrim' : ''}`}>
      <div className={`card ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, detail }: { label: string; checked: boolean; onChange: (v: boolean) => void; detail?: string }) {
  return (
    <button type="button" className="toggle-row" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="toggle-row__text">
        <span>{label}</span>
        {detail && <span className="toggle-row__detail">{detail}</span>}
      </span>
      <span className="toggle-row__state">{checked ? 'On' : 'Off'}</span>
      <span className={`switch${checked ? ' is-on' : ''}`} aria-hidden="true">
        <span className="switch__knob" />
      </span>
    </button>
  );
}

export function PreferenceRows({ save, onChange }: { save: SaveData; onChange: (patch: Partial<SaveData>) => void }) {
  return (
    <div className="pref-rows">
      <Toggle label="Sound" checked={!save.muted} onChange={(on) => onChange({ muted: !on })} />
      <Toggle
        label="Reduced motion"
        detail={save.reducedMotion === 'on' ? 'Always on' : 'Follows system setting'}
        checked={save.reducedMotion === 'on'}
        onChange={(on) => onChange({ reducedMotion: on ? 'on' : 'system' })}
      />
    </div>
  );
}

export function PauseMenu({
  canRestart,
  restartCosts,
  scored,
  save,
  onResume,
  onRestart,
  onQuit,
  onPrefs,
}: {
  canRestart: boolean;
  restartCosts: boolean;
  scored: boolean;
  save: SaveData;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onPrefs: (patch: Partial<SaveData>) => void;
}) {
  return (
    <Dialog title="Paused" onEscape={onResume}>
      <h2 className="card__heading">Paused</h2>
      <div className="card__actions">
        <button type="button" className="cta cta--primary cta--md" onClick={onResume}>
          {scored ? 'Resume result' : 'Resume'}
        </button>
        {canRestart && (
          <button type="button" className="cta cta--secondary" onClick={onRestart}>
            {restartCosts ? 'Restart level · costs 1 life' : 'Restart level'}
          </button>
        )}
        <button type="button" className="cta cta--secondary" onClick={onQuit}>
          Quit to menu
        </button>
      </div>
      <hr className="card__divider" />
      <PreferenceRows save={save} onChange={onPrefs} />
    </Dialog>
  );
}

export function Confirm({
  title,
  body,
  confirm,
  cancel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} onEscape={onCancel}>
      <h2 className="card__heading">{title}</h2>
      <p className="card__body">{body}</p>
      <div className="card__actions">
        <button type="button" className="cta cta--primary cta--md" onClick={onConfirm}>
          {confirm}
        </button>
        <button type="button" className="cta cta--secondary" onClick={onCancel}>
          {cancel}
        </button>
      </div>
    </Dialog>
  );
}

export function CompliancePage({
  page,
  privacyUrl,
  onClose,
}: {
  page: 'privacy' | 'advertising';
  privacyUrl: string;
  onClose: () => void;
}) {
  const title = page === 'privacy' ? 'Privacy policy' : 'Advertising information';
  return (
    <Dialog
      title={title}
      onEscape={onClose}
      className={page === 'privacy' ? 'card--compliance' : 'card--compliance card--ad-info'}
    >
      <div className="compliance__header">
        <h2 className="card__heading">{title}</h2>
        <button type="button" className="compliance__back" onClick={onClose}>
          Back to menu
        </button>
      </div>
      {page === 'privacy' ? (
        <iframe className="compliance__frame" src={privacyUrl} title="Fill Line privacy policy" />
      ) : (
        <div className="compliance__body">
          <p className="card__body">
            The Android app uses Google AdMob for optional rewarded ads that grant an extra life and full-screen ads between runs. The web version has no ads.
          </p>
          <p className="card__body">Google’s authorized sellers for Fill Line are listed in the public app-ads.txt file.</p>
          <a className="cta cta--secondary" href="/app-ads.txt" target="_blank" rel="noopener noreferrer">
            View app-ads.txt
          </a>
        </div>
      )}
    </Dialog>
  );
}

export function SettingsPanel({
  save,
  onChange,
  onClose,
  privacyRequired,
  privacyUrl,
  onPrivacy,
}: {
  save: SaveData;
  onChange: (patch: Partial<SaveData>) => void;
  onClose: () => void;
  privacyRequired: boolean;
  privacyUrl: string;
  onPrivacy: () => void;
}) {
  const passed = save.bestAccuracy.filter((a) => a !== null).length;
  return (
    <Dialog title="Settings" onEscape={onClose} className="card--settings">
      <div className="card__titlebar">
        <h2 className="card__heading">Settings</h2>
        <button type="button" className="icon-btn" aria-label="Close settings" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <PreferenceRows save={save} onChange={onChange} />
      {(privacyRequired || privacyUrl) && (
        <>
          <hr className="card__divider" />
          <h3 className="card__subheading">Privacy</h3>
          <div className="card__actions card__actions--tight">
            {privacyRequired && (
              <button type="button" className="cta cta--secondary" onClick={onPrivacy}>
                Ad privacy choices
              </button>
            )}
            {privacyUrl && (
              <a className="cta cta--secondary" href={privacyUrl} target="_blank" rel="noopener noreferrer">
                Privacy policy
              </a>
            )}
          </div>
        </>
      )}
      <hr className="card__divider" />
      <h3 className="card__subheading">Records</h3>
      <dl className="stats">
        <div>
          <dt>Best level</dt>
          <dd>{save.bestLevel ? `${save.bestLevel} / ${LEVEL_COUNT}` : '—'}</dd>
        </div>
        <div>
          <dt>Games played</dt>
          <dd>{save.gamesPlayed}</dd>
        </div>
        <div>
          <dt>Levels cleared</dt>
          <dd>{passed}</dd>
        </div>
      </dl>
      <ol className="accuracy-grid" aria-label="Best accuracy per level">
        {LEVELS.map((l) => {
          const a = save.bestAccuracy[l.level - 1];
          return (
            <li key={l.level} className={a == null ? 'is-empty' : ''} title={`Level ${l.level}`}>
              <span className="accuracy-grid__level">{l.level}</span>
              <span className="accuracy-grid__value">{a == null ? '—' : `${Math.round(a * 100)}%`}</span>
            </li>
          );
        })}
      </ol>
      <p className="card__meta">Accuracy = how close to the band centre. Game progress is stored only on this device.</p>
    </Dialog>
  );
}

export interface ReviveOffer {
  status: RewardedStatus;
  revivesLeft: number;
  max: number;
  busy: boolean;
  notice: string | null;
  onWatch: () => void;
}

export function GameOverCard({
  levelReached,
  bestLevel,
  revive,
  onRestart,
  onMenu,
}: {
  levelReached: number;
  bestLevel: number;
  revive: ReviveOffer;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const offer = revive.status !== 'off' && revive.revivesLeft > 0;
  const watchLabel = revive.busy
    ? 'Loading ad…'
    : revive.status === 'ready'
      ? 'Watch ad · +1 life'
      : revive.status === 'loading'
        ? 'Finding an ad…'
        : 'Ad unavailable · tap to retry';
  return (
    <Dialog title="Out of lives" scrim={false} className="card--result">
      <h2 className="card__heading">Out of lives</h2>
      <p className="card__body">
        You reached level {levelReached} of {LEVEL_COUNT}.
      </p>
      {offer && (
        <p className="card__body">
          Your lives have run out. Want an extra life? Watch a short ad and keep going from level {levelReached}.
        </p>
      )}
      <p className="card__meta">
        Best ever: level {Math.max(bestLevel, levelReached)}
        {offer && ` · ${revive.revivesLeft} of ${revive.max} extra lives left this run`}
      </p>
      {revive.notice && (
        <p className="card__notice" role="status">
          {revive.notice}
        </p>
      )}
      <div className="card__actions">
        {offer && (
          <button
            type="button"
            className="cta cta--primary cta--md"
            disabled={revive.busy || revive.status === 'loading'}
            onClick={revive.onWatch}
          >
            {watchLabel}
          </button>
        )}
        <button
          type="button"
          className={offer ? 'cta cta--secondary' : 'cta cta--primary cta--md'}
          disabled={revive.busy}
          onClick={onRestart}
        >
          Restart from level 1
        </button>
        <button type="button" className="cta cta--secondary" disabled={revive.busy} onClick={onMenu}>
          Main menu
        </button>
      </div>
    </Dialog>
  );
}

export function VictoryCard({ livesRemaining, onPlayAgain, onMenu }: { livesRemaining: number; onPlayAgain: () => void; onMenu: () => void }) {
  return (
    <Dialog title="Every drop counted" scrim={false} className="card--result card--victory">
      <p className="victory__count">
        {LEVEL_COUNT} / {LEVEL_COUNT}
      </p>
      <h2 className="card__heading">Every drop counted.</h2>
      <p className="card__body">
        {livesRemaining} {livesRemaining === 1 ? 'life' : 'lives'} remaining
      </p>
      <div className="card__actions">
        <button type="button" className="cta cta--primary cta--md" onClick={onPlayAgain}>
          Play again
        </button>
        <button type="button" className="cta cta--secondary" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </Dialog>
  );
}
