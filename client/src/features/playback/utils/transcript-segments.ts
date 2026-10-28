/**
 * Transcript post-processing for the playback lyrics UI.
 * Splits segments that exceed a word limit so lines wrap predictably on screen.
 */

import type { Segment } from '@/types/Transcript';

const DEFAULT_CHUNK_WORDS = 8;

/**
 * Splits segments with more than `maxWords` words into multiple segments,
 * preserving word-level timing from the original chunk.
 */
export function splitLongSegments(
  segments: Segment[],
  maxWords: number = DEFAULT_CHUNK_WORDS,
  preserveLines = false,
): Segment[] {
  if (preserveLines) {
    const groups = new Map<number, Segment>();
    for (const segment of segments) {
      const previous = groups.get(segment.start);
      if (previous === undefined) {
        groups.set(segment.start, segment);
      } else {
        const words = segment.words.map((word, index) =>
          index === 0 ? { ...word, word: `\n${word.word}` } : word,
        );
        groups.set(segment.start, {
          ...previous,
          end: Math.max(previous.end, segment.end),
          text: `${previous.text}\n${segment.text}`,
          words: [...previous.words, ...words],
        });
      }
    }
    return [...groups.values()].toSorted((a, b) => a.start - b.start);
  }
  const result: Segment[] = [];
  for (const seg of segments) {
    if (seg.words.length <= maxWords) {
      result.push(seg);
      continue;
    }
    for (let i = 0; i < seg.words.length; i += maxWords) {
      const chunk = seg.words.slice(i, i + maxWords);
      result.push({
        text: chunk.map((w) => w.word).join(' '),
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        words: chunk,
      });
    }
  }
  return result;
}
