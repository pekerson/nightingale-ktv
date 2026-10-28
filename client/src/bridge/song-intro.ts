import { z } from 'zod';

import type { LibrarySource } from '@/types/LibrarySource';

import { invoke, listen, type UnlistenFn } from './runtime';

const songIntroSchema = z.object({
  start_sec: z.number().finite().nullable(),
  duration_sec: z.number().finite().nonnegative(),
  tempo: z.number().finite().positive(),
});
const changedSchema = z.object({ file_hash: z.string().min(1) });
export type SongIntroStart = z.infer<typeof songIntroSchema>;

function serverIdentity(address: string): string {
  try {
    const url = new URL(address);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return 'invalid-server';
  }
}

export function songIntroSourceKey(source: LibrarySource | null | undefined): string {
  if (!source) {
    return 'none';
  }
  switch (source.kind) {
    case 'folder':
      return JSON.stringify(['folder', source.path.replaceAll('\\', '/')]);
    case 'navidrome':
      return JSON.stringify(['navidrome', serverIdentity(source.base_url), source.username]);
    case 'jellyfin':
      return JSON.stringify(['jellyfin', serverIdentity(source.base_url), source.user_id]);
    case 'plex':
      return JSON.stringify([
        'plex',
        serverIdentity(source.base_url),
        source.machine_id,
        source.username,
      ]);
    default:
      throw new Error('Unsupported library source');
  }
}

export const songIntroQueryKey = (fileHash: string, sourceKey = 'none') => [
  'song-intro-start',
  sourceKey,
  fileHash,
];

export const getSongIntroStart = async (fileHash: string): Promise<SongIntroStart> =>
  songIntroSchema.parse(await invoke<unknown>('get_song_intro_start', { fileHash }));

export const setSongIntroStart = async (
  fileHash: string,
  startSec: number | null,
): Promise<SongIntroStart> =>
  songIntroSchema.parse(await invoke<unknown>('set_song_intro_start', { fileHash, startSec }));

export const onSongIntroStartChanged = (
  callback: (fileHash: string) => void,
): Promise<UnlistenFn> =>
  listen<unknown>('song-intro-start-changed', ({ payload }) =>
    callback(changedSchema.parse(payload).file_hash),
  );
