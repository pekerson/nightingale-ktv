/**
 * Owns visual background selection, Pixabay flavor, and playable song-video path.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import { ensurePlayableSourceVideo } from '@/bridge/playback';
import { ensurePlayableAssociatedMv, getSongMv } from '@/bridge/song-mv';
import {
  createPlaybackThemes,
  initialThemeKey,
  nextFlavorIndex,
  nextThemeKey,
  selectionForTheme,
  themeKey,
  type PlaybackTheme,
} from '@/features/playback/components/theme';
import { usePlaybackConfigPersist } from '@/features/playback/hooks/use-playback-config-persist';
import { FLAVORS, type VideoFlavor } from '@/features/playback/lib/video-flavor';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { AppConfig } from '@/types/AppConfig';
import type { Song } from '@/types/Song';

export type PlaybackThemeState = {
  theme: PlaybackTheme;
  videoFlavor: VideoFlavor;
  sourceVideoPath: string | undefined;
  sourceVideoTempoRatio: number;
};

export type PlaybackThemeActions = {
  cycleTheme: () => void;
  cycleFlavor: () => void;
  reportSourceVideoError: (path: string) => void;
};

const ThemeStateContext = createContext<PlaybackThemeState | null>(null);
const ThemeActionsContext = createContext<PlaybackThemeActions | null>(null);

type PlaybackThemeProviderProps = {
  song: Song;
  config: AppConfig | null;
  children: ReactNode;
};

type PlayableVideo = { fileHash: string; path: string };
type AssociatedVideo = {
  fileHash: string;
  enabled: boolean;
  selected: boolean;
  playablePath: string | null;
};

const isMvDisabled = (fileHash: string, association: AssociatedVideo | null): boolean =>
  association?.fileHash === fileHash && !association.enabled;

function resolveSourceVideoPath(
  song: Song,
  playableVideo: PlayableVideo | null,
  associatedVideo: AssociatedVideo | null,
): string | undefined {
  if (isMvDisabled(song.file_hash, associatedVideo)) {
    return undefined;
  }
  if (
    associatedVideo?.fileHash === song.file_hash &&
    associatedVideo.selected &&
    associatedVideo.playablePath !== null
  ) {
    return associatedVideo.playablePath;
  }
  if (!song.is_video) {
    return undefined;
  }
  return playableVideo?.fileHash === song.file_hash ? playableVideo.path : song.path;
}

function useSourceVideoSelection(song: Song) {
  const { t } = useI18n();
  const fileHash = song.file_hash;
  const [playableVideo, setPlayableVideo] = useState<PlayableVideo | null>(null);
  const [associatedVideo, setAssociatedVideo] = useState<AssociatedVideo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getSongMv(fileHash)
      .then(async (association) => {
        if (controller.signal.aborted) {
          return undefined;
        }
        if (association.enabled && association.effective_path !== null) {
          setAssociatedVideo({ fileHash, enabled: true, selected: true, playablePath: null });
          const path = await ensurePlayableAssociatedMv(fileHash);
          controller.signal.throwIfAborted();
          if (path === null) {
            throw new Error('MV video is unavailable');
          }
          setAssociatedVideo({ fileHash, enabled: true, selected: true, playablePath: path });
        } else {
          setAssociatedVideo({
            fileHash,
            enabled: association.enabled,
            selected: false,
            playablePath: null,
          });
        }
        return undefined;
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setAssociatedVideo({ fileHash, enabled: true, selected: false, playablePath: null });
          toast.error(t('Could not prepare MV: {error}', { error: String(error) }));
        }
      });

    if (song.is_video) {
      void ensurePlayableSourceVideo(fileHash)
        .then((path) => {
          if (!controller.signal.aborted && typeof path === 'string' && path !== '') {
            setPlayableVideo({ fileHash, path });
          }
          return undefined;
        })
        .catch(() => {});
    }

    return () => {
      controller.abort();
    };
  }, [fileHash, song.is_video, t]);

  const hasAssociatedVideo =
    associatedVideo?.fileHash === fileHash &&
    associatedVideo.selected &&
    associatedVideo.playablePath !== null;
  const mvDisabled = isMvDisabled(fileHash, associatedVideo);
  return {
    hasAssociatedVideo,
    mvDisabled,
    sourceVideoPath: resolveSourceVideoPath(song, playableVideo, associatedVideo),
  };
}

function useSourceVideoFailure() {
  const { t } = useI18n();
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const warned = useRef(new Set<string>());
  const reportSourceVideoError = useCallback(
    (path: string) => {
      if (path === '' || warned.current.has(path)) {
        return;
      }
      warned.current.add(path);
      setFailedPath(path);
      toast.error(t('Song video could not be opened. Showing the default background.'));
    },
    [t],
  );
  return { failedPath, reportSourceVideoError };
}

function startingThemeKey(
  themes: readonly PlaybackTheme[],
  song: Song,
  config: AppConfig | null,
): string {
  return initialThemeKey({
    themes,
    hasSourceVideo: song.is_video,
    selection: config?.last_background,
    legacyIndex: config?.last_theme ?? 0,
  });
}

function visibleTheme(
  themes: readonly PlaybackTheme[],
  selectedKey: string,
  sourceVideoFailed: boolean,
): PlaybackTheme {
  const selected = themes.find((candidate) => themeKey(candidate) === selectedKey) ?? themes[0];
  return sourceVideoFailed && selected.kind === 'source'
    ? (themes.find((candidate) => candidate.kind === 'shader') ?? themes[0])
    : selected;
}

export function PlaybackThemeProvider({ song, config, children }: PlaybackThemeProviderProps) {
  const themes = useMemo(
    () => createPlaybackThemes(config?.custom_backgrounds ?? [], song.is_video),
    [config?.custom_backgrounds, song.is_video],
  );
  const [selectedThemeKey, setSelectedThemeKey] = useState<string | null>(null);
  const [flavorIndex, setFlavorIndex] = useState(config?.last_video_flavor ?? 0);
  const persistConfig = usePlaybackConfigPersist(config);
  const { hasAssociatedVideo, mvDisabled, sourceVideoPath } = useSourceVideoSelection(song);
  const { failedPath, reportSourceVideoError } = useSourceVideoFailure();
  const sourceVideoFailed = sourceVideoPath !== undefined && failedPath === sourceVideoPath;
  const hasSourceVideo = !mvDisabled && (song.is_video || hasAssociatedVideo);
  const initialKey = startingThemeKey(themes, song, config);
  const currentThemeKey = selectedThemeKey ?? (hasAssociatedVideo ? 'source' : initialKey);

  const availableThemes = useMemo(
    () => createPlaybackThemes(config?.custom_backgrounds ?? [], hasSourceVideo),
    [config?.custom_backgrounds, hasSourceVideo],
  );
  const theme = visibleTheme(availableThemes, currentThemeKey, sourceVideoFailed);

  const cycleTheme = useCallback(() => {
    setSelectedThemeKey((selected) => {
      const current = selected ?? currentThemeKey;
      const nextKey = nextThemeKey(availableThemes, current);
      const next = availableThemes.find((candidate) => themeKey(candidate) === nextKey);
      const selection = next ? selectionForTheme(next) : null;
      if (selection) {
        persistConfig({ last_background: selection });
      }
      return nextKey;
    });
  }, [persistConfig, availableThemes, currentThemeKey]);

  const cycleFlavor = useCallback(() => {
    setFlavorIndex((current) => {
      const next = nextFlavorIndex(current);
      persistConfig({ last_video_flavor: next });
      return next;
    });
  }, [persistConfig]);

  const stateValue = useMemo<PlaybackThemeState>(
    () => ({
      theme,
      videoFlavor: FLAVORS[flavorIndex % FLAVORS.length],
      sourceVideoPath: sourceVideoFailed ? undefined : sourceVideoPath,
      sourceVideoTempoRatio: song.tempo,
    }),
    [theme, flavorIndex, sourceVideoPath, sourceVideoFailed, song.tempo],
  );

  const actionsValue = useMemo<PlaybackThemeActions>(
    () => ({ cycleTheme, cycleFlavor, reportSourceVideoError }),
    [cycleTheme, cycleFlavor, reportSourceVideoError],
  );

  return (
    <ThemeStateContext.Provider value={stateValue}>
      <ThemeActionsContext.Provider value={actionsValue}>{children}</ThemeActionsContext.Provider>
    </ThemeStateContext.Provider>
  );
}

export function usePlaybackThemeState(): PlaybackThemeState {
  const ctx = useContext(ThemeStateContext);
  if (!ctx) {
    throw new Error('usePlaybackThemeState must be used within a PlaybackThemeProvider');
  }
  return ctx;
}

export function usePlaybackThemeActions(): PlaybackThemeActions {
  const ctx = useContext(ThemeActionsContext);
  if (!ctx) {
    throw new Error('usePlaybackThemeActions must be used within a PlaybackThemeProvider');
  }
  return ctx;
}
