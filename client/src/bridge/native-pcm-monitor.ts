import type { MicSampleFrame } from '@/types/MicSampleFrame';

import { AudioOutputRouter } from './audio-output-router';
import { reportAudioOutputIssue } from './audio-outputs';

/** Bounded PCM scheduling; AudioBuffer sources resample native input to the output clock. */
export class NativePcmMonitor {
  private readonly context = new AudioContext({ latencyHint: 'interactive' });
  private readonly gain = this.context.createGain();
  private readonly router: AudioOutputRouter;
  private nextTime = 0;
  private readonly pending = new Set<AudioBufferSourceNode>();

  constructor(volume: number) {
    this.gain.gain.value = volume;
    this.router = new AudioOutputRouter(this.context, { microphone: this.gain });
    void this.context.resume().catch((error: unknown) => reportAudioOutputIssue('', error));
  }

  setVolume(volume: number): void {
    this.gain.gain.value = volume;
  }

  push(frame: MicSampleFrame): void {
    if (this.context.state !== 'running' || frame.samples.length === 0) {
      return;
    }
    const now = this.context.currentTime;
    if (this.nextTime > now + 0.12) {
      for (const source of this.pending) {
        source.stop();
      }
      this.pending.clear();
      this.nextTime = now;
    }
    const buffer = this.context.createBuffer(1, frame.samples.length, frame.sample_rate);
    buffer.copyToChannel(Float32Array.from(frame.samples), 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.addEventListener(
      'ended',
      () => {
        this.pending.delete(source);
        source.disconnect();
      },
      { once: true },
    );
    this.pending.add(source);
    this.nextTime = Math.max(this.nextTime, now + 0.02);
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
  }

  dispose(): void {
    this.router.dispose();
    for (const source of this.pending) {
      source.stop();
    }
    this.pending.clear();
    void this.context.close().catch(() => {});
  }
}
