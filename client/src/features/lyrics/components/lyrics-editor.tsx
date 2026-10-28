import { useState, type KeyboardEvent, type Ref } from 'react';

import { detectLrcLevel, normalizeLines } from '@/features/lyrics/utils/edit-lyrics';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { useI18n } from '@/shared/i18n/use-i18n';
import { cn } from '@/shared/utils/cn';

import { NO_FOCUS_RING_CLASS, RING_CLASS } from './parts';

const TEXTAREA_ROWS = 16;
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/;

const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.blur();
  }
};

type LyricsEditorProps = {
  textareaRef: Ref<HTMLTextAreaElement>;
  toolbarRef: Ref<HTMLDivElement>;
  plainText: string;
  loadedText: string;
  loadedPlainText: string;
  onRestoreLoaded: () => void;
  text: string;
  onChange: (text: string) => void;
  disabled: boolean;
  loadingInitial: boolean;
  lineCount: number;
  isDirty: boolean;
  focused: boolean;
  hasLrc: boolean;
};

export const LyricsEditor = ({
  textareaRef,
  toolbarRef,
  plainText,
  loadedText,
  loadedPlainText,
  onRestoreLoaded,
  text,
  onChange,
  disabled,
  loadingInitial,
  lineCount,
  isDirty,
  focused,
  hasLrc,
}: LyricsEditorProps) => {
  const { t } = useI18n();
  const [view, setView] = useState<'text' | 'timing'>('text');
  const savedTiming = detectLrcLevel(loadedText) !== 'none';
  const restoreTiming = !hasLrc && savedTiming && isDirty;
  const displayedLineCount = view === 'text' ? normalizeLines(plainText).length : lineCount;
  const updateText = (value: string) => {
    if (view === 'text' && savedTiming && value === loadedPlainText) {
      onRestoreLoaded();
    } else {
      onChange(value);
    }
  };

  return (
    <>
      <EditorViewControls
        view={view}
        setView={setView}
        restoreTiming={restoreTiming}
        onRestoreLoaded={onRestoreLoaded}
        toolbarRef={toolbarRef}
      />
      <Textarea
        ref={textareaRef}
        value={view === 'text' ? plainText : text}
        aria-label={t(view === 'text' ? 'Lyrics text' : 'LRC timeline')}
        onChange={(e) => updateText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={TEXTAREA_ROWS}
        placeholder={loadingInitial ? t('Loading lyrics…') : t('Enter lyrics, one line per row')}
        disabled={disabled}
        className={cn(
          'min-h-32 flex-1 shrink-0 overflow-y-auto bg-card font-mono whitespace-pre [field-sizing:fixed]',
          NO_FOCUS_RING_CLASS,
          focused && RING_CLASS,
        )}
        spellCheck={false}
      />
      <LyricsNotes lineCount={displayedLineCount} isDirty={isDirty} hasLrc={hasLrc} text={text} />
    </>
  );
};

type ViewControlsProps = {
  view: 'text' | 'timing';
  setView: (view: 'text' | 'timing') => void;
  restoreTiming: boolean;
  onRestoreLoaded: () => void;
  toolbarRef: Ref<HTMLDivElement>;
};
function EditorViewControls({
  view,
  setView,
  restoreTiming,
  onRestoreLoaded,
  toolbarRef,
}: ViewControlsProps) {
  const { t } = useI18n();
  return (
    <>
      <div ref={toolbarRef} className="shrink-0">
        <fieldset aria-label={t('Lyrics editor view')} className="mb-2 flex gap-2">
          <Button
            type="button"
            variant={view === 'text' ? 'default' : 'outline'}
            aria-pressed={view === 'text'}
            onClick={() => setView('text')}
          >
            {t('Lyrics text')}
          </Button>
          <Button
            type="button"
            variant={view === 'timing' ? 'default' : 'outline'}
            aria-pressed={view === 'timing'}
            onClick={() => {
              if (restoreTiming) {
                onRestoreLoaded();
              }
              setView('timing');
            }}
          >
            {t(restoreTiming ? 'Restore saved timing' : 'LRC timeline')}
          </Button>
        </fieldset>
      </div>
      <p className="mb-2 shrink-0 text-xs text-muted-foreground">
        {t(
          view === 'timing'
            ? 'This view keeps word starts, ends, and pauses. Switching views does not save or realign lyrics.'
            : 'Timestamps are hidden here. Editing the words requires realignment when you save; unchanged lyrics keep their timing.',
        )}
      </p>
      {restoreTiming && (
        <p className="mb-2 text-xs text-muted-foreground">
          {t(
            'Restore saved timing discards unsaved text edits. Saving plain text will run alignment.',
          )}
        </p>
      )}
    </>
  );
}

function LyricsNotes({
  lineCount,
  isDirty,
  hasLrc,
  text,
}: Pick<LyricsEditorProps, 'lineCount' | 'isDirty' | 'hasLrc' | 'text'>) {
  const { t } = useI18n();
  return (
    <>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t(lineCount === 1 ? '{count} line' : '{count} lines', { count: lineCount })}
        {isDirty ? t(' • unsaved changes') : ''}
      </p>
      {!hasLrc && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t('Set timing with')} {'[mm:ss.xx]'} {t('at the start of a line (')} {'[01:23.45]'}{' '}
          {t('= 1 min 23.45 s), and')} {'<mm:ss.xx>'} {t('before a word for word timing')}{' '}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {CJK_PATTERN.test(text) ? (
          <>
            {t('Fix a reading with')} {'{漢字|romaji}'} {t('or')} {'{漢字|かな}'}
            {t(', e.g.')} {'{君|kimi}'} {t('or')} {'{彷徨|さまよ}って'}
          </>
        ) : (
          <>
            {t('Add a note above a word with')} {'{word|note}'}
            {t(', e.g.')} {'{colour|color}'}
          </>
        )}
      </p>
    </>
  );
}
