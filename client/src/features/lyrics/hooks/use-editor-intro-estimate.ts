import { useEffect, useState } from 'react';
import { z } from 'zod';

import { loadTranscript, playbackAdapter } from '@/bridge/playback';
import {
  analyzeIntroVocals,
  chooseIntroBoundary,
  firstSingingLyric,
  type VocalRegion,
} from '@/shared/audio/intro-boundary';
import type { Song } from '@/types/Song';
import type { Segment } from '@/types/Transcript';

const timestamp = z.number().finite().nonnegative();
const editorTranscript = z.object({
  tempo: z.number().finite().positive().optional().default(1),
  segments: z.array(
    z.object({
      text: z.string(),
      start: timestamp,
      end: timestamp,
      words: z.array(z.object({ word: z.string(), start: timestamp, end: timestamp })).default([]),
    }),
  ),
});

export function editorAudioTempo(
  duration: number,
  originalDuration: number,
  selectedTempo: number,
): number | null {
  if (
    ![duration, originalDuration, selectedTempo].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return null;
  }
  const matches = (expected: number) =>
    Math.abs(duration - expected) <= Math.max(0.5, expected * 0.01);
  const base = matches(originalDuration);
  if (selectedTempo === 1) {
    return base ? 1 : null;
  }
  const variant = matches(originalDuration / selectedTempo);
  if (base === variant) {
    return null;
  }
  return base ? 1 : selectedTempo;
}

type DetectionResult<T> = { data: T[]; issue: boolean };

function boundedDetection<T>(
  task: Promise<DetectionResult<T>>,
  signal: AbortSignal,
): Promise<DetectionResult<T>> {
  return new Promise((resolve) => {
    let complete = false;
    const onAbort = () => finish({ data: [], issue: false });
    const timer = window.setTimeout(() => finish({ data: [], issue: true }), 15000);
    function finish(value: DetectionResult<T>) {
      if (complete) {
        return;
      }
      complete = true;
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    }
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }
    void task.then(finish, () => finish({ data: [], issue: true }));
  });
}

async function lyricSegments(song: Song): Promise<DetectionResult<Segment>> {
  if (!song.is_analyzed) {
    return { data: [], issue: false };
  }
  try {
    const transcript = editorTranscript.parse(await loadTranscript(song.file_hash));
    const segments = transcript.segments.map((segment) => ({
      text: segment.text,
      start: segment.start * transcript.tempo,
      end: segment.end * transcript.tempo,
      words: segment.words.map((word) => ({
        word: word.word,
        start: word.start * transcript.tempo,
        end: word.end * transcript.tempo,
      })),
    }));
    return { data: segments, issue: false };
  } catch {
    return { data: [], issue: true };
  }
}

async function vocalRegions(
  song: Song,
  duration: number,
  tempo: number,
  signal: AbortSignal,
): Promise<DetectionResult<VocalRegion>> {
  const hasVocals =
    song.is_analyzed && !song.no_stems && (song.usdx === null || song.usdx.vocals !== null);
  if (!hasVocals) {
    return { data: [], issue: false };
  }
  try {
    await playbackAdapter.init();
    signal.throwIfAborted();
    const paths = await playbackAdapter.getAudioPaths(song.file_hash);
    if (paths.vocals === null || paths.vocals === paths.instrumental) {
      return { data: [], issue: false };
    }
    const response = await fetch(paths.vocals, { signal });
    if (!response.ok) {
      return { data: [], issue: true };
    }
    const bytes = await response.arrayBuffer();
    signal.throwIfAborted();
    const context = new OfflineAudioContext(1, 1, 44100);
    const buffer = await context.decodeAudioData(bytes);
    signal.throwIfAborted();
    const actualTempo = editorAudioTempo(buffer.duration, duration, tempo);
    if (actualTempo === null) {
      return { data: [], issue: true };
    }
    const regions = await analyzeIntroVocals(buffer);
    return {
      data: regions.map((region) => ({
        start: region.start * actualTempo,
        end: region.end * actualTempo,
      })),
      issue: false,
    };
  } catch {
    return { data: [], issue: !signal.aborted };
  }
}

type Estimate = { onset: number | null; source: 'vocals' | 'lyrics' | 'none'; issue: boolean };
type Options = { sourceKey: string; enabled: boolean; duration: number; tempo: number };

export function useEditorIntroEstimate(song: Song, options: Options) {
  const { sourceKey, enabled, duration, tempo } = options;
  const scope = `${sourceKey}:${song.file_hash}:${tempo}:${duration}:${song.no_stems}:${song.is_analyzed}`;
  const [result, setResult] = useState<{ scope: string; value: Estimate } | null>(null);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const controller = new AbortController();
    void Promise.all([
      boundedDetection(lyricSegments(song), controller.signal),
      boundedDetection(vocalRegions(song, duration, tempo, controller.signal), controller.signal),
    ])
      .then(([lyrics, vocals]) => {
        const segments = lyrics.data;
        const regions = vocals.data;
        if (controller.signal.aborted) {
          return undefined;
        }
        const lyric = firstSingingLyric(
          segments,
          { title: song.title, artist: song.artist },
          regions,
        );
        const boundary = chooseIntroBoundary(lyric, regions);
        const known =
          boundary.source !== 'none' &&
          Number.isFinite(boundary.onset) &&
          boundary.onset >= 0 &&
          boundary.onset < duration;
        const source = boundary.source === 'vocals' ? 'vocals' : 'lyrics';
        setResult({
          scope,
          value: {
            onset: known ? boundary.onset : null,
            source: known ? source : 'none',
            issue: lyrics.issue || vocals.issue,
          },
        });
        return undefined;
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ scope, value: { onset: null, source: 'none', issue: true } });
        }
        return undefined;
      })
      .finally(() => controller.abort());
    return () => controller.abort();
  }, [enabled, scope, song, duration, tempo]);
  const current = result?.scope === scope ? result.value : null;
  return {
    onset: current?.onset ?? null,
    source: current?.source ?? 'none',
    issue: current?.issue ?? false,
    pending: enabled && current === null,
  };
}
