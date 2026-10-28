import { PitchDetector } from 'pitchy';

import type { Segment } from '@/types/Transcript';

export type VocalRegion = { start: number; end: number };
export type IntroBoundary = {
  onset: number;
  target: number;
  lead: number;
  source: 'vocals' | 'lyrics' | 'manual' | 'none';
};
const STEP = 0.02;
const MIN_RMS = 0.0015;
const cache = new WeakMap<AudioBuffer, Promise<VocalRegion[]>>();
const CREDIT =
  /^(?:作词|作曲|编曲|填词|词曲|词|曲|演唱|原唱|歌手|制作人|制作|监制|录音|混音|母带|和声|吉他|贝斯|鼓|键盘|发行|出品|版权|词作者|曲作者|lyrics\s+by|composed\s+by|arranged\s+by|produced\s+by|written\s+by|lyricist|composer|arranger|vocal(?:s)?|producer|mix(?:ing)?|master(?:ing)?)\s*[:：/／]/i;

const CREDIT_WITH_SPACE =
  /^(?:作词|作曲|编曲|填词|制作人|监制|混音|母带|录音师|lyrics\s+by|composed\s+by|arranged\s+by|written\s+by|produced\s+by)\s+\S/i;

function isProductionCredit(text: string): boolean {
  return CREDIT.test(text) || CREDIT_WITH_SPACE.test(text);
}

type SongIdentity = { title: string; artist: string };

function normalizedCue(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '');
}

function isTitleCue(
  segment: Segment,
  identity: SongIdentity | undefined,
  regions: readonly VocalRegion[],
): boolean {
  if (identity === undefined || segment.start > 10) {
    return false;
  }
  const title = normalizedCue(identity.title);
  const artist = normalizedCue(identity.artist);
  if (title === '') {
    return false;
  }
  const cues = new Set([title, `${title}${artist}`, `${artist}${title}`]);
  if (artist !== '' && artist !== 'unknownartist' && artist !== '未知艺人') {
    cues.add(artist);
  }
  const metadata = segment.text
    .split('\n')
    .filter((text) => text.trim() !== '')
    .every((text) => isProductionCredit(text.trim()) || cues.has(normalizedCue(text)));
  const sounding = regions.some(
    (region) => region.start <= segment.start + 0.75 && region.end >= segment.start,
  );
  return metadata && !sounding;
}

