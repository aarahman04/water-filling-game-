import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useGameState,
  useLatest,
  usePrivacyOptionsRequired,
  useReducedMotion,
  useRerenderAt,
  useRewardedStatus,
  useSave,
} from './app/hooks';
import { installPlatformHandlers } from './app/platform';
import { adCoordinator, ads, controller, eventTime, now, progress, sfx } from './app/services';
import { PRIVACY_URL, type RewardOutcome } from './ads';
import {
  GAMEPLAY,
  LEVEL_COUNT,
  getLevel,
  selectRun,
  type GameState,
  type PausableState,
} from './game';
import type { SaveData } from './persistence/progress';
import { TIERS } from './theme/theme';
import { FillButton } from './ui/FillButton';
import { Hud } from './ui/Hud';
import { Icon, IconSprite } from './ui/Icon';
import { CompliancePage, Confirm, GameOverCard, OverlayTransition, PauseMenu, SettingsPanel, VictoryCard } from './ui/Overlays';
import { Stage } from './ui/Stage';
import { LevelBrief } from './ui/LevelBrief';

type Overlay = 'none' | 'settings' | 'levelBrief' | 'confirmRestart' | 'confirmQuit' | 'privacy' | 'advertising';

const pad = (n: number) => String(n).padStart(2, '0');
const targetVisibility = GAMEPLAY.targetVisibility;

