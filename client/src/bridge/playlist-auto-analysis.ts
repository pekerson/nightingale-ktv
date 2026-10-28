import { z } from 'zod';

import { invoke } from './runtime';

const playlistAutoAnalysisSchema = z.object({
  sourceKey: z.string().nullable(),
  globalEnabled: z.boolean(),
  overrides: z.record(z.string(), z.boolean()),
});

export const loadPlaylistAutoAnalysis = async () =>
  playlistAutoAnalysisSchema.parse(await invoke('load_playlist_auto_analysis'));

export const setPlaylistAutoAnalysis = async (params: {
  sourceKey: string;
  playlistId: string;
  enabled: boolean | null;
}) =>
  playlistAutoAnalysisSchema
    .extend({ queuedCount: z.number().int().nonnegative(), syncPending: z.boolean() })
    .parse(await invoke('set_playlist_auto_analysis', params));
