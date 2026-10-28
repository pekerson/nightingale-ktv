import type { PlaybackTranscriptState } from '@/features/playback/providers/playback-transcript-context';
import type { Translator } from '@/shared/i18n/translate';

export function introSkipHint(state: PlaybackTranscriptState, time: number, t: Translator): string {
  if (state.introAnalyzing) {
    return t('Checking the saved singing start and song timing…');
  }
  if (state.introBoundarySource === 'none') {
    return t('No reliable intro boundary is available.');
  }
  if (time + 0.15 >= state.introSkipTarget) {
    return t('Already at or past the intro skip point.');
  }
  const values = {
    seconds: state.introSkipTarget.toFixed(1),
    lead: state.introSkipLeadSec.toFixed(1),
  };
  if (state.introBoundarySource === 'manual') {
    return t('Saved singing start: jump to {seconds}s, {lead}s before the first line.', values);
  }
  if (state.introBoundarySource === 'vocals') {
    return t('Vocal-track estimate: jump to {seconds}s, {lead}s before singing.', values);
  }
  return t('First lyric timing: jump to {seconds}s, {lead}s before the line.', values);
}