export default function App() {
  const state = useGameState();
  const save = useSave();
  const reducedMotion = useReducedMotion();
  const [overlay, setOverlay] = useState<Overlay>('none');
  const overlayRef = useLatest(overlay);
  const rewardedStatus = useRewardedStatus();
  const privacyRequired = usePrivacyOptionsRequired();
  const briefAttempt = useRef<string | null>(null);

  const dispatch = useCallback((type: 'START_RUN' | 'CONTINUE' | 'PAUSE' | 'RESUME' | 'RESTART_LEVEL' | 'QUIT') => {
    controller.dispatch({ type, now: now() });
  }, []);
  const setPrefs = useCallback((patch: Partial<SaveData>) => progress.update((d) => ({ ...d, ...patch })), []);
  const finishBrief = useCallback(() => {
    setOverlay('none');
    dispatch('RESUME');
  }, [dispatch]);

  // Pause the preview while reading; resume replays its full duration. Each retry gets its own brief.
  useEffect(() => {
    if (state.tag === 'MENU') briefAttempt.current = null;
    if (state.tag !== 'LEVEL_INTRO') return;
    const key = `${state.run.seed}:${state.run.attempt}`;
    if (briefAttempt.current === key) return;
    briefAttempt.current = key;
    setOverlay('levelBrief');
    dispatch('PAUSE');
  }, [state, dispatch]);
  /** Synchronous lock so double taps can't start two ads / two runs. */
  const adLock = useRef(false);
  const [adBusy, setAdBusy] = useState(false);
  const [adNotice, setAdNotice] = useState<string | null>(null);

  const withAdLock = useCallback(async (fn: () => Promise<void>) => {
    if (adLock.current) return;
    adLock.current = true;
    setAdBusy(true);
    try {
      await fn();
    } finally {
      adLock.current = false;
      setAdBusy(false);
    }
  }, []);

  const startRun = useCallback(
    () =>
      withAdLock(async () => {
        setAdNotice(null);
        await adCoordinator.beforeRunStart();
        dispatch('START_RUN');
      }),
    [withAdLock, dispatch],
  );

  const continueRun = useCallback(
    () =>
      withAdLock(async () => {
        const s = controller.state;
        if (s.tag !== 'RESULT') return;
        if (s.next === 'nextLevel') await adCoordinator.beforeNextLevel(s.run.level);
        dispatch('CONTINUE');
      }),
    [withAdLock, dispatch],
  );

  const watchAd = useCallback(
    () =>
      withAdLock(async () => {
        if (ads.rewardedStatus() === 'unavailable') {
          ads.ensureLoaded();
          return;
        }
        setAdNotice(null);
        const outcome: RewardOutcome = await ads.showRewarded();
        if (outcome === 'rewarded') controller.dispatch({ type: 'REVIVE', now: now() });
        else
          setAdNotice(
            outcome === 'dismissed'
              ? 'Ad closed early, so no extra life this time.'
              : 'No ad available right now. Try again in a moment.',
          );
      }),
    [withAdLock],
  );

  // Make sure a rewarded ad is loading while the revive offer is on screen.
  useEffect(() => {
    if (state.tag === 'GAME_OVER') ads.ensureLoaded();
  }, [state.tag]);

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full';
  }, [reducedMotion]);

  // Loop + interruption handling.
  useEffect(() => {
    controller.start();
    const off = installPlatformHandlers(() => {
      if (overlayRef.current === 'levelBrief') return true;
      if (overlayRef.current !== 'none') {
        setOverlay('none');
        return true;
      }
      return false;
    });
    return () => {
      off();
      controller.stop();
    };
  }, [overlayRef]);

  // Keyboard: Esc pauses; Space/Enter mirror hold when focus isn't on another control.
  useEffect(() => {
    const held = { current: false };
    const isFillKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter';
    const onDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const tag = controller.state.tag;
      if (e.key === 'Escape' && overlayRef.current === 'none') {
        if (tag === 'PAUSED') dispatch('RESUME');
        else if (tag !== 'MENU' && tag !== 'GAME_OVER' && tag !== 'VICTORY') dispatch('PAUSE');
        return;
      }
      if (!isFillKey(e) || (e.target instanceof HTMLElement && e.target.closest('button, input'))) return;
      if (tag !== 'READY' && tag !== 'FILLING') return;
      e.preventDefault();
      if (e.repeat || held.current) return;
      held.current = true;
      controller.dispatch({ type: 'FILL_PRESS', now: eventTime(e) });
    };
    const onUp = (e: KeyboardEvent) => {
      if (!isFillKey(e) || !held.current) return;
      held.current = false;
      if (controller.state.tag === 'FILLING') controller.dispatch({ type: 'FILL_RELEASE', now: eventTime(e) });
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [dispatch, overlayRef]);

  const play = () => {
    sfx.unlock();
    void startRun();
  };

  const view = describe(state, save, play, () => void continueRun(), adBusy);
  useRerenderAt(...view.rerenderAt);

  const run = selectRun(state);
  const paused = state.tag === 'PAUSED' ? state.resumeTo : null;
  const inRun = run !== null;
  const tier = TIERS[getLevel(run?.level ?? 1).tier];

  return (
    <div className="shell">
      <IconSprite />
      <main className={`game${state.tag === 'MENU' ? ' game--title' : ''}`} data-water={tier.water} inert={overlay !== 'none' || state.tag === 'PAUSED' || state.tag === 'GAME_OVER' || state.tag === 'VICTORY'}>
        {inRun ? (
          <Hud level={run.level} lives={run.lives} maxLives={GAMEPLAY.startingLives} onPause={() => dispatch('PAUSE')} />
        ) : state.tag === 'MENU' ? (
          <header className="title">
            <h1 className="title__name">
              FILL
              <br />
              LINE
            </h1>
            <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setOverlay('settings')}>
              <Icon name="settings" />
            </button>
          </header>
        ) : (
          <header className="hud" />
        )}

        <Stage
          targetVisibility={targetVisibility}
          reducedMotion={reducedMotion}
          dimmed={state.tag === 'GAME_OVER' || state.tag === 'VICTORY'}
        />

        <footer className="controls">
          <div className="controls__status" aria-live="polite" key={state.tag}>
            {view.prompt}
            {view.helper && <p className="controls__helper">{view.helper}</p>}
          </div>
          {view.button ? <FillButton mode={view.button} /> : <div className="cta-placeholder" />}
          {state.tag === 'MENU' && (
            <nav className="menu__links" aria-label="Information">
              {ads.supported ? (
                <>
                  <button type="button" className="menu__link" onClick={() => setOverlay('privacy')}>
                    Privacy policy
                  </button>
                  <button type="button" className="menu__link" onClick={() => setOverlay('advertising')}>
                    Advertising information
                  </button>
                </>
              ) : (
                <>
                  <a className="menu__link" href="/privacy.html" target="_blank" rel="noopener noreferrer">
                    Privacy policy
                  </a>
                  <a className="menu__link" href="/advertising.html" target="_blank" rel="noopener noreferrer">
                    Advertising information
                  </a>
                </>
              )}
            </nav>
          )}
        </footer>
      </main>

      <OverlayTransition active={overlay !== 'none' || state.tag === 'PAUSED' || state.tag === 'GAME_OVER' || state.tag === 'VICTORY'}>
        {overlay === 'levelBrief' && run && <LevelBrief key={`${run.seed}:${run.attempt}`} level={run.level} onDone={finishBrief} />}

        {paused && overlay === 'none' && (
          <PauseMenu
            canRestart={paused.tag === 'LEVEL_INTRO' || paused.tag === 'READY'}
            restartCosts={isPoured(paused)}
            scored={paused.tag === 'SETTLING' || paused.tag === 'RESULT'}
            save={save}
            onResume={() => dispatch('RESUME')}
            onRestart={() => (isPoured(paused) ? setOverlay('confirmRestart') : dispatch('RESTART_LEVEL'))}
            onQuit={() => setOverlay('confirmQuit')}
            onPrefs={setPrefs}
          />
        )}
        {overlay === 'confirmRestart' && (
          <Confirm
            title="Restart this level?"
            body="You'll lose 1 life."
            confirm="Restart level"
            cancel="Keep playing"
            onConfirm={() => {
              setOverlay('none');
              dispatch('RESTART_LEVEL');
            }}
            onCancel={() => setOverlay('none')}
          />
        )}
        {overlay === 'confirmQuit' && (
          <Confirm
            title="Leave this run?"
            body="Progress in this run will be lost."
            confirm="Leave run"
            cancel="Keep playing"
            onConfirm={() => {
              setOverlay('none');
              dispatch('QUIT');
            }}
            onCancel={() => setOverlay('none')}
          />
        )}
        {overlay === 'settings' && (
          <SettingsPanel
            save={save}
            onChange={setPrefs}
            onClose={() => setOverlay('none')}
            privacyRequired={privacyRequired}
            privacyUrl={PRIVACY_URL}
            onPrivacy={() => void ads.showPrivacyOptions()}
          />
        )}
        {(overlay === 'privacy' || overlay === 'advertising') && (
          <CompliancePage page={overlay} privacyUrl={PRIVACY_URL} onClose={() => setOverlay('none')} />
        )}
        {state.tag === 'GAME_OVER' && (
          <GameOverCard
            levelReached={state.levelReached}
            bestLevel={save.bestLevel}
            revive={{
              status: rewardedStatus,
              revivesLeft: state.revivesLeft,
              max: GAMEPLAY.maxRevivesPerRun,
              busy: adBusy,
              notice: adNotice,
              onWatch: () => void watchAd(),
            }}
            onRestart={() => void startRun()}
            onMenu={() => {
              setAdNotice(null);
              dispatch('QUIT');
            }}
          />
        )}
        {state.tag === 'VICTORY' && (
          <VictoryCard livesRemaining={state.livesRemaining} onPlayAgain={() => void startRun()} onMenu={() => dispatch('QUIT')} />
        )}
      </OverlayTransition>
    </div>
  );
}

