import { useEffect, useRef, useState } from 'react';

import { usePitchTimeline } from '@/features/playback/hooks/use-pitch-timeline';
import { clampPitchGraphScale } from '@/features/playback/lib/display-scale';
import { pitchGraphPlacement, pitchGraphSize } from '@/features/playback/lib/pitch-graph-layout';
import { clampPitchGraphWindow } from '@/features/playback/lib/pitch/constants';
import type { ReferencePitchPoint } from '@/features/playback/lib/pitch/reference-timeline';
import {
  freqToSemitone,
  snapToRefOctave,
  type PitchSeries,
} from '@/features/playback/lib/pitch/state';
import { usePlaybackMicState } from '@/features/playback/providers';
import { useI18n } from '@/shared/i18n/use-i18n';
import { playerColorOption } from '@/shared/player-colors';
import type { Rgb } from '@/types/Rgb';

type CanvasLayout = {
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
  plotWidth: number;
  plotHeight: number;
  lineWidth: number;
};

type PlotPoint = { x: number; y: number; color: Rgb; alpha: number };
type TimeWindow = { now: number; seconds: number };

const REF_LINE_COLOR: Rgb = { r: 0.5, g: 0.7, b: 1 };
const USER_BASE_COLOR: Rgb = { r: 0.85, g: 0.85, b: 1 };
const SIMILARITY_GOOD: Rgb = { r: 0.2, g: 0.9, b: 0.3 };
const SIMILARITY_OK: Rgb = { r: 0.95, g: 0.8, b: 0.1 };
const SIMILARITY_BAD: Rgb = { r: 0.9, g: 0.2, b: 0.2 };

function computeLayout(height: number, width: number, userScale: number): CanvasLayout {
  const {
    scale,
    width: graphWidth,
    height: graphHeight,
  } = pitchGraphSize(width, height, userScale);
  const paddingX = Math.min(8 * scale, graphWidth / 8);
  const paddingY = Math.min(6 * scale, graphHeight / 4);
  return {
    width: graphWidth,
    height: graphHeight,
    paddingX,
    paddingY,
    plotWidth: graphWidth - 2 * paddingX,
    plotHeight: graphHeight - 2 * paddingY,
    lineWidth: Math.max(2.25, 2 * scale),
  };
}

function lerpRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

function similarityToColor(similarity: number): Rgb {
  if (similarity >= 0.7) {
    return lerpRgb(SIMILARITY_OK, SIMILARITY_GOOD, (similarity - 0.7) / 0.3);
  }
  return lerpRgb(SIMILARITY_BAD, SIMILARITY_OK, Math.max(0, similarity / 0.7));
}

function rgbaString(color: Rgb, alpha: number): string {
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
}

function semitoneToY(semitone: number, layout: CanvasLayout): number {
  const fraction = Math.min(1, Math.max(0, (semitone - 45) / 36));
  return layout.paddingY + (1 - fraction) * layout.plotHeight;
}

function timeToX(time: number, window: TimeWindow, layout: CanvasLayout): number {
  return layout.paddingX + ((time - window.now) / window.seconds + 0.5) * layout.plotWidth;
}

function isVisibleTime(time: number, window: TimeWindow): boolean {
  return time >= window.now - window.seconds / 2 && time <= window.now + window.seconds / 2;
}

