import {
  AlignLeftIcon,
  AudioLinesIcon,
  FilmIcon,
  ImageIcon,
  LanguagesIcon,
  MicIcon,
  PencilLineIcon,
  RefreshCwIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';

import type { Translator } from '@/shared/i18n/translate';
import type { Song } from '@/types/Song';

import type { SongStatusInfo } from '../song/song-status';
import type { ActionItemProps } from './action-item';

type AnalysisHandler = (fileHash: string) => void | Promise<void>;

type AnalysisHandlers = {
  enqueueOne: AnalysisHandler;
  cancelAnalysisOne: AnalysisHandler;
  deleteSongCache: AnalysisHandler;
  reanalyzeFull: AnalysisHandler;
  reanalyzeTranscript: AnalysisHandler;
  realign: AnalysisHandler;
  reanalyzeForceTranscribe: AnalysisHandler;
  refreshMetadata: (fileHash: string) => Promise<boolean | undefined>;
};

type BuildActionGroupsParams = {
  t: Translator;
  song: Song;
  status: SongStatusInfo;
  analysisBusy: boolean;
  supportsAnalysisActions: boolean;
  analysis: AnalysisHandlers;
  onEditLyrics: () => void;
  onEditMv: () => void;
  onChangeLanguage: () => void;
  run: (
    message: string,
    action: () => void | boolean | undefined | Promise<void | boolean | undefined>,
    onFalse?: string,
  ) => () => Promise<void>;
};

export function buildActionGroups({
  t,
  song,
  status,
  analysisBusy,
  supportsAnalysisActions,
  analysis,
  onEditLyrics,
  onEditMv,
  onChangeLanguage,
  run,
}: BuildActionGroupsParams): ActionItemProps[][] {
  const groups: ActionItemProps[][] = [];

  const supportsProvideLyrics = song.transcript_source !== 'Usdx';
  const mvAction: ActionItemProps = {
    icon: FilmIcon,
    title: 'Edit MV',
    description: 'Choose this song’s video and whether to show it during playback.',
    onClick: onEditMv,
  };

  if (status.isReady !== true) {
    const notReadyGroup: ActionItemProps[] = [
      analysisBusy
        ? {
            icon: XCircleIcon,
            title: 'Cancel analysis',
            description: 'Stop analysis and remove this song from the queue.',
            destructive: true,
            onClick: run(t('Cancelled analysis for "{title}"', { title: song.title }), () =>
              analysis.cancelAnalysisOne(song.file_hash),
            ),
          }
        : {
            icon: AudioLinesIcon,
            title: 'Analyze song',
            description: 'Prepare lyrics, timing, key, tempo, and stems.',
            onClick: () => analysis.enqueueOne(song.file_hash),
          },
    ];

    if (supportsProvideLyrics) {
      notReadyGroup.push({
        icon: PencilLineIcon,
        title: 'Provide lyrics',
        description: 'Paste timed LRC, or lyrics to align.',
        disabled: analysisBusy,
        onClick: onEditLyrics,
      });
    }
    notReadyGroup.push(mvAction);

    groups.push(notReadyGroup);
  }

  if (supportsAnalysisActions) {
    // LRC-provided songs have no AI-generated stems/timing to rebuild, so the
    // realign/refetch/transcribe actions don't apply. Offer editing the LRC and
    // an explicit opt-in to replace it with full AI analysis instead.
    if (song.transcript_source === 'Lrc') {
      groups.push([
        {
          icon: PencilLineIcon,
          title: 'Edit lyrics (LRC)',
          description: 'Replace or re-time the provided LRC.',
          onClick: onEditLyrics,
        },
        mvAction,
        {
          icon: AudioLinesIcon,
          title: 'Analyze with AI',
          description: 'Replace the LRC with AI stems, lyrics, timing, and key.',
          onClick: run(t('Analyzing "{title}" with AI', { title: song.title }), () =>
            analysis.reanalyzeFull(song.file_hash),
          ),
        },
      ]);
    } else {
      groups.push([
        {
          icon: AlignLeftIcon,
          title: 'Realign',
          description: 'Rebuild timing from the current lyrics.',
          onClick: run(t('Realigning "{title}"', { title: song.title }), () =>
            analysis.realign(song.file_hash),
          ),
        },
        {
          icon: RefreshCwIcon,
          title: 'Refetch lyrics & align',
          description: 'Fetch fresh lyrics, then rebuild timing.',
          onClick: run(t('Refetching lyrics & aligning "{title}"', { title: song.title }), () =>
            analysis.reanalyzeTranscript(song.file_hash),
          ),
        },
        {
          icon: MicIcon,
          title: 'Force transcribe',
          description: 'Ignore online lyrics and transcribe the vocals.',
          onClick: run(t('Force transcribing "{title}"', { title: song.title }), () =>
            analysis.reanalyzeForceTranscribe(song.file_hash),
          ),
        },
        {
          icon: AudioLinesIcon,
          title: 'Full reanalysis',
          description: 'Recreate stems, lyrics, timing, key, and tempo.',
          onClick: run(t('Full reanalysis (w/ stems) for "{title}"', { title: song.title }), () =>
            analysis.reanalyzeFull(song.file_hash),
          ),
        },
      ]);

      groups.push([
        {
          icon: PencilLineIcon,
          title: 'Edit lyrics',
          description: 'Correct the words and rebuild their timing.',
          onClick: onEditLyrics,
        },
        mvAction,
        {
          icon: LanguagesIcon,
          title: 'Change language',
          description: 'Set the language and choose how to reprocess.',
          onClick: onChangeLanguage,
        },
      ]);
    }

    if (!song.usdx) {
      groups.push([
        {
          icon: ImageIcon,
          title: 'Refresh metadata',
          description:
            'Reload title, artist, album, duration, and cover art from the library source.',
          onClick: run(
            t('Refreshed metadata for "{title}"', { title: song.title }),
            () => analysis.refreshMetadata(song.file_hash),
            t('Nothing to refresh for "{title}"', { title: song.title }),
          ),
        },
      ]);
    }

    groups.push([
      {
        icon: Trash2Icon,
        title: 'Delete cache',
        description: 'Remove every generated file for this song.',
        destructive: true,
        onClick: run(t('Cache deleted for "{title}"', { title: song.title }), () =>
          analysis.deleteSongCache(song.file_hash),
        ),
      },
    ]);
  }

  if (status.isReady === true && !supportsAnalysisActions) {
    groups.push([mvAction]);
  }

  return groups;
}
