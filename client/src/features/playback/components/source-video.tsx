import { useEffect, useRef, useState } from 'react';

import { playbackAdapter } from '@/bridge/playback';
import { useSourceVideoSync } from '@/features/playback/hooks/use-source-video-sync';
import { VIDEO_CLASS_NAME } from '@/features/playback/lib/video-styles';
import {
  usePlaybackThemeActions,
  usePlaybackThemeState,
} from '@/features/playback/providers/playback-theme-context';
import {
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers/playback-transport-context';
import { cn } from '@/shared/utils/cn';

type SourceVideoProps = {
  isActive: boolean;
};

const playableSource = (path: string | undefined, src: string | null): src is string =>
  typeof path === 'string' && path !== '' && typeof src === 'string' && src !== '';

const videoVisibility = (ready: boolean, active: boolean, finished: boolean) =>
  ready && active && !finished ? 'visible' : 'hidden';

function useMediaUrl(filePath: string, onError: (path: string) => void): string | null {
  const [media, setMedia] = useState<{ filePath: string; src: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void playbackAdapter
      .init()
      .then(() => {
        if (!cancelled) {
          setMedia({ filePath, src: playbackAdapter.toMediaUrl(filePath) });
        }
        return undefined;
      })
      .catch(() => {
        if (!cancelled) {
          onError(filePath);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, onError]);

  return media?.filePath === filePath ? media.src : null;
}

export const SourceVideo = ({ isActive }: SourceVideoProps) => {
  const { sourceVideoPath, sourceVideoTempoRatio } = usePlaybackThemeState();
  const { reportSourceVideoError } = usePlaybackThemeActions();
  const { isReady, isPlaying } = usePlaybackTransportState();
  const { subscribe, getCurrentTime } = usePlaybackTransportActions();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [finishState, setFinishState] = useState<{ src: string | null; finished: boolean } | null>(
    null,
  );
  const src = useMediaUrl(sourceVideoPath ?? '', reportSourceVideoError);
  const videoFinished = finishState?.src === src && finishState.finished;

  const playWhenActive = isReady && isPlaying && isActive;

  const { ready } = useSourceVideoSync({
    videoRef,
    src: playableSource(sourceVideoPath, src) ? src : null,
    isPlaying: playWhenActive,
    tempoRatio: sourceVideoTempoRatio,
    subscribe,
    getCurrentTime,
  });

  useEffect(() => {
    return subscribe((time) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
        return;
      }
      const finished = time * sourceVideoTempoRatio >= video.duration - 0.05;
      setFinishState((current) =>
        current?.src === src && current.finished === finished ? current : { src, finished },
      );
    });
  }, [sourceVideoTempoRatio, src, subscribe]);

  if (!playableSource(sourceVideoPath, src)) {
    return null;
  }

  return (
    <video
      ref={videoRef}
      className={cn(VIDEO_CLASS_NAME, 'object-contain bg-black')}
      style={{ visibility: videoVisibility(ready, isActive, videoFinished) }}
      src={src}
      muted
      playsInline
      onError={() => reportSourceVideoError(sourceVideoPath ?? '')}
      onEnded={() => setFinishState({ src, finished: true })}
    />
  );
};
