import {
  PITCH_WINDOW_SAMPLES,
  REFERENCE_PITCH_STEP_SEC,
} from '@/features/playback/lib/pitch/constants';
import {
  createPitchDetector,
  detectPitchFromSamplesRef,
} from '@/features/playback/lib/pitch/detect';
import { sampleVocalsWindow } from '@/features/playback/lib/pitch/state';

export type ReferencePitchPoint = { time: number; hz: number | null };

const CHUNK_BUDGET_MS = 6;
const CHUNK_MAX_FRAMES = 32;

export class ReferencePitchTimeline {
  private readonly samples = new Map<number, number | null>();
  private readonly pending = new Set<number>();
  private readonly listeners = new Set<() => void>();
  private readonly detector = createPitchDetector();
  private readonly scratch = new Float32Array(PITCH_WINDOW_SAMPLES);
  private timer: number | null = null;
  private revision = 0;

  constructor(private readonly buffer: AudioBuffer) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    this.schedule();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        if (this.timer !== null) {
          window.clearTimeout(this.timer);
          this.timer = null;
        }
        this.pending.clear();
      }
    };
  }

  getVersion(): number {
    return this.revision;
  }

  private indices(start: number, end: number): { first: number; last: number } {
    return {
      first: Math.max(0, Math.floor(start / REFERENCE_PITCH_STEP_SEC)),
      last: Math.floor(Math.min(end, this.buffer.duration) / REFERENCE_PITCH_STEP_SEC),
    };
  }

  request(start: number, end: number): void {
    const { first, last } = this.indices(start, end);
    for (const index of this.pending) {
      if (index < first || index > last) {
        this.pending.delete(index);
      }
    }
    for (let index = first; index <= last; index++) {
      if (!this.samples.has(index)) {
        this.pending.add(index);
      }
    }
    this.schedule();
  }

  read(start: number, end: number): ReferencePitchPoint[] {
    const { first, last } = this.indices(start, end);
    const points: ReferencePitchPoint[] = [];
    for (let index = first; index <= last; index++) {
      points.push({ time: index * REFERENCE_PITCH_STEP_SEC, hz: this.samples.get(index) ?? null });
    }
    return points;
  }

  private schedule(): void {
    if (this.timer !== null || this.pending.size === 0 || this.listeners.size === 0) {
      return;
    }
    this.timer = window.setTimeout(() => this.processChunk(), 0);
  }

  private processChunk(): void {
    this.timer = null;
    const started = performance.now();
    let frames = 0;
    for (const index of this.pending) {
      this.pending.delete(index);
      const time = index * REFERENCE_PITCH_STEP_SEC;
      const available = sampleVocalsWindow(this.buffer, time, this.scratch, 0);
      const hz = available
        ? detectPitchFromSamplesRef(this.detector, this.scratch, this.buffer.sampleRate)
        : null;
      this.samples.set(index, hz);
      frames++;
      if (frames >= CHUNK_MAX_FRAMES || performance.now() - started >= CHUNK_BUDGET_MS) {
        break;
      }
    }
    this.revision++;
    for (const listener of this.listeners) {
      listener();
    }
    this.schedule();
  }
}
