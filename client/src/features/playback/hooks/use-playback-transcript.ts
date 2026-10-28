/**
 * Loads the transcript for the current track and normalizes segments for display.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { loadTranscript } from '@/bridge/playback';
import { splitLongSegments } from '@/features/playback/utils/transcript-segments';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { Segment, Transcript } from '@/types/Transcript';

export function usePlaybackTranscript(fileHash: string) {
  const { t } = useI18n();
  const tRef = useLatestRef(t);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [transcriptSource, setTranscriptSource] = useState('generated');

  useEffect(() => {
    let cancelled = false;
    void loadTranscript(fileHash)
      .then((transcript: Transcript) => {
        if (cancelled) {
          return undefined;
        }
        setSegments(splitLongSegments(transcript.segments, undefined, transcript.source === 'lrc'));
        setTranscriptSource(transcript.source ?? 'generated');
        if (
          transcript.source === 'lrc' &&
          transcript.lrc_parser_version === undefined &&
          transcript.segments.some((segment) => /[[<]\d+:\d+(?:[.:]\d+)?[\]>]/.test(segment.text))
        ) {
          toast.info(
            tRef.current(
              'This song has an older LRC cache. Import the original LRC again to restore word timing and line endings; AI analysis is not required.',
            ),
          );
        }
        return undefined;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSegments([]);
          toast.error(
            tRef.current('Could not load lyrics: {error}', {
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileHash, tRef]);

  return { segments, transcriptSource };
}
