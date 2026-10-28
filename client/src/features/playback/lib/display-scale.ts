export const DEFAULT_PLAYBACK_SCALE = 1;
export const PLAYBACK_SCALE_MIN = 0.5;
export const PLAYBACK_SCALE_MAX = 2.5;
export const PITCH_GRAPH_SCALE_MAX = 5;

export const clampPlaybackScale = (scale: number | null | undefined): number =>
  Math.min(PLAYBACK_SCALE_MAX, Math.max(PLAYBACK_SCALE_MIN, scale ?? DEFAULT_PLAYBACK_SCALE));

export const clampPitchGraphScale = (scale: number | null | undefined): number => {
  const value =
    typeof scale === 'number' && Number.isFinite(scale) ? scale : DEFAULT_PLAYBACK_SCALE;
  return Math.min(PITCH_GRAPH_SCALE_MAX, Math.max(PLAYBACK_SCALE_MIN, value));
};

export const clampPlaybackOffset = (offset: number | null | undefined): number => {
  const value = typeof offset === 'number' && Number.isFinite(offset) ? offset : 0;
  return Math.min(100, Math.max(-100, value));
};

export const clampPlaybackPanelScale = (scale: number | null | undefined): number => {
  const value = typeof scale === 'number' && Number.isFinite(scale) ? scale : 1;
  return Math.min(2, Math.max(0.5, value));
};
