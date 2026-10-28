import { useEffect } from 'react';

import { useConfig } from '@/shared/config/use-config';
import {
  isShortcutInputBlocked,
  matchesShortcut,
  playbackOwnsKeyboard,
} from '@/shared/shortcuts/shortcuts';

import { blurActiveTextInput } from './dom';
import type { MenuNavHookOptions } from './types';

export function useTabPanelSwitch({ menuFocus, refs, lock }: MenuNavHookOptions) {
  const { activate, actionsRef, setFocus } = menuFocus;
  const { data: config } = useConfig();
  const bindings = config?.shortcut_bindings;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isShortcutInputBlocked(event) ||
        playbackOwnsKeyboard() ||
        !matchesShortcut(event, 'panel_next', bindings) ||
        refs.overlayOpenRef.current
      ) {
        return;
      }

      event.preventDefault();

      activate();
      lock.lockTemporarily();
      blurActiveTextInput();

      setFocus((prev) => {
        let panel = prev.panel;
        if (prev.panel === 'sidebar') {
          panel = 'songList';
        } else if (prev.panel === 'songList' && actionsRef.current.hasSongDetails) {
          panel = 'songDetails';
        } else {
          panel = 'sidebar';
        }

        return {
          ...prev,
          active: true,
          actionsFocused: false,
          panel,
          source: 'nav',
        };
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actionsRef, activate, lock, refs, setFocus, bindings]);
}
