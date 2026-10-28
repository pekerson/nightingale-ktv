import { clampPlaybackOffset, clampPitchGraphScale } from './display-scale';

export function pitchGraphSize(width: number, height: number, userScale: number) {
  const scale = Math.max(0.85, height / 1080) * clampPitchGraphScale(userScale);
  return {
    scale,
    width: Math.min(400 * scale, Math.max(120, width - 32)),
    height: Math.min(44 * scale, Math.max(40, height - 32)),
  };
}

type Placement = {
  viewportWidth: number;
  viewportHeight: number;
  width: number;
  height: number;
  horizontal?: string | null;
  vertical?: string | null;
  fallback: 'top' | 'bottom';
  offsetX?: number | null;
  offsetY?: number | null;
};

function anchorOffset(position: string, viewport: number, size: number, inset: number): number {
  if (position === 'left' || position === 'top') {
    return inset;
  }
  if (position === 'right' || position === 'bottom') {
    return viewport - inset - size;
  }
  return (viewport - size) / 2;
}

export function pitchGraphPlacement(options: Placement) {
  const { viewportWidth, viewportHeight, width, height, horizontal, vertical, fallback } = options;
  const inset = viewportWidth < 640 ? 8 : 12;
  const x = anchorOffset(horizontal ?? 'center', viewportWidth, width, inset);
  const y = anchorOffset(vertical ?? fallback, viewportHeight, height, inset);
  return {
    left: Math.max(
      8,
      Math.min(
        viewportWidth - width - 8,
        x + (viewportWidth * clampPlaybackOffset(options.offsetX)) / 100,
      ),
    ),
    top: Math.max(
      8,
      Math.min(
        viewportHeight - height - 8,
        y + (viewportHeight * clampPlaybackOffset(options.offsetY)) / 100,
      ),
    ),
  };
}