function isPoured(s: PausableState) {
  return (s.tag === 'READY' || s.tag === 'LEVEL_INTRO') && s.run.pouredThisAttempt;
}

type ButtonMode = Parameters<typeof FillButton>[0]['mode'];

interface View {
  prompt: ReactNode;
  helper: ReactNode;
  button: ButtonMode | null;
  rerenderAt: number[];
}

/** All state → copy/controls mapping in one place (handoff §4). */
function describe(state: GameState, save: SaveData, play: () => void, cont: () => void, busy: boolean): View {
  const s = state.tag === 'PAUSED' ? state.resumeTo : state;
  const t = now();
  switch (s.tag) {
    case 'MENU':
      return {
        prompt: <span className="prompt__sub">Hold. Pour. Find your flow.</span>,
        helper:
          save.bestLevel > 0
            ? `Best: level ${save.bestLevel} of ${LEVEL_COUNT} · ${save.gamesPlayed} ${save.gamesPlayed === 1 ? 'game' : 'games'}`
            : `${LEVEL_COUNT} levels · ${GAMEPLAY.startingLives} lives`,
        button: busy ? { kind: 'disabled', label: 'Play' } : { kind: 'action', label: 'Play', onActivate: play },
        rerenderAt: [],
      };
    case 'LEVEL_INTRO': {
      return {
        prompt: null,
        helper: null,
        button: { kind: 'disabled', label: 'Watch the band' },
        rerenderAt: [],
      };
    }
    case 'READY': {
      return {
        prompt: null,
        helper: null,
        button: { kind: 'hold', label: s.volume > 0 ? 'Hold to keep filling' : 'Hold to fill', filling: false },
        rerenderAt: [],
      };
    }
    case 'FILLING':
      return {
        prompt: null,
        helper: null,
        button: { kind: 'hold', label: 'Release to stop', filling: true },
        rerenderAt: [],
      };
    case 'SETTLING':
      return {
        prompt: null,
        helper: null,
        button: { kind: 'disabled', label: 'Settling…' },
        rerenderAt: [],
      };
    case 'RESULT': {
      const { score, run, next, advanceAt } = s;
      const ready = t >= advanceAt;
      const prompt = score.hit ? (
        <span className="prompt__result prompt__result--pass">
          <Icon name="check" /> On the line
        </span>
      ) : (
        <span className="prompt__result prompt__result--fail">
          <Icon name="close" /> {score.overflow ? 'Overflowed' : score.direction === 'high' ? 'Too high' : 'Too low'}
        </span>
      );
      const helper = score.hit
        ? `Level ${pad(run.level)} complete · ${Math.round(score.accuracy * 100)}% accuracy`
        : run.lives > 0
          ? `${run.lives} ${run.lives === 1 ? 'life' : 'lives'} left`
          : 'No lives left';
      let button: ButtonMode;
      if (next === 'nextLevel') button = ready && !busy ? { kind: 'action', label: 'Next level', onActivate: cont } : { kind: 'disabled', label: 'Next level' };
      else if (next === 'retry') button = ready ? { kind: 'action', label: 'Try again', onActivate: cont } : { kind: 'disabled', label: 'Try again' };
      else button = { kind: 'disabled', label: next === 'victory' ? 'Level complete' : 'Out of lives' };
      return { prompt, helper, button, rerenderAt: [advanceAt] };
    }
    case 'GAME_OVER':
    case 'VICTORY':
      return { prompt: null, helper: null, button: null, rerenderAt: [] };
  }
}
