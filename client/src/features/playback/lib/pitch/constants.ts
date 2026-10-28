export const PITCH_WINDOW_SAMPLES = 2048;

export const MIN_PITCH_HZ = 80;
export const MAX_PITCH_HZ = 1000;

export const PITCH_CLARITY_THRESHOLD = 0.4;

export const MIC_PITCH_CLARITY_THRESHOLD = 0.05;

export const REF_RMS_GATE = 0.005;
export const MIC_RMS_GATE = 0.003;

export const PUSH_INTERVAL_SEC = 0.02;
export const SMOOTHING = 0.55;

export const PITCH_BUFFER_SIZE = 200;

export const PITCH_GRAPH_WINDOW_DEFAULT_SEC = (PITCH_BUFFER_SIZE * 33 * 2) / 1000;
export const PITCH_GRAPH_WINDOW_MIN_SEC = 4;
export const PITCH_GRAPH_WINDOW_MAX_SEC = 60;
export const REFERENCE_PITCH_STEP_SEC = 0.05;

export const clampPitchGraphWindow = (seconds: number | null | undefined): number => {
  const value =
    typeof seconds === 'number' && Number.isFinite(seconds)
      ? seconds
      : PITCH_GRAPH_WINDOW_DEFAULT_SEC;
  return Math.min(PITCH_GRAPH_WINDOW_MAX_SEC, Math.max(PITCH_GRAPH_WINDOW_MIN_SEC, value));
};

export const SEMITONE_TOLERANCE = 6;

export const DEFAULT_MIC_LATENCY_COMPENSATION_SEC = 0.08;
export const MIN_MIC_LATENCY_COMPENSATION_SEC = 0;
export const MAX_MIC_LATENCY_COMPENSATION_SEC = 0.5;
