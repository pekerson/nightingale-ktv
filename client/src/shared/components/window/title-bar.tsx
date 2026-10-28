import { getCurrentWindow } from '@tauri-apps/api/window';
import { MinusIcon, SquareIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { patchConfig } from '@/bridge/config';
import {
  FULLSCREEN_CHANGE_EVENT,
  isFullScreen as tauriIsFullScreen,
  setFullScreen,
} from '@/bridge/fullScreen';
import { isSessionPlayback } from '@/bridge/playback-session';
import { isTauri } from '@/bridge/runtime';
import { minimizeWindow, triggerFrontendReady, windowImmersive } from '@/bridge/window';
import { useConfig } from '@/shared/config/use-config';
import { useI18n } from '@/shared/i18n/use-i18n';
import { isShortcutInputBlocked, matchesShortcut } from '@/shared/shortcuts/shortcuts';

export function TauriAppShell({ children }: { children: React.ReactNode }) {
  const [fullscreen, setFullscreen] = useState(false);
  const { data: config } = useConfig();
  const bindings = config?.shortcut_bindings;

  useEffect(() => {
    if (!isTauri) {
      return undefined;
    }

    const refreshFullscreen = () => {
      void windowImmersive()
        .then(setFullscreen)
        .catch(() => undefined);
    };

    void triggerFrontendReady().catch(() => undefined);
    refreshFullscreen();
    window.addEventListener(FULLSCREEN_CHANGE_EVENT, refreshFullscreen);

    return () => window.removeEventListener(FULLSCREEN_CHANGE_EVENT, refreshFullscreen);
  }, []);

  useEffect(() => {
    const toggleFullscreen = async (): Promise<void> => {
      const current = await tauriIsFullScreen();
      const next = !current;
      await Promise.all([setFullScreen(next), patchConfig({ fullscreen: next })]);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        isShortcutInputBlocked(event) ||
        !matchesShortcut(event, 'fullscreen', bindings)
      ) {
        return;
      }
      event.preventDefault();
      void toggleFullscreen().catch(() => undefined);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings]);

  if (!isTauri) {
    return children;
  }

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <TitleBar fullscreen={fullscreen} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

function TitleBar({ fullscreen }: { fullscreen: boolean }) {
  const { t } = useI18n();
  const sessionPlayback = isSessionPlayback();

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--titlebar-offset',
      fullscreen || sessionPlayback ? '0px' : '2rem',
    );

    return () => {
      document.documentElement.style.removeProperty('--titlebar-offset');
    };
  }, [fullscreen, sessionPlayback]);

  if (fullscreen) {
    return null;
  }

  const win = getCurrentWindow();

  if (sessionPlayback) {
    return (
      <div className="fixed inset-x-2 top-2 z-50 flex h-8 items-center">
        <div
          className="h-full min-w-0 flex-1 cursor-move opacity-0"
          aria-hidden
          title={t('Drag playback window')}
          onMouseDown={() => void win.startDragging()}
        />
        <div className="flex h-full shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background/85 text-muted-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={t('Minimize')}
            onClick={() => void minimizeWindow()}
          >
            <MinusIcon className="size-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background/85 text-muted-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={t('Maximize')}
            onClick={() => void win.toggleMaximize()}
          >
            <SquareIcon className="size-3" strokeWidth={2} />
          </button>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background/85 text-muted-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-destructive/15 hover:text-destructive"
            aria-label={t('Close')}
            onClick={() => void win.close()}
          >
            <XIcon className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <header className="flex h-8 shrink-0 select-none items-stretch border-b border-border bg-background">
      <div
        className="min-h-0 min-w-0 flex-1"
        aria-hidden
        onMouseDown={() => void win.startDragging()}
      />
      <div className="flex items-center gap-0.5 pl-1 pr-1.5">
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t('Minimize')}
          onClick={() => void minimizeWindow()}
        >
          <MinusIcon className="size-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t('Maximize')}
          onClick={() => void win.toggleMaximize()}
        >
          <SquareIcon className="size-3" strokeWidth={2} />
        </button>
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          aria-label={t('Close')}
          onClick={() => void win.close()}
        >
          <XIcon className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
