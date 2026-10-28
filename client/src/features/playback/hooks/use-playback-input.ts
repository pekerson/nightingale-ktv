import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { useNavInput } from '@/features/menu/hooks/use-nav-input';
import { usePlaybackConfigPersist } from '@/features/playback/hooks/use-playback-config-persist';
import {
  usePlaybackMicActions,
  usePlaybackMicState,
  usePlaybackThemeActions,
  usePlaybackTranscriptActions,
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import {
  SHORTCUT_ACTIONS,
  claimPlaybackKeyboard,
  isShortcutInputBlocked,
  matchesShortcut,
  type ShortcutAction,
} from '@/shared/shortcuts/shortcuts';
import type { AppConfig } from '@/types/AppConfig';

type PlaybackKeys = Partial<Record<ShortcutAction, () => void>>;
const REPEATING_ACTIONS = new Set<ShortcutAction>([
  'seek_backward',
  'seek_forward',
  'accompaniment_up',
  'accompaniment_down',
  'guide_up',
  'guide_down',
]);

export function usePlaybackInput(config: AppConfig | null, enabled = true) {
  const state = usePlaybackTransportState();
  const transport = usePlaybackTransportActions();
  const theme = usePlaybackThemeActions();
  const transcript = usePlaybackTranscriptActions();
  const mic = usePlaybackMicActions();
  const { multiplayer } = usePlaybackMicState();
  const persistConfig = usePlaybackConfigPersist(config);
  const accompaniment = useRef(state.instrumentalVolume);
  const guide = useRef(state.guideVolume);
  useLayoutEffect(() => {
    accompaniment.current = state.instrumentalVolume;
    guide.current = state.guideVolume;
  }, [state.instrumentalVolume, state.guideVolume]);
  const active = enabled && state.isReady && !state.isFinished && !state.exitDialogOpen;

  const skipSection = useCallback(() => {
    if (state.paused) {
      return;
    }
    const time = transport.getCurrentTime();
    if (transcript.canSkipIntro(time)) {
      transcript.handleSkipIntro();
    } else if (transcript.canSkipOutro(time)) {
      transcript.handleSkipOutro();
    }
  }, [state.paused, transport, transcript]);

  // Keyboard playback actions are handled below; this subscription retains gamepad navigation.
  useNavInput(
    useCallback(
      (action) => {
        if (!active) {
          return;
        }
        if (action.back) {
          transport.handleOpenExit();
        } else if (action.confirm) {
          skipSection();
        }
      },
      [active, transport, skipSection],
    ),
  );

  const changeAccompaniment = (delta: number) => {
    const volume = Math.max(
      0,
      Math.min(1, Math.round((accompaniment.current + delta) * 1000) / 1000),
    );
    accompaniment.current = volume;
    transport.setInstrumentalVolume(volume);
    persistConfig({ instrumental_volume: volume });
  };
  const changeGuide = (volume: number) => {
    if (!state.guideAvailable) {
      return;
    }
    const next = Math.max(0, Math.min(1, Math.round(volume * 1000) / 1000));
    guide.current = next;
    transport.setGuideVolume(next);
    persistConfig({ guide_volume: next });
  };
  const actions = useLatestRef<PlaybackKeys>({
    pause: state.paused ? transport.handleContinue : transport.handlePause,
    seek_backward: () => transport.seekFromControl(transport.getCurrentTime() - 5),
    seek_forward: () => transport.seekFromControl(transport.getCurrentTime() + 5),
    exit_playback: transport.handleOpenExit,
    accompaniment_up: () => changeAccompaniment(0.1),
    accompaniment_down: () => changeAccompaniment(-0.1),
    guide_toggle: () => changeGuide(guide.current > 0 ? 0 : 1),
    guide_up: () => changeGuide(guide.current + 0.1),
    guide_down: () => changeGuide(guide.current - 0.1),
    theme_cycle: theme.cycleTheme,
    flavor_cycle: theme.cycleFlavor,
    mic_toggle: () => {
      if (!multiplayer) {
        mic.handleToggleMic();
      }
    },
    mic_cycle: () => {
      if (!multiplayer) {
        mic.handleCycleMic();
      }
    },
    monitor_toggle: mic.handleToggleMicMonitor,
    skip_section: skipSection,
  });
  const bindings = config?.shortcut_bindings;

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const release = claimPlaybackKeyboard();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutInputBlocked(event)) {
        return;
      }
      const action = SHORTCUT_ACTIONS.find(
        (key) => actions.current[key] !== undefined && matchesShortcut(event, key, bindings),
      );
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat || REPEATING_ACTIONS.has(action)) {
        actions.current[action]?.();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      release();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [active, actions, bindings]);
}
