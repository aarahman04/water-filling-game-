import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { isReducedMotion, useLatest } from '../app/hooks';
import { controller } from '../app/services';
import { WaterRenderer } from '../render/waterRenderer';
import { ASSETS, STAGE, readPalette } from '../theme/theme';
import type { TargetVisibility } from '../game';

interface Props {
  targetVisibility: TargetVisibility;
  reducedMotion: boolean;
  /** Prompt line above the art (44px reserved). */
  prompt: ReactNode;
  dimmed?: boolean;
}

const px = (n: number) => `calc(var(--s) * ${n}px)`;
const box = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({
  left: px(r.x),
  top: px(r.y),
  width: px(r.w),
  height: px(r.h),
});

/**
 * Glass assembly. Draw order (handoff §2): stand → rear glass → canvas (water, stream,
 * band, marker) → front glass → spout. Art scale s = min(1.25, fit height, fit width).
 */
export function Stage({ targetVisibility, reducedMotion, prompt, dimmed }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WaterRenderer | null>(null);
  const visibilityRef = useLatest(targetVisibility);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const art = artRef.current!;
    const root = rootRef.current!;
    const renderer = new WaterRenderer({
      canvas,
      shakeTarget: art,
      controller,
      palette: readPalette(),
      getReducedMotion: isReducedMotion,
      getTargetVisibility: () => visibilityRef.current,
    });
    rendererRef.current = renderer;

    let lastScale = 0;
    const fit = () => {
      const { width, height } = root.getBoundingClientRect();
      const gutter = width < 360 ? 32 : 48;
      const s = Math.max(
        0.3,
        Math.min(STAGE.maxScale, (height - STAGE.promptHeight) / STAGE.height, (width - gutter) / STAGE.width),
      );
      if (Math.abs(s - lastScale) < 0.001) return;
      lastScale = s;
      root.style.setProperty('--s', String(s));
      renderer.resize(s);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    fit();
    return () => {
      ro.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [visibilityRef]);

  useEffect(() => {
    rendererRef.current?.redraw();
  }, [targetVisibility, reducedMotion]);

  return (
    <div className={`stage${dimmed ? ' stage--dimmed' : ''}`} ref={rootRef}>
      <div className="stage__prompt" aria-live="polite">
        {prompt}
      </div>
      <div className="stage__art-wrap">
        <div
          className="stage__art"
          ref={artRef}
          style={{ width: px(STAGE.width), height: px(STAGE.height) }}
          aria-hidden="true"
        >
          <img className="stage__layer" src={ASSETS.stand} style={box(STAGE.stand)} alt="" draggable={false} />
          <img className="stage__layer" src={ASSETS.glassBack} style={box(STAGE.glass)} alt="" draggable={false} />
          <canvas className="stage__canvas" ref={canvasRef} />
          <img className="stage__layer" src={ASSETS.glassFront} style={box(STAGE.glass)} alt="" draggable={false} />
          <img className="stage__layer" src={ASSETS.spout} style={box(STAGE.spout)} alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
}
