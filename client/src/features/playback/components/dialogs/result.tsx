import { TrophyIcon } from 'lucide-react';
import { useState } from 'react';

import type { PlaybackPlayer } from '@/bridge/playback-session';
import { useDialogNav } from '@/features/menu/hooks/use-dialog-nav';
import { MultiplayerSetupDialog } from '@/features/playback/components/dialogs/multiplayer-setup';
import type { PlaybackPlayerResult } from '@/features/playback/hooks/use-playback-result';
import { usePlaybackTransportState } from '@/features/playback/providers';
import { topScoresForSong } from '@/features/playback/utils/result';
import { Stars } from '@/shared/components/shared/stars';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Spinner } from '@/shared/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { useI18n } from '@/shared/i18n/use-i18n';
import { defaultPlayerColor, playerColorOption } from '@/shared/player-colors';
import { cn } from '@/shared/utils/cn';
import type { ScoreRecord } from '@/types/ScoreRecord';
import type { Song } from '@/types/Song';

const TOP_LIMIT = 5;
const RING = 'ring-2 ring-primary';
const NO_FOCUS_RING = 'focus-visible:ring-0 focus-visible:border-transparent';
const EMPTY_RESULT: PlaybackPlayerResult = {
  id: 'solo',
  profile: null,
  color: defaultPlayerColor(0),
  score: 0,
};

type Props = {
  open: boolean;
  practice: boolean;
  results: PlaybackPlayerResult[];
  song: Song;
  scores: ScoreRecord[];
  nextPending: boolean;
  autoAdvanceSeconds: number | null;
  onInteraction: () => void;
  exitLabel: string;
  onBack: () => void;
  onRestart: () => void;
  onNext?: (players?: readonly PlaybackPlayer[]) => void;
};

const resultDialogWidth = (multiplayer: boolean): string =>
  multiplayer ? 'sm:max-w-md' : 'sm:max-w-sm';

const resultActionCount = (hasNext: boolean, nextIndex: number, hasCountdown: boolean): number =>
  (hasNext ? nextIndex + 1 : 2) + (hasCountdown ? 1 : 0);

