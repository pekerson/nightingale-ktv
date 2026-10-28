import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import {
  isSessionPlayback,
  reservePlaybackTarget,
  savePlaybackSession,
  showPlaybackTarget,
  type PlaybackSession,
  type PlaybackTarget,
} from '@/bridge/playback-session';
import { useConfig } from '@/shared/config/use-config';
import { useI18n } from '@/shared/i18n/use-i18n';

export function usePlaybackLauncher() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const sessionMode = isSessionPlayback() || config?.playback_mode === 'session';

  const reserveTarget = (): PlaybackTarget => {
    const target = sessionMode ? reservePlaybackTarget() : null;
    if (target === undefined) {
      toast.error(t('Allow pop-ups to open the playback tab'));
    }
    return target;
  };

  const launch = async (session: PlaybackSession, target: PlaybackTarget): Promise<void> => {
    if (!sessionMode) {
      await navigate('/playback', { replace: session.queuePlayback, state: session });
      return;
    }
    await savePlaybackSession(session);
    await showPlaybackTarget(target);
  };

  return { launch, reserveTarget, sessionMode };
}
