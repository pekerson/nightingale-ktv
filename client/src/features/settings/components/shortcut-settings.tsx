import { useEffect, useState } from 'react';

import { Button } from '@/shared/components/ui/button';
import { useConfigMutation } from '@/shared/config/use-config-mutation';
import { useI18n } from '@/shared/i18n/use-i18n';
import {
  keyboardBinding,
  SHORTCUT_ACTIONS,
  SHORTCUTS,
  shortcutConflict,
  shortcutLabel,
  type ShortcutAction,
} from '@/shared/shortcuts/shortcuts';
import type { AppConfig } from '@/types/AppConfig';

export function ShortcutSettings({ config }: { config: AppConfig | null }) {
  const { t } = useI18n();
  const { mutate, isPending } = useConfigMutation();
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState('');
  const bindings = config?.shortcut_bindings;

  useEffect(() => {
    if (recording === null) {
      return undefined;
    }
    const record = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) {
        return;
      }
      const key = keyboardBinding(event);
      if (key === null) {
        return;
      }
      const conflict = shortcutConflict(recording, key, bindings);
      if (conflict) {
        setError(
          t('Already assigned to {action}. Choose another key.', {
            action: t(SHORTCUTS[conflict].label),
          }),
        );
        return;
      }
      setRecording(null);
      setError('');
      mutate({ shortcut_bindings: { ...bindings, [recording]: key } });
    };
    window.addEventListener('keydown', record, true);
    return () => window.removeEventListener('keydown', record, true);
  }, [bindings, mutate, recording, t]);

  return (
    <div
      className="space-y-4"
      data-nav-passthrough
      data-shortcut-recording={recording !== null ? 'true' : undefined}
    >
      <p className="text-sm text-muted-foreground">
        {t(
          'Click a key to record a shortcut. Playback and menu keys can be reused in their separate screens. Empty bindings disable shortcuts.',
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {t(
          'Arrow Up / Down changes accompaniment by 10%. Numpad 8 / 2 also works with Num Lock off. Text fields keep normal typing.',
        )}
      </p>
      {error !== '' && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => {
            setRecording(null);
            setError('');
            mutate({ shortcut_bindings: null });
          }}
        >
          {t('Restore all shortcut defaults')}
        </Button>
        {recording !== null && (
          <Button
            variant="outline"
            onClick={() => {
              setRecording(null);
              setError('');
            }}
          >
            {t('Cancel recording')}
          </Button>
        )}
      </div>
      {SHORTCUT_ACTIONS.map((action) => (
        <div
          key={action}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
        >
          <span className="text-sm">{t(SHORTCUTS[action].label)}</span>
          <div className="flex gap-2">
            <Button
              variant={recording === action ? 'default' : 'outline'}
              disabled={isPending}
              aria-label={t('Record shortcut for {action}', { action: t(SHORTCUTS[action].label) })}
              onClick={() => {
                setRecording(action);
                setError('');
              }}
            >
              {recording === action
                ? t('Press a key…')
                : shortcutLabel(action, bindings) || t('Not assigned')}
            </Button>
            <Button
              variant="ghost"
              disabled={isPending}
              aria-label={t('Clear shortcut for {action}', { action: t(SHORTCUTS[action].label) })}
              onClick={() => {
                setRecording(null);
                setError('');
                mutate({ shortcut_bindings: { ...bindings, [action]: '' } });
              }}
            >
              {t('Clear')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
