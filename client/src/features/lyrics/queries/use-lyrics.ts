import { useQuery } from '@tanstack/react-query';

import { loadLyrics, loadSidecarLrc, searchLrclibLyrics } from '@/bridge/lyrics';
import { loadTranscript } from '@/bridge/playback';
import {
  linesFromTranscript,
  storedLyricsText,
  stripLrcToPlainLines,
} from '@/features/lyrics/utils/edit-lyrics';
import { LRCLIB, LYRICS, SIDECAR_LRC } from '@/shared/query-keys';
import type { LrclibCandidate } from '@/types/LrclibCandidate';
import type { SidecarLrc } from '@/types/SidecarLrc';

type InitialLyrics = { text: string; plainText: string };

const fetchInitialLyrics = async (fileHash: string): Promise<InitialLyrics> => {
  const file = await loadLyrics(fileHash);
  if (file && file.lines.length > 0) {
    const storedText = file.lines.join('\n');
    const plainText = stripLrcToPlainLines(storedText).join('\n');
    const text = storedLyricsText(file);
    return { text, plainText };
  }
  try {
    const transcript = await loadTranscript(fileHash);
    const text = linesFromTranscript(transcript);
    return { text, plainText: text };
  } catch {
    return { text: '', plainText: '' };
  }
};

const requireFileHash = (fileHash: string | null): string => {
  if (fileHash === null) {
    throw new Error('Lyrics query requires a file hash');
  }
  return fileHash;
};

export const useInitialLyrics = (fileHash: string | null) =>
  useQuery({
    queryKey: [...LYRICS, fileHash],
    queryFn: () => fetchInitialLyrics(requireFileHash(fileHash)),
    enabled: fileHash !== null,
    staleTime: Infinity,
  });

export const useLrclibCandidates = (fileHash: string | null) =>
  useQuery<LrclibCandidate[]>({
    queryKey: [...LRCLIB, fileHash],
    queryFn: () => searchLrclibLyrics(requireFileHash(fileHash)),
    enabled: fileHash !== null,
    staleTime: Infinity,
  });

export const useSidecarLrc = (fileHash: string | null) =>
  useQuery<SidecarLrc | null>({
    queryKey: [...SIDECAR_LRC, fileHash],
    queryFn: () => loadSidecarLrc(requireFileHash(fileHash)),
    enabled: fileHash !== null,
    staleTime: Infinity,
  });
