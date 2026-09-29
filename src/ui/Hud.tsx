import { useEffect, useState } from 'react';
import { controller } from '../app/services';
import { LEVEL_COUNT } from '../game';
import { Icon } from './Icon';

const pad = (n: number) => String(n).padStart(2, '0');

export function Hud({ level, lives, maxLives, onPause }: { level: number; lives: number; maxLives: number; onPause: () => void }) {
  // Animate the rightmost droplet when a life is lost; restore stagger on a new run.
  const [lostIndex, setLostIndex] = useState<number | null>(null);
  const [runKey, setRunKey] = useState(0);
  useEffect(() => {
    const offs = [
      controller.on('lifeLost', (p) => setLostIndex(p.livesRemaining)),
      controller.on('runStart', () => {
        setLostIndex(null);
        setRunKey((k) => k + 1);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <header className="hud">
      <div className="hud__level">
        <span className="hud__label">LEVEL</span>
        <span className="hud__value">
          {pad(level)} / {LEVEL_COUNT}
        </span>
      </div>
      <div className="hud__lives" role="img" aria-label={`${lives} of ${maxLives} lives`} key={runKey}>
        <span className="hud__label">LIVES</span>
        <div className="hud__droplets">
          {Array.from({ length: maxLives }, (_, i) => (
            <span key={i} className="life" style={{ animationDelay: `${i * 60}ms` }}>
              <Icon name="life-empty" className="life__empty" size={20} />
              {(i < lives || i === lostIndex) && (
                <Icon name="life" size={20} className={`life__full${i === lostIndex && i >= lives ? ' is-lost' : ''}`} />
              )}
            </span>
          ))}
        </div>
      </div>
      <button type="button" className="icon-btn" aria-label="Pause" onClick={onPause}>
        <Icon name="pause" />
      </button>
      <div className="hud__progress" aria-hidden="true"><span style={{ width: `${level / LEVEL_COUNT * 100}%` }} /></div>
    </header>
  );
}
