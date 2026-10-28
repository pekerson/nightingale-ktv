import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { clampPlaybackOffset } from '@/features/playback/lib/display-scale';

type OverlayOffsetOptions = {
  x?: number | null;
  y?: number | null;
  active?: boolean;
};

function visibleOffset(requested: number, low: number, high: number): number {
  if (requested === 0) {
    return 0;
  }
  if (low > high) {
    return (low + high) / 2;
  }
  return Math.min(high, Math.max(low, requested));
}

export function useOverlayOffset(
  ref: RefObject<HTMLElement | null>,
  options: OverlayOffsetOptions,
) {
  const x = clampPlaybackOffset(options.x);
  const y = clampPlaybackOffset(options.y);
  const active = options.active !== false;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const applied = useRef(offset);

  useLayoutEffect(() => {
    applied.current = offset;
  }, [offset]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || !active) {
      return undefined;
    }
    const update = () => {
      const rect = element.getBoundingClientRect();
      const baseLeft = rect.left - applied.current.x;
      const baseTop = rect.top - applied.current.y;
      const next = {
        x: visibleOffset(
          (window.innerWidth * x) / 100,
          8 - baseLeft,
          window.innerWidth - 8 - baseLeft - rect.width,
        ),
        y: visibleOffset(
          (window.innerHeight * y) / 100,
          8 - baseTop,
          window.innerHeight - 8 - baseTop - rect.height,
        ),
      };
      setOffset((previous) => (previous.x === next.x && previous.y === next.y ? previous : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const mutations = new MutationObserver(update);
    mutations.observe(element, { attributes: true, attributeFilter: ['class'] });
    if (element.parentElement !== null) {
      mutations.observe(element.parentElement, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, x, y, active]);

  return { transform: `translate(${offset.x}px, ${offset.y}px)` };
}
