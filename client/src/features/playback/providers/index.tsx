/**
 * Composite playback provider tree. Order matters: theme/mic/transcript all
 * read from transport, and mic also needs theme indirectly via the song.
 */

import type { ReactNode } from 'react';

import type { PlaybackPlayer } from '@/bridge/playback-session';
import { clampIntroSkipLead } from '@/shared/audio/intro-boundary';
import type { AppConfig } from '@/types/AppConfig';
import type { Song } from '@/types/Song';

import { PlaybackMicProvider } from './playback-mic-context';
import { PlaybackThemeProvider } from './playback-theme-context';
import { PlaybackTranscriptProvider } from './playback-transcript-context';
import { PlaybackTransportProvider } from './playback-transport-context';

type PlaybackProvidersProps = {
  song: Song;
  config: AppConfig | null;
  players?: readonly PlaybackPlayer[];
  onRestart: () => void;
  onSongPrepared: (song: Song) => void;
  children: ReactNode;
};

function replayGainSettings(config: AppConfig | null) {
  return {
    enabled: config?.replay_gain_enabled === true,
    preampDb: config?.replay_gain_preamp_db ?? 0,
  };
}

export function PlaybackProviders({
  song,
  config,
  players,
  onRestart,
  onSongPrepared,
  children,
}: PlaybackProvidersProps) {
  const replayGain = replayGainSettings(config);
  return (
    <PlaybackTransportProvider
      song={song}
      onSongPrepared={onSongPrepared}
      initialGuideVolume={config?.guide_volume ?? 1}
      initialMasterVolume={config?.master_volume ?? 1}
      initialInstrumentalVolume={config?.instrumental_volume ?? 1}
      replayGainEnabled={replayGain.enabled}
      replayGainPreampDb={replayGain.preampDb}
      scoreAfterSeek={config?.score_after_seek === true}
      onRestart={onRestart}
    >
      <PlaybackThemeProvider song={song} config={config}>
        <PlaybackMicProvider config={config} players={players}>
          <PlaybackTranscriptProvider
            fileHash={song.file_hash}
            songTitle={song.title}
            songArtist={song.artist}
            songTempo={song.tempo}
            introSkipLeadSec={clampIntroSkipLead(config?.intro_skip_lead_sec)}
          >
            {children}
          </PlaybackTranscriptProvider>
        </PlaybackMicProvider>
      </PlaybackThemeProvider>
    </PlaybackTransportProvider>
  );
}

export {
  PlaybackTransportProvider,
  usePlaybackTransportActions,
  usePlaybackTransportState,
  type PlaybackTransportActions,
  type PlaybackTransportState,
} from './playback-transport-context';

export {
  PlaybackThemeProvider,
  usePlaybackThemeActions,
  usePlaybackThemeState,
  type PlaybackThemeActions,
  type PlaybackThemeState,
} from './playback-theme-context';

export {
  PlaybackMicProvider,
  usePlaybackMicActions,
  usePlaybackMicState,
  type PlaybackMicActions,
  type PlaybackMicState,
  type PlaybackPlayerMicState,
} from './playback-mic-context';

export {
  PlaybackTranscriptProvider,
  usePlaybackTranscriptActions,
  usePlaybackTranscriptState,
  type PlaybackTranscriptActions,
  type PlaybackTranscriptState,
} from './playback-transcript-context';
