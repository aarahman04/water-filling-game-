import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useGameState, useLatest, useReducedMotion, useRerenderAt, useSave } from './app/hooks';
import { installPlatformHandlers } from './app/platform';
import { controller, eventTime, now, progress, sfx } from './app/services';
import { GAMEPLAY, LEVEL_COUNT, getLevel, selectRun, type GameState, type PausableState } from './game';
import type { SaveData } from './persistence/progress';
import { MOTION, TIERS } from './theme/theme';
import { FillButton } from './ui/FillButton';
import { Hud } from './ui/Hud';
import { Icon, IconSprite } from './ui/Icon';
import { Confirm, GameOverCard, PauseMenu, SettingsPanel, TutorialCard, VictoryCard } from './ui/Overlays';
import { Stage } from './ui/Stage';

type Overlay = 'none' | 'settings' | 'tutorial' | 'confirmRestart' | 'confirmQuit';

const pad = (n: number) => String(n).padStart(2, '0');
const targetVisibility = GAMEPLAY.targetVisibility;
const bandVisible = targetVisibility === 'always';

export default function App() {
  const state = useGameState();
  const save = useSave();
  const reducedMotion = useReducedMotion();
  const [overlay, setOverlay] = useState<Overlay>('none');
  const overlayRef = useLatest(overlay);

  const dispatch = useCallback((type: 'START_RUN' | 'CONTINUE' | 'PAUSE' | 'RESUME' | 'RESTART_LEVEL' | 'QUIT') => {
    controller.dispatch({ type, now: now() });
  }, []);
  const setPrefs = useCallback((patch: Partial<SaveData>) => progress.update((d) => ({ ...d, ...patch })), []);

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
    else dispatch('START_RUN');
  };

  const view = describe(state, save, play, () => dispatch('CONTINUE'));
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
      {overlay === 'settings' && <SettingsPanel save={save} onChange={setPrefs} onClose={() => setOverlay('none')} />}
      {overlay === 'tutorial' && (
        <TutorialCard
          bandAlwaysVisible={bandVisible}
          onDone={() => {
            setPrefs({ seenTutorial: true });
            setOverlay('none');
            dispatch('START_RUN');
          }}
        />
      )}
      {state.tag === 'GAME_OVER' && (
        <GameOverCard
          levelReached={state.levelReached}
          bestLevel={save.bestLevel}
          onRestart={() => dispatch('START_RUN')}
          onMenu={() => dispatch('QUIT')}
        />
      )}
      {state.tag === 'VICTORY' && (
        <VictoryCard livesRemaining={state.livesRemaining} onPlayAgain={() => dispatch('START_RUN')} onMenu={() => dispatch('QUIT')} />
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
function describe(state: GameState, save: SaveData, play: () => void, cont: () => void): View {
  const s = state.tag === 'PAUSED' ? state.resumeTo : state;
  const t = now();
  switch (s.tag) {
    case 'MENU':
      return {
        prompt: <span className="prompt__sub">Pour. Release. Land on the line.</span>,
        helper: save.bestLevel > 0 ? `Best: level ${save.bestLevel} of ${LEVEL_COUNT} · ${save.gamesPlayed} ${save.gamesPlayed === 1 ? 'game' : 'games'}` : '20 levels · 5 lives',
        button: { kind: 'action', label: 'Play', onActivate: play },
        rerenderAt: [],
      };
    case 'LEVEL_INTRO': {
      const introAt = s.readyAt - GAMEPLAY.timing.introMs;
      const swapAt = introAt + MOTION.intro.bandInAt;
      return {
        prompt:
          t < swapAt ? (
            <span className="prompt__level" key={`lvl-${s.run.level}-${introAt}`}>LEVEL {pad(s.run.level)}</span>
          ) : (
            <span className="prompt__text">{bandVisible ? 'Watch the band' : 'Remember the line'}</span>
          ),
        helper: 'Get ready',
        button: { kind: 'disabled', label: 'Get ready' },
        rerenderAt: [swapAt],
      };
    }
    case 'READY':
      return {
        prompt: <span className="prompt__text">{bandVisible ? 'Stop inside the band' : ' '}</span>,
        helper: s.volume > 0 ? 'Hold to keep filling. Release to stop.' : 'Hold to fill. Release to stop.',
        button: { kind: 'hold', label: 'Fill', filling: false },
        rerenderAt: [],
      };
    case 'FILLING':
      return {
        prompt: <span className="prompt__text">{bandVisible ? 'Stop inside the band' : ' '}</span>,
        helper: bandVisible ? 'Release inside the band' : 'Aim for the line you remember',
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
      if (next === 'nextLevel') button = ready ? { kind: 'action', label: 'Next level', onActivate: cont } : { kind: 'disabled', label: 'Next level' };
      else if (next === 'retry') button = ready ? { kind: 'action', label: 'Try again', onActivate: cont } : { kind: 'disabled', label: 'Try again' };
      else button = { kind: 'disabled', label: next === 'victory' ? 'Level complete' : 'Out of lives' };
      return { prompt, helper, button, rerenderAt: [advanceAt] };
    }
    case 'GAME_OVER':
    case 'VICTORY':
      return { prompt: ' ', helper: ' ', button: null, rerenderAt: [] };
  }
}
