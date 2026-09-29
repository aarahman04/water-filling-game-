import { useEffect, useState } from 'react';
import { useLatest } from '../app/hooks';
import { GAMEPLAY, TWIST_HINTS, getLevel, twistLabels } from '../game';
import { TIERS } from '../theme/theme';
import { Icon } from './Icon';
import { Dialog } from './Overlays';

export function LevelBrief({ level, onDone }: { level: number; onDone: () => void }) {
  const [reading, setReading] = useState(false);
  const done = useLatest(onDone);
  const config = getLevel(level);
  const twists = twistLabels(config.twists);
  const hidden = config.twists.hidden || GAMEPLAY.targetVisibility !== 'always';
  const duration = 2800 + twists.length * 650;

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setReading(true); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (reading) return;
    const exit = window.setTimeout(() => done.current(), duration);
    return () => clearTimeout(exit);
  }, [duration, reading, done]);

  return (
    <Dialog title={`Level ${level} instructions`} className="card--brief">
      <div className="brief__badge"><Icon name="life" size={28} /></div>
      <p className="brief__eyebrow">LEVEL {String(level).padStart(2, '0')} · {TIERS[config.tier].caption}</p>
      <h2 className="card__heading">{hidden ? 'Remember the line' : 'Find the line'}</h2>
      <p className="brief__instruction">Hold to pour. Release when the water reaches the glowing band.</p>
      {hidden && <p className="card__body">Watch the band before you pour. It disappears during filling.</p>}
      {twists.length > 0 && (
        <ul className="brief__twists">
          {twists.map((twist) => <li key={twist}><strong>{twist}</strong><span>{TWIST_HINTS[twist]}</span></li>)}
        </ul>
      )}
      <div className="brief__actions">
        <button type="button" className="cta cta--secondary" onClick={() => setReading(!reading)}>{reading ? 'Auto-close' : 'Keep reading'}</button>
        <button type="button" className="cta cta--primary cta--md" onClick={onDone}>Got it</button>
      </div>
      <div className="brief__timer" aria-hidden="true" key={String(reading)}><span style={{ animationDuration: `${duration}ms`, animationPlayState: reading ? 'paused' : 'running' }} /></div>
    </Dialog>
  );
}
