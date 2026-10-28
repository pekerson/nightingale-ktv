import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { loadSongsByHashes } from '@/bridge/songs';
import { calculateKeyShift } from '@/features/library/utils/shift-key';
import { preparePlayback } from '@/features/playback/mutations/use-prepare-playback-mutation';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import { useI18n } from '@/shared/i18n/use-i18n';
import { SONGS } from '@/shared/query-keys';
import type { Song } from '@/types/Song';

const MIN_KEY_OFFSET = -5;
const MAX_KEY_OFFSET = 5;

type LiveKeyOptions = {
  song: Song;
  isReady: boolean;
  onPrepared: (song: Song) => void;
  reloadBuffers: (canCommit: () => boolean) => Promise<boolean>;
  canCommit: () => boolean;
  onReferenceChanged: () => void;
};

function detectedKey(song: Song): string | null {
  const key = song.key?.trim() ?? '';
  return /^[A-G]#?m?$/.test(key) ? key : null;
}

function supportsKeyChange(song: Song): boolean {
  return song.usdx === null && song.transcript_source !== 'Usdx' && detectedKey(song) !== null;
}

function displayedKey(song: Song): string | null {
  const key = detectedKey(song);
  return key === null ? null : calculateKeyShift(key, song.key_offset).key;
}

type ShiftRequest = {
  song: Song;
  tempo: number;
  keyOffset: number;
  signal: AbortSignal;
  isActive: () => boolean;
  canCommit: () => boolean;
  onPrepared: (song: Song) => void;
  reloadBuffers: LiveKeyOptions['reloadBuffers'];
  onApplied: (song: Song) => void;
};

async function prepareAndApply(request: ShiftRequest): Promise<void> {
  const prepared = await preparePlayback({
    song: request.song,
    tempo: request.tempo,
    keyOffset: request.keyOffset,
    signal: request.signal,
  });
  if (!request.isActive()) {
    return;
  }
  request.onPrepared(prepared);
  if (!request.canCommit()) {
    return;
  }
  const applied = await request.reloadBuffers(() => request.isActive() && request.canCommit());
  if (applied && request.isActive()) {
    request.onApplied(prepared);
  }
}

export function useLiveKey(options: LiveKeyOptions) {
  const { song, isReady } = options;
  const { t } = useI18n();
  const tRef = useLatestRef(t);
  const latest = useLatestRef(options);
  const queryClient = useQueryClient();
  const [appliedSong, setAppliedSong] = useState(song);
  const appliedRef = useRef(song);
  const preparedRef = useRef(song);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const [isChangingKey, setChangingKey] = useState(false);
  const needsKey = detectedKey(song) === null && song.usdx === null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (busyRef.current || detectedKey(appliedRef.current) !== null || detectedKey(song) === null) {
      return;
    }
    preparedRef.current = song;
    appliedRef.current = song;
    setAppliedSong(song);
  }, [song]);

  useEffect(() => {
    if (!isReady || !needsKey) {
      return undefined;
    }
    let cancelled = false;
    void loadSongsByHashes([song.file_hash])
      .then((songs) => {
        if (cancelled || !mountedRef.current || busyRef.current) {
          return undefined;
        }
        const found = songs.find((candidate) => candidate.file_hash === song.file_hash);
        if (found === undefined || detectedKey(found) === null) {
          return undefined;
        }
        const known = { ...appliedRef.current, key: found.key };
        preparedRef.current = known;
        appliedRef.current = known;
        setAppliedSong(known);
        latest.current.onPrepared(known);
        return undefined;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            tRef.current('Could not read the song key: {error}', {
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isReady, needsKey, song.file_hash, latest, tRef]);

  const shiftKey = useCallback(
    (direction: -1 | 1) => {
      const active = latest.current;
      const current = appliedRef.current;
      if (
        busyRef.current ||
        !active.isReady ||
        !active.canCommit() ||
        !supportsKeyChange(current)
      ) {
        return;
      }
      const keyOffset = Math.min(
        MAX_KEY_OFFSET,
        Math.max(MIN_KEY_OFFSET, current.key_offset + direction),
      );
      if (keyOffset === current.key_offset) {
        return;
      }
      const controller = new AbortController();
      requestRef.current = controller;
      busyRef.current = true;
      setChangingKey(true);
      const isActive = () => mountedRef.current && !controller.signal.aborted;
      void prepareAndApply({
        song: preparedRef.current,
        tempo: current.tempo,
        keyOffset,
        signal: controller.signal,
        isActive,
        canCommit: () => latest.current.canCommit(),
        reloadBuffers: (canCommit) => latest.current.reloadBuffers(canCommit),
        onPrepared: (prepared) => {
          preparedRef.current = prepared;
          latest.current.onPrepared(prepared);
          void queryClient.invalidateQueries({ queryKey: SONGS });
        },
        onApplied: (prepared) => {
          appliedRef.current = prepared;
          setAppliedSong(prepared);
          latest.current.onReferenceChanged();
        },
      })
        .catch((error: unknown) => {
          if (isActive()) {
            toast.error(
              tRef.current('Could not change key: {error}', {
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        })
        .finally(() => {
          if (requestRef.current === controller) {
            requestRef.current = null;
            busyRef.current = false;
            if (mountedRef.current) {
              setChangingKey(false);
            }
          }
        });
    },
    [latest, queryClient, tRef],
  );

  const isKeyChangePending = useCallback(() => busyRef.current, []);

  return {
    currentKey: displayedKey(appliedSong),
    keyOffset: appliedSong.key_offset,
    isChangingKey,
    isKeyChangePending,
    keyAvailable: isReady && supportsKeyChange(appliedSong),
    shiftKey,
  };
}