export function firstSingingLyric(
  segments: readonly Segment[],
  identity?: SongIdentity,
  regions: readonly VocalRegion[] = [],
): number | null {
  const starts = segments
    .filter((segment) => {
      const text = segment.text.trim().replace(/^[【[（(]\s*/, '');
      return (
        text.length > 0 &&
        !isProductionCredit(text) &&
        !isTitleCue(segment, identity, regions) &&
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        segment.start >= 0 &&
        segment.end > segment.start
      );
    })
    .map((segment) => segment.start);
  return starts.length === 0 ? null : Math.min(...starts);
}

/** Yield between bounded batches so long tracks do not block playback controls. */
function scanFrames(count: number, visit: (index: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let index = 0;
    const run = () => {
      try {
        const deadline = performance.now() + 5;
        let batch = 0;
        while (index < count && batch < 64 && performance.now() < deadline) {
          visit(index++);
          batch++;
        }
        if (index < count) {
          window.setTimeout(run, 0);
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    };
    run();
  });
}

function frameEnergy(channels: Float32Array[], start: number, length: number, stride: number) {
  let rms = 0;
  let channel = 0;
  channels.forEach((samples, index) => {
    let sum = 0;
    let count = 0;
    for (let sample = start; sample < Math.min(samples.length, start + length); sample += stride) {
      sum += samples[sample] ** 2;
      count++;
    }
    const energy = Math.sqrt(sum / Math.max(1, count));
    if (energy > rms) {
      rms = energy;
      channel = index;
    }
  });
  return { rms, channel };
}

function energyThreshold(energies: Float32Array): number {
  const histogram = new Uint32Array(256);
  let active = 0;
  for (const energy of energies) {
    if (energy > MIN_RMS) {
      histogram[Math.min(255, Math.floor(energy * 255))]++;
      active++;
    }
  }
  let accumulated = 0;
  for (let bin = 0; bin < histogram.length; bin++) {
    accumulated += histogram[bin];
    if (accumulated >= active * 0.9) {
      return Math.max(MIN_RMS, (bin / 255) * 0.08);
    }
  }
  return MIN_RMS;
}

function reliableRegions(voiced: Uint8Array): VocalRegion[] {
  const regions: VocalRegion[] = [];
  let start = -1;
  let last = -1;
  let count = 0;
  const finish = () => {
    if (count >= 8 && last - start >= 10) {
      regions.push({ start: start * STEP, end: (last + 1) * STEP });
    }
    start = -1;
    last = -1;
    count = 0;
  };
  for (let index = 0; index < voiced.length; index++) {
    if (voiced[index]) {
      if (start < 0) {
        start = index;
      }
      last = index;
      count++;
    } else if (last >= 0 && index - last > 12) {
      finish();
    }
  }
  finish();
  return regions;
}

async function analyzeVocals(buffer: AudioBuffer): Promise<VocalRegion[]> {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );
  const frames = Math.ceil(buffer.duration / STEP);
  const energies = new Float32Array(frames);
  const selected = new Uint8Array(frames);
  const stride = Math.max(1, Math.floor(buffer.sampleRate / 8000));
  const frameLength = Math.max(1, Math.floor(buffer.sampleRate * STEP));
  await scanFrames(frames, (index) => {
    const energy = frameEnergy(
      channels,
      Math.floor(index * buffer.sampleRate * STEP),
      frameLength,
      stride,
    );
    energies[index] = energy.rms;
    selected[index] = energy.channel;
  });
  const threshold = energyThreshold(energies);
  const scratch = new Float32Array(1024);
  const detector = PitchDetector.forFloat32Array(scratch.length);
  const voiced = new Uint8Array(frames);
  await scanFrames(frames, (index) => {
    if (energies[index] < threshold) {
      return;
    }
    const channel = channels[selected[index]];
    for (let sample = 0; sample < scratch.length; sample++) {
      scratch[sample] =
        channel[Math.floor(index * buffer.sampleRate * STEP) + sample * stride] ?? 0;
    }
    const [frequency, clarity] = detector.findPitch(scratch, buffer.sampleRate / stride);
    if (frequency >= 75 && frequency <= 1500 && clarity >= 0.75) {
      voiced[index] = 1;
    }
  });
  return reliableRegions(voiced);
}

export function analyzeIntroVocals(buffer: AudioBuffer): Promise<VocalRegion[]> {
  let result = cache.get(buffer);
  if (!result) {
    result = analyzeVocals(buffer).catch((error: unknown) => {
      cache.delete(buffer);
      throw error;
    });
    cache.set(buffer, result);
  }
  return result;
}

export function chooseIntroBoundary(
  lyricStart: number | null,
  regions: readonly VocalRegion[],
  leadSeconds = 3,
): IntroBoundary {
  const first = regions.at(0);
  const onset = lyricStart ?? first?.start ?? 0;
  let source: IntroBoundary['source'] = 'none';
  if (lyricStart !== null) {
    source = 'lyrics';
  } else if (first) {
    source = 'vocals';
  }
  const lead = Math.min(onset, clampIntroSkipLead(leadSeconds));
  return { onset, target: Math.max(0, onset - lead), lead, source };
}

export function clampIntroSkipLead(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 3;
}

export function manualIntroBoundary(
  start: number | null,
  tempo: number,
  duration: number,
  leadSeconds = 3,
): IntroBoundary | null {
  if (
    start === null ||
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(tempo) ||
    tempo <= 0
  ) {
    return null;
  }
  const onset = start / tempo;
  if (!Number.isFinite(duration) || duration <= 0 || onset >= duration) {
    return null;
  }
  const lead = Math.min(onset, clampIntroSkipLead(leadSeconds));
  return { onset, target: Math.max(0, onset - lead), lead, source: 'manual' };
}