function strokeSegment(ctx: CanvasRenderingContext2D, points: PlotPoint[], width: number): void {
  if (points.length < 2) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  const last = points[points.length - 1];
  const gradient = ctx.createLinearGradient(points[0].x, 0, last.x, 0);
  for (let index = 0; index < points.length; index++) {
    gradient.addColorStop(
      index / (points.length - 1),
      rgbaString(points[index].color, points[index].alpha),
    );
  }
  ctx.strokeStyle = gradient;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

type ReferenceDrawInput = {
  ctx: CanvasRenderingContext2D;
  layout: CanvasLayout;
  window: TimeWindow;
  reference: ReferencePitchPoint[];
};

function drawReference({ ctx, layout, window, reference }: ReferenceDrawInput): void {
  let points: PlotPoint[] = [];
  for (const point of reference) {
    if (point.hz === null || !isVisibleTime(point.time, window)) {
      strokeSegment(ctx, points, layout.lineWidth);
      points = [];
      continue;
    }
    points.push({
      x: timeToX(point.time, window, layout),
      y: semitoneToY(freqToSemitone(point.hz), layout),
      color: REF_LINE_COLOR,
      alpha: point.time >= window.now ? 0.85 : 0.45,
    });
  }
  strokeSegment(ctx, points, layout.lineWidth);
}

type UserDrawInput = {
  ctx: CanvasRenderingContext2D;
  layout: CanvasLayout;
  window: TimeWindow;
  series: PitchSeries;
  color: Rgb;
};

function userPoint(input: UserDrawInput, index: number, hz: number): PlotPoint {
  const { series, color, window, layout } = input;
  const refHz = series.refPitches[index];
  const similarity = series.similarities[index];
  const semitone = freqToSemitone(hz);
  const display = refHz === null ? semitone : snapToRefOctave(freqToSemitone(refHz), semitone);
  const age = Math.max(0, 1 - (window.now - series.times[index]) / (window.seconds / 2));
  return {
    x: timeToX(series.times[index], window, layout),
    y: semitoneToY(display, layout),
    color: refHz === null ? color : lerpRgb(color, similarityToColor(similarity), similarity),
    alpha: 0.25 + 0.75 * age,
  };
}

function drawUser(input: UserDrawInput): void {
  const { ctx, layout, window, series } = input;
  let points: PlotPoint[] = [];
  for (let index = 0; index < series.times.length; index++) {
    const time = series.times[index];
    const hz = series.userPitches[index];
    if (hz === null || time > window.now || !isVisibleTime(time, window)) {
      strokeSegment(ctx, points, layout.lineWidth);
      points = [];
      continue;
    }
    points.push(userPoint(input, index, hz));
  }
  strokeSegment(ctx, points, layout.lineWidth);
}

function drawCurrentTime(ctx: CanvasRenderingContext2D, layout: CanvasLayout, label: string): void {
  const x = layout.paddingX + layout.plotWidth / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, layout.height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '10px sans-serif';
  ctx.fillText(label, x + 4, 11);
}

function setupCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layout: CanvasLayout,
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(layout.width * dpr);
  canvas.height = Math.floor(layout.height * dpr);
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
  }));
  useEffect(() => {
    const update = () => setSize({ height: window.innerHeight, width: window.innerWidth });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

type PitchGraphProps = {
  series: PitchSeries;
  position?: 'top' | 'bottom';
  horizontalPosition?: string | null;
  verticalPosition?: string | null;
  scale?: number | null;
  offsetX?: number | null;
  offsetY?: number | null;
  windowSeconds?: number | null;
};

export function PitchGraph({
  series,
  position = 'top',
  horizontalPosition,
  verticalPosition,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  windowSeconds,
}: PitchGraphProps) {
  const { t } = useI18n();
  const { multiplayer, players } = usePlaybackMicState();
  const seconds = clampPitchGraphWindow(windowSeconds);
  const { currentTime, reference, isReady } = usePitchTimeline(seconds);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useWindowSize();
  const userScale = clampPitchGraphScale(scale);
  const graphSize = pitchGraphSize(size.width, size.height, userScale);
  const placement = pitchGraphPlacement({
    viewportWidth: size.width,
    viewportHeight: size.height,
    width: graphSize.width + 8,
    height: graphSize.height + 8,
    horizontal: horizontalPosition,
    vertical: verticalPosition,
    fallback: position,
    offsetX,
    offsetY,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!isReady || !canvas || !ctx) {
      return;
    }
    const layout = computeLayout(size.height, size.width, userScale);
    const window: TimeWindow = { now: currentTime, seconds };
    setupCanvas(canvas, ctx, layout);
    drawReference({ ctx, layout, window, reference });
    if (multiplayer) {
      for (const player of players) {
        drawUser({
          ctx,
          layout,
          window,
          series: player.series,
          color: playerColorOption(player.color).rgb,
        });
      }
    } else {
      drawUser({ ctx, layout, window, series, color: USER_BASE_COLOR });
    }
    drawCurrentTime(ctx, layout, t('Now'));
  }, [isReady, currentTime, seconds, reference, series, players, multiplayer, size, userScale, t]);

  if (!isReady) {
    return null;
  }
  return (
    <div
      data-slot="pitch-graph"
      className="pointer-events-none absolute z-20 rounded-sm border-white/15 bg-black/40 p-[4px]"
      style={placement}
    >
      <canvas
        ref={canvasRef}
        className="block"
        aria-label={t(
          'Pitch timeline: {seconds} seconds. The center line is now; upcoming reference pitch is on the right.',
          { seconds },
        )}
      />
    </div>
  );
}
