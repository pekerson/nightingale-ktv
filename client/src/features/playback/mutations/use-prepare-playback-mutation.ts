import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { onShiftKeyDone, onShiftTempoDone, shiftKey, shiftTempo } from '@/bridge/analysis';
import { loadSongsByHashes } from '@/bridge/songs';
import { calculateKeyShift } from '@/features/library/utils/shift-key';
import { useI18n } from '@/shared/i18n/use-i18n';
import { SONGS } from '@/shared/query-keys';
import type { ShiftDone } from '@/types/ShiftDone';
import type { Song } from '@/types/Song';

type ShiftListener = (callback: (payload: ShiftDone) => void) => Promise<() => void>;
const ignoreShiftResult = () => {};

async function waitForShift(
  fileHash: string,
  register: ShiftListener,
  invokeShift: () => Promise<void>,
  signal?: AbortSignal,
): Promise<ShiftDone> {
  let resolveDone: (payload: ShiftDone) => void = ignoreShiftResult;
  let rejectDone: (reason: Error) => void = ignoreShiftResult;
  const done = new Promise<ShiftDone>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const unlisten = await register((payload) => {
    if (payload.file_hash === fileHash) {
      resolveDone(payload);
    }
  });
  const abort = () => rejectDone(new DOMException('Playback preparation cancelled', 'AbortError'));
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    if (signal?.aborted === true) {
      throw new DOMException('Playback preparation cancelled', 'AbortError');
    }
    signal?.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => rejectDone(new Error('Playback preparation timed out')), 120000);
    const [, payload] = await Promise.all([invokeShift(), done]);
    if (typeof payload.error === 'string' && payload.error !== '') {
      throw new Error(payload.error);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    unlisten();
  }
}

export type PreparePlaybackInput = {
  song: Song;
  tempo: number;
  keyOffset: number;
  signal?: AbortSignal;
};

export async function preparePlayback({
  song,
  tempo,
  keyOffset,
  signal,
}: PreparePlaybackInput): Promise<Song> {
  const songs = await loadSongsByHashes([song.file_hash]);
  const latest = songs.find((candidate) => candidate.file_hash === song.file_hash);
  if (latest === undefined) {
    throw new Error('Song is no longer available');
  }
  let preparedSong = latest;

  if (
    keyOffset !== preparedSong.key_offset &&
    typeof preparedSong.key === 'string' &&
    preparedSong.key !== ''
  ) {
    const target = calculateKeyShift(preparedSong.key, keyOffset);
    const result = await waitForShift(
      song.file_hash,
      onShiftKeyDone,
      () => shiftKey(song.file_hash, target.key, target.pitchRatio, target.keyOffset),
      signal,
    );
    preparedSong = {
      ...preparedSong,
      override_key: result.key === preparedSong.key ? null : result.key,
      key_offset: keyOffset,
      tempo: result.tempo ?? preparedSong.tempo,
    };
  }

  if (tempo !== preparedSong.tempo) {
    const result = await waitForShift(
      song.file_hash,
      onShiftTempoDone,
      () => shiftTempo(song.file_hash, tempo),
      signal,
    );
    preparedSong = {
      ...preparedSong,
      override_key: result.key === preparedSong.key ? null : result.key,
      tempo: result.tempo ?? tempo,
    };
  }

  return preparedSong;
}

export const usePreparePlaybackMutation = () => {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: preparePlayback,
    onError: (error: Error) => {
      toast.error(t("Couldn't prepare playback: {error}", { error: error.message }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SONGS });
    },
  });
};