const playerNumber = (id: string, fallback: number): number => {
  const parsed = Number(id.slice('player-'.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

function MultiplayerResults({
  results,
  practice,
}: {
  results: PlaybackPlayerResult[];
  practice: boolean;
}) {
  const { t } = useI18n();
  return (
    <Table aria-label={t(practice ? 'Multiplayer practice' : 'Multiplayer results')}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {!practice && <TableHead className="w-12">#</TableHead>}
          <TableHead>{t('Player')}</TableHead>
          {!practice && <TableHead className="text-right">{t('Score')}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result, index) => {
          const number = playerNumber(result.id, index + 1);
          return (
            <TableRow key={result.id} className={cn(!practice && index === 0 && 'bg-primary/10')}>
              {!practice && <TableCell className="tabular-nums">{index + 1}</TableCell>}
              <TableCell>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${playerColorOption(result.color).className}`}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium">
                    {result.profile ?? t('Guest {number}', { number })}
                  </span>
                  {!practice && index === 0 ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
                      <TrophyIcon className="size-3" /> {t('Winner')}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              {!practice && (
                <TableCell>
                  <div className="flex items-center justify-end gap-3">
                    <Stars score={result.score} size="sm" />
                    <span className="min-w-8 text-right font-semibold tabular-nums">
                      {result.score}
                    </span>
                  </div>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SoloResults({
  result,
  board,
  practice,
}: {
  result: PlaybackPlayerResult;
  board: ScoreRecord[];
  practice: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {!practice && (
        <div className="flex flex-col items-center gap-1">
          <p
            className="text-4xl font-semibold text-primary tabular-nums"
            aria-label={t('Score {score}', { score: result.score })}
          >
            {result.score}
          </p>
          <Stars score={result.score} size="lg" className="mt-1" />
        </div>
      )}

      {board.length > 0 ? (
        <>
          <div className="h-px w-full bg-border" />
          <p className="text-center text-[11px] font-medium tracking-wide text-muted-foreground">
            {t('BEST SCORES')}
          </p>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-xs">#</TableHead>
                <TableHead className="h-8 text-xs">{t('Profile')}</TableHead>
                <TableHead className="h-8 text-right text-xs">{t('Score')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {board.map(({ profile, score }, index) => {
                const isCurrent = !practice && profile === result.profile && score === result.score;
                return (
                  <TableRow key={profile} className={cn(isCurrent && 'bg-primary/10')}>
                    <TableCell className="py-2 text-xs tabular-nums">{index + 1}</TableCell>
                    <TableCell
                      className={cn('py-2 text-xs', isCurrent && 'font-medium text-primary')}
                    >
                      {profile}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'py-2 text-right text-xs tabular-nums',
                        isCurrent && 'font-medium text-primary',
                      )}
                    >
                      {score}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      ) : null}
    </>
  );
}

type ResultActionsProps = Pick<
  Props,
  | 'open'
  | 'nextPending'
  | 'exitLabel'
  | 'onBack'
  | 'onRestart'
  | 'onNext'
  | 'autoAdvanceSeconds'
  | 'onInteraction'
> & {
  multiplayer: boolean;
};

type ActionButtonProps = {
  open: boolean;
  focusedIndex: number;
  nextPending: boolean;
};

function ChangePlayersButton({
  show,
  onClick,
  ...props
}: ActionButtonProps & { show: boolean; onClick: () => void }) {
  const { t } = useI18n();
  if (!show) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        'w-full sm:w-auto',
        NO_FOCUS_RING,
        props.open && props.focusedIndex === 2 && RING,
      )}
      disabled={props.nextPending}
      onClick={onClick}
    >
      {t('Change players')}
    </Button>
  );
}

function NextSongButton({
  nextIndex,
  onNext,
  ...props
}: ActionButtonProps & { nextIndex: number; onNext: Props['onNext'] }) {
  const { t } = useI18n();
  if (!onNext) {
    return null;
  }
  return (
    <Button
      type="button"
      className={cn(
        'w-full sm:w-auto',
        NO_FOCUS_RING,
        props.open && props.focusedIndex === nextIndex && RING,
      )}
      disabled={props.nextPending}
      aria-busy={props.nextPending}
      onClick={() => onNext()}
    >
      {props.nextPending ? (
        <>
          <Spinner className="size-4" /> {t('Preparing…')}
        </>
      ) : (
        t('Next Song')
      )}
    </Button>
  );
}

function NextSongSetup({
  show,
  open,
  onOpenChange,
  onStart,
}: {
  show: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: NonNullable<Props['onNext']>;
}) {
  const { t } = useI18n();
  if (!show) {
    return null;
  }
  return (
    <MultiplayerSetupDialog
      open={open}
      onOpenChange={onOpenChange}
      onStart={onStart}
      queuePlayback
      submitLabel={t('Start next song')}
    />
  );
}

function useResultActions({
  open,
  multiplayer,
  nextPending,
  onBack,
  onRestart,
  onNext,
  autoAdvanceSeconds,
  onInteraction,
}: ResultActionsProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const canChangePlayers = multiplayer && onNext !== undefined;
  const nextIndex = canChangePlayers ? 3 : 2;
  const startNext = onNext ?? (() => {});
  const hasCountdown = autoAdvanceSeconds !== null;
  const stopIndex = onNext ? nextIndex + 1 : 2;
  const actionCallbacks = [
    onBack,
    onRestart,
    canChangePlayers ? () => setSetupOpen(true) : undefined,
    onNext,
    hasCountdown ? onInteraction : undefined,
  ].filter((action): action is () => void => action !== undefined);
  const { focusedIndex } = useDialogNav({
    open: resultNavigationOpen(open, setupOpen, nextPending),
    itemCount: resultActionCount(onNext !== undefined, nextIndex, hasCountdown),
    onAction: () => {
      onInteraction();
      return false;
    },
    onConfirm: (index) => actionCallbacks[index]?.(),
    onBack,
  });

  return {
    setupOpen,
    setSetupOpen,
    canChangePlayers,
    nextIndex,
    startNext,
    hasCountdown,
    stopIndex,
    focusedIndex,
  };
}

function resultNavigationOpen(open: boolean, setupOpen: boolean, nextPending: boolean): boolean {
  return open && !setupOpen && !nextPending;
}

function resultButtonClass(open: boolean, focusedIndex: number, index: number): string {
  return cn('w-full sm:w-auto', NO_FOCUS_RING, open && focusedIndex === index && RING);
}

function ResultActions(props: ResultActionsProps) {
  const { t } = useI18n();
  const { isChangingKey } = usePlaybackTransportState();
  const { open, nextPending, exitLabel, onBack, onRestart, onNext, onInteraction } = props;
  const {
    setupOpen,
    setSetupOpen,
    canChangePlayers,
    nextIndex,
    startNext,
    hasCountdown,
    stopIndex,
    focusedIndex,
  } = useResultActions(props);
  return (
    <>
      <DialogFooter className="mt-2 flex-col sm:flex-row sm:flex-wrap sm:justify-center">
        <Button
          type="button"
          variant="outline"
          className={resultButtonClass(open, focusedIndex, 0)}
          disabled={nextPending}
          onClick={onBack}
        >
          {exitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={resultButtonClass(open, focusedIndex, 1)}
          disabled={nextPending || isChangingKey}
          onClick={onRestart}
        >
          {t('Sing again')}
        </Button>
        <ChangePlayersButton
          show={canChangePlayers}
          open={open}
          focusedIndex={focusedIndex}
          nextPending={nextPending}
          onClick={() => setSetupOpen(true)}
        />
        <NextSongButton
          open={open}
          focusedIndex={focusedIndex}
          nextPending={nextPending || isChangingKey}
          nextIndex={nextIndex}
          onNext={onNext}
        />
        {hasCountdown && (
          <Button
            type="button"
            variant="outline"
            className={resultButtonClass(open, focusedIndex, stopIndex)}
            onClick={onInteraction}
          >
            {t('Stay on results')}
          </Button>
        )}
      </DialogFooter>

      <NextSongSetup
        show={canChangePlayers}
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onStart={startNext}
      />
    </>
  );
}

export const ResultDialog = ({
  open,
  practice,
  results,
  song,
  scores,
  nextPending,
  exitLabel,
  onBack,
  onRestart,
  onNext,
  autoAdvanceSeconds,
  onInteraction,
}: Props) => {
  const { t } = useI18n();
  const multiplayer = results.length > 1;
  const soloResult = results.at(0) ?? EMPTY_RESULT;
  const board = topScoresForSong(scores, song.file_hash, TOP_LIMIT);

  return (
    <Dialog open={open} modal>
      <DialogContent
        showCloseButton={false}
        onPointerDownCapture={onInteraction}
        onWheelCapture={onInteraction}
        className={cn('overflow-visible p-0', resultDialogWidth(multiplayer))}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-4 p-7">
          <DialogHeader className="gap-1 text-center sm:text-center">
            <DialogTitle className="text-xl font-semibold">{song.title}</DialogTitle>
            <DialogDescription className="text-sm">
              {song.artist === 'Unknown Artist' ? t('Unknown Artist') : song.artist}
            </DialogDescription>
            {practice && (
              <p className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                {t('Practice complete · Scores not saved')}
              </p>
            )}
          </DialogHeader>

          {multiplayer ? (
            <MultiplayerResults results={results} practice={practice} />
          ) : (
            <SoloResults result={soloResult} board={board} practice={practice} />
          )}

          {autoAdvanceSeconds !== null && (
            <output className="text-center text-sm text-muted-foreground" aria-live="polite">
              {t('Next song in {seconds}s', { seconds: autoAdvanceSeconds })}
            </output>
          )}
          <ResultActions
            autoAdvanceSeconds={autoAdvanceSeconds}
            onInteraction={onInteraction}
            open={open}
            multiplayer={multiplayer}
            nextPending={nextPending}
            exitLabel={exitLabel}
            onBack={onBack}
            onRestart={onRestart}
            onNext={onNext}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
