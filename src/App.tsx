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
  LEVELS,
  LEVEL_COUNT,
  TWIST_HINTS,
  getLevel,
  selectRun,
  twistLabels,
  type GameState,
  type PausableState,
} from './game';
import type { SaveData } from './persistence/progress';
import { MOTION, TIERS } from './theme/theme';
import { FillButton } from './ui/FillButton';
import { Hud } from './ui/Hud';
import { Icon, IconSprite } from './ui/Icon';
import { CompliancePage, Confirm, GameOverCard, PauseMenu, SettingsPanel, TutorialCard, VictoryCard } from './ui/Overlays';
import { Stage } from './ui/Stage';

type Overlay = 'none' | 'settings' | 'tutorial' | 'confirmRestart' | 'confirmQuit' | 'privacy' | 'advertising';

const pad = (n: number) => String(n).padStart(2, '0');
const targetVisibility = GAMEPLAY.targetVisibility;
const bandVisible = targetVisibility === 'always';

/** Twists that appear for the first time on `level` (to explain them once). */
function newTwists(level: number): string[] {
  const seen = new Set(LEVELS.slice(0, level - 1).flatMap((l) => twistLabels(l.twists)));
  return twistLabels(getLevel(level).twists).filter((t) => !seen.has(t));
}

export default function App() {
  const state = useGameState();
  const save = useSave();
  const reducedMotion = useReducedMotion();
  const [overlay, setOverlay] = useState<Overlay>('none');
  const overlayRef = useLatest(overlay);
  const rewardedStatus = useRewardedStatus();
  const privacyRequired = usePrivacyOptionsRequired();

  const dispatch = useCallback((type: 'START_RUN' | 'CONTINUE' | 'PAUSE' | 'RESUME' | 'RESTART_LEVEL' | 'QUIT') => {
    controller.dispatch({ type, now: now() });
  }, []);
  const setPrefs = useCallback((patch: Partial<SaveData>) => progress.update((d) => ({ ...d, ...patch })), []);
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
    if (!save.seenTutorial) setOverlay('tutorial');
    else void startRun();
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
      <main className={`game${state.tag === 'MENU' ? ' game--title' : ''}`} data-water={tier.water}>
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
          prompt={view.prompt}
          dimmed={state.tag === 'GAME_OVER' || state.tag === 'VICTORY'}
        />

        <footer className="controls">
          <p className="controls__caption" style={{ color: tier.captionColor }}>
            {inRun ? tier.caption : ' '}
          </p>
          <p className="controls__helper">{view.helper}</p>
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
      {overlay === 'tutorial' && (
        <TutorialCard
          bandAlwaysVisible={bandVisible}
          revivable={ads.supported}
          onDone={() => {
            setPrefs({ seenTutorial: true });
            setOverlay('none');
            void startRun();
          }}
        />
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
        prompt: <span className="prompt__sub">Pour. Release. Land on the line.</span>,
        helper:
          save.bestLevel > 0
            ? `Best: level ${save.bestLevel} of ${LEVEL_COUNT} · ${save.gamesPlayed} ${save.gamesPlayed === 1 ? 'game' : 'games'}`
            : `${LEVEL_COUNT} levels · ${GAMEPLAY.startingLives} lives · no mercy`,
        button: busy ? { kind: 'disabled', label: 'Play' } : { kind: 'action', label: 'Play', onActivate: play },
        rerenderAt: [],
      };
    case 'LEVEL_INTRO': {
      const introAt = s.readyAt - GAMEPLAY.timing.introMs;
      const swapAt = introAt + MOTION.intro.bandInAt;
      const twists = twistLabels(getLevel(s.run.level).twists);
      const fresh = newTwists(s.run.level);
      const hidden = getLevel(s.run.level).twists.hidden;
      return {
        prompt:
          t < swapAt ? (
            <span className="prompt__level" key={`lvl-${s.run.level}-${introAt}`}>LEVEL {pad(s.run.level)}</span>
          ) : fresh.length > 0 ? (
            <span className="prompt__text prompt__text--warn">
              New: {fresh[0]}. {TWIST_HINTS[fresh[0]]}
            </span>
          ) : (
            <span className="prompt__text">{hidden || !bandVisible ? 'Remember the band' : 'Watch the band'}</span>
          ),
        helper: twists.length ? <span className="twists">{twists.join(' · ')}</span> : 'Get ready',
        button: { kind: 'disabled', label: 'Get ready' },
        rerenderAt: [swapAt],
      };
    }
    case 'READY': {
      const tw = getLevel(s.run.level).twists;
      return {
        prompt: <span className="prompt__text">{readyPrompt(tw)}</span>,
        helper: s.volume > 0 ? 'Hold to keep filling. Release to stop.' : 'Hold to fill. Release to stop.',
        button: { kind: 'hold', label: 'Fill', filling: false },
        rerenderAt: [],
      };
    }
    case 'FILLING':
      return {
        prompt: <span className="prompt__text">{readyPrompt(getLevel(s.run.level).twists)}</span>,
        helper: getLevel(s.run.level).twists.hidden || !bandVisible ? 'Aim for the band you remember' : 'Release inside the band',
        button: { kind: 'hold', label: 'Release to stop', filling: true },
        rerenderAt: [],
      };
    case 'SETTLING':
      return {
        prompt: ' ',
        helper: 'Settling…',
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
      return { prompt: ' ', helper: ' ', button: null, rerenderAt: [] };
  }
}

function readyPrompt(tw: ReturnType<typeof getLevel>['twists']): string {
  if (tw.hidden || !bandVisible) return 'Where was the band?';
  if (tw.fog) return 'The water vanishes in the fog';
  if (tw.moving) return 'Catch the moving band';
  if (tw.drip) return 'Stop early. It drips.';
  return 'Stop inside the band';
}
