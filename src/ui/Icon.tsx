import { ASSETS } from '../theme/theme';

export type IconName = 'life' | 'life-empty' | 'pause' | 'check' | 'close' | 'settings' | 'sound' | 'music' | 'restart';

/** Injects only the <defs> of the design icon sheet as a hidden sprite (handoff §7). */
export function IconSprite() {
  const defs = ASSETS.iconSprite.match(/<defs>[\s\S]*<\/defs>/)?.[0] ?? '';
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: defs }} />
  );
}

export function Icon({ name, size = 24, slashed, className }: { name: IconName; size?: number; slashed?: boolean; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <use href={`#${name}`} />
      {slashed && <path d="M4 4 20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />}
    </svg>
  );
}
