import type { DialogMode } from '@/features/menu/hooks/use-dialog';
import type { LineWindow } from '@/types/LineWindow';
import type { LyricsFile } from '@/types/LyricsFile';
import type { Song } from '@/types/Song';
import type { Transcript } from '@/types/Transcript';

export type EditLyricsDialogMode = { mode: 'edit-lyrics'; song: Song };

export function isEditLyricsDialogMode(mode: DialogMode): mode is EditLyricsDialogMode {
  return mode !== null && typeof mode === 'object' && mode.mode === 'edit-lyrics';
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '?';
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds) % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

const pad2 = (value: number): string => value.toString().padStart(2, '0');

/** Format seconds without losing millisecond precision. */
function lrcTag(seconds: number): string {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const minutes = Math.floor(millis / 60000);
  const secs = Math.floor((millis % 60000) / 1000);
  return `[${pad2(minutes)}:${pad2(secs)}.${(millis % 1000).toString().padStart(3, '0')}]`;
}

/**
 * Rebuild line-timed LRC from saved lines and their windows. A window that
 * ends before the next line starts gets an empty end tag, as in the source.
 */
export function lrcFromWindows(lines: readonly string[], windows: readonly LineWindow[]): string {
  return lines
    .flatMap((line, index) => {
      const window = windows.at(index);
      if (!window) {
        return [line];
      }
      const next = windows.at(index + 1);
      const gapAfter = next === undefined || next.start - window.end > 0.005;
      return gapAfter
        ? [`${lrcTag(window.start)}${line}`, lrcTag(window.end)]
        : [`${lrcTag(window.start)}${line}`];
    })
    .join('\n');
}

export function normalizeLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function storedLyricsText(file: LyricsFile): string {
  if (file.timed_lrc !== undefined && file.timed_lrc.trim() !== '') {
    return file.timed_lrc;
  }
  const text = file.lines.join('\n');
  if (detectLrcLevel(text) !== 'none') {
    return text;
  }
  return file.windows ? lrcFromWindows(file.lines, file.windows) : text;
}

export type LrcLevel = 'none' | 'line' | 'word';

const TIME_BODY = String.raw`\d+:\d{1,2}(?:[.:,]\d+)?`;
const TIMESTAMP = new RegExp(String.raw`(?:\[${TIME_BODY}\]|<${TIME_BODY}>)`, 'g');
const METADATA = /\[[a-z]+:[^\]]*\]/gi;
const cleanNewlines = (text: string): string => text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');

export function detectLrcLevel(text: string): LrcLevel {
  let timed = false;
  for (const line of cleanNewlines(text).split('\n')) {
    const content = line.replace(METADATA, '');
    const tags = content.match(TIMESTAMP);
    if (!tags) {
      continue;
    }
    timed = true;
    const chunks = content.split(TIMESTAMP).filter((chunk) => chunk.trim() !== '');
    if (chunks.length > 1) {
      return 'word';
    }
  }
  return timed ? 'line' : 'none';
}

export function stripLrcToPlainLines(text: string): string[] {
  return cleanNewlines(text)
    .split('\n')
    .map((line) => line.replace(METADATA, '').replace(TIMESTAMP, '').trim())
    .filter((line) => line !== '');
}

export function linesFromTranscript(transcript: Transcript): string {
  return transcript.segments
    .map((s) =>
      transcript.source === 'lrc' ? stripLrcToPlainLines(s.text).join('\n') : s.text.trim(),
    )
    .filter((s) => s.length > 0)
    .join('\n');
}
