import { z } from 'zod';

import { invoke } from './runtime';

const songMvSchema = z.object({
  manual_path: z.string().nullable(),
  automatic_path: z.string().nullable(),
  effective_path: z.string().nullable(),
  enabled: z.boolean(),
});

export type SongMv = z.infer<typeof songMvSchema>;

export const getSongMv = async (fileHash: string): Promise<SongMv> =>
  songMvSchema.parse(await invoke<unknown>('get_song_mv', { fileHash }));

export const setSongMv = async (fileHash: string, path: string | null): Promise<SongMv> =>
  songMvSchema.parse(await invoke<unknown>('set_song_mv', { fileHash, path }));

export const setSongMvEnabled = async (fileHash: string, enabled: boolean): Promise<SongMv> =>
  songMvSchema.parse(await invoke<unknown>('set_song_mv_enabled', { fileHash, enabled }));

export const ensurePlayableAssociatedMv = async (fileHash: string): Promise<string | null> => {
  const value = await invoke<unknown>('ensure_playable_associated_mv', { fileHash });
  return z.string().nullable().parse(value);
};
