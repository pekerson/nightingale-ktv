import { useEffect, useState, type CSSProperties } from 'react';

import { pitchGraphPlacement, pitchGraphSize } from '@/features/playback/lib/pitch-graph-layout';
import { useI18n } from '@/shared/i18n/use-i18n';

type PlaybackPreviewProps = {
  showLyrics: boolean;
  showPitchGraph: boolean;
  lyricsVerticalPosition: string;
  lyricsHorizontalPosition: string;
  lyricsScale: number;
  pitchGraphScale: number;
  pitchGraphHorizontalPosition?: string | null;
  pitchGraphVerticalPosition?: string | null;
  progressScale?: number;
  statusScale?: number;
  controlsScale?: number;
  lyricsOffsetX: number;
  lyricsOffsetY: number;
  pitchGraphOffsetX: number;
  pitchGraphOffsetY: number;
  pitchWindowSeconds: number;
};

const gridBackground: CSSProperties = {
  containerType: 'size',
  backgroundColor: '#070b14',
  backgroundImage:
    'radial-gradient(circle at 50% 35%, rgb(37 99 235 / 0.2), transparent 45%), linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px)',
  backgroundSize: 'auto, 5% 8.89%, 5% 8.89%',
};

function horizontalClass(position: string): string {
  if (position === 'left') {
    return 'items-start text-left';
  }
  if (position === 'right') {
    return 'items-end text-right';
  }
  return 'items-center text-center';
}

function verticalClass(position: string): string {
  if (position === 'top') {
    return 'top-[5.5%] justify-start';
  }
  if (position === 'center') {
    return 'inset-y-0 justify-center';
  }
  return 'bottom-[5.5%] justify-end';
}

function previewPitchPath(seconds: number, historyOnly: boolean): string {
  const limit = historyOnly ? 200 : 400;
  return Array.from({ length: limit / 5 + 1 }, (_, index) => {
    const x = index * 5;
    const y = 22 + Math.sin((x / 400) * seconds * 1.5) * 10 + (historyOnly ? 3 : 0);
    return `${index === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)}`;
  }).join(' ');
}

export function PlaybackPreview({
  showLyrics,
  showPitchGraph,
  lyricsVerticalPosition,
  lyricsHorizontalPosition,
  lyricsScale,
  pitchGraphScale,
  pitchGraphHorizontalPosition,
  pitchGraphVerticalPosition,
  progressScale = 1,
  statusScale = 1,
  controlsScale = 1,
  lyricsOffsetX,
  lyricsOffsetY,
  pitchGraphOffsetX,
  pitchGraphOffsetY,
  pitchWindowSeconds,
}: PlaybackPreviewProps) {
  const { t } = useI18n();
  const hudPosition = lyricsVerticalPosition === 'top' ? 'bottom' : 'top';
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const graph = pitchGraphSize(viewport.width, viewport.height, pitchGraphScale);
  const graphPlacement = pitchGraphPlacement({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    width: graph.width + 8,
    height: graph.height + 8,
    horizontal: pitchGraphHorizontalPosition,
    vertical: pitchGraphVerticalPosition,
    fallback: hudPosition,
    offsetX: pitchGraphOffsetX,
    offsetY: pitchGraphOffsetY,
  });

  return (
    <figure
      aria-label={t('Playback preview')}
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 shadow-xl shadow-black/20"
      style={{ ...gridBackground, aspectRatio: `${viewport.width} / ${viewport.height}` }}
    >
      <div
        className={`absolute inset-x-[1.5%] z-20 flex justify-between text-white ${
          hudPosition === 'bottom' ? 'bottom-[1.5%] items-end' : 'top-[1.5%] items-start'
        }`}
      >
        <div
          className={hudPosition === 'bottom' ? 'flex flex-col-reverse' : undefined}
          style={{ zoom: progressScale }}
        >
          <p className="leading-tight font-medium" style={{ fontSize: '2cqh' }}>
            Nightingale
          </p>
          <p className="text-white/65" style={{ fontSize: '1.45cqh' }}>
            {t('Playback Preview')}
          </p>
          <p className="text-white/65" style={{ fontSize: '1.45cqh' }}>
            1:24 / 3:42
          </p>
        </div>
        <div
          className={`flex items-end ${hudPosition === 'bottom' ? 'flex-col-reverse' : 'flex-col'}`}
        >
          <p className="text-white/80" style={{ fontSize: `${1.65 * statusScale}cqh` }}>
            {t('Score: 8420')}
          </p>
          <p className="text-white/40" style={{ fontSize: `${1.1 * statusScale}cqh` }}>
            {t('Mic:')} {t('Default')}
          </p>
          <p className="text-white/40" style={{ fontSize: `${1.1 * statusScale}cqh` }}>
            {t('Theme: {name}', { name: t('Grid') })}
          </p>
          <span
            className="rounded border border-white/50 px-[0.5cqh] py-[0.2cqh]"
            style={{ fontSize: `${1.1 * controlsScale}cqh` }}
          >
            {t('Exit Playback')}
          </span>
        </div>
      </div>

      {showPitchGraph && (
        <div
          className="absolute z-20 rounded-[0.2cqh] border-white/15 bg-black/45"
          style={{
            left: `${(graphPlacement.left / viewport.width) * 100}%`,
            top: `${(graphPlacement.top / viewport.height) * 100}%`,
            width: `${((graph.width + 8) / viewport.width) * 100}%`,
            height: `${((graph.height + 8) / viewport.height) * 100}%`,
            padding: `${(4 / viewport.width) * 100}cqw`,
          }}
        >
          <svg
            viewBox="0 0 400 44"
            className="block h-full w-full"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={previewPitchPath(pitchWindowSeconds, false)}
              fill="none"
              stroke="rgb(128 179 255 / 0.65)"
              strokeWidth="3"
            />
            <path
              d={previewPitchPath(pitchWindowSeconds, true)}
              fill="none"
              stroke="rgb(80 230 110 / 0.9)"
              strokeWidth="4"
            />
            <line x1="200" x2="200" y1="0" y2="44" stroke="white" strokeWidth="2" />
          </svg>
        </div>
      )}

      {showLyrics && (
        <div
          className={`pointer-events-none absolute inset-x-[3%] z-10 flex flex-col gap-[0.8cqh] ${verticalClass(lyricsVerticalPosition)} ${horizontalClass(lyricsHorizontalPosition)}`}
          style={{ translate: `${lyricsOffsetX}cqw ${lyricsOffsetY}cqh` }}
        >
          <div
            className="max-w-[78%] rounded-[0.7cqh] bg-black/45 px-[1.1cqh] py-[0.7cqh] leading-tight font-bold text-white shadow-lg"
            style={{ fontSize: `${3.7037 * lyricsScale}cqh` }}
          >
            {t('Sing like nobody is listening')}
          </div>
          <div
            className="max-w-[78%] rounded-[0.5cqh] bg-black/30 px-[0.9cqh] py-[0.5cqh] leading-tight text-white/40"
            style={{ fontSize: `${2.2222 * lyricsScale}cqh` }}
          >
            {t('Let the music carry you home')}
          </div>
        </div>
      )}
    </figure>
  );
}
