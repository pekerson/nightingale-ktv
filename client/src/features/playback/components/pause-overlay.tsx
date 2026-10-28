import { useRef } from 'react';

import { useDialogNav } from '@/features/menu/hooks/use-dialog-nav';
import {
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/i18n/use-i18n';
import { cn } from '@/shared/utils/cn';

const RING = 'ring-2 ring-primary';
const NO_FOCUS_RING = 'focus-visible:ring-0 focus-visible:border-transparent';

type PauseOverlayProps = {
  open: boolean;
  exitLabel: string;
  onExit: () => void;
  onContinue: () => void;
};

export const PauseOverlay = ({ open, exitLabel, onExit, onContinue }: PauseOverlayProps) => {
  const { t } = useI18n();
  const { handleRestart } = usePlaybackTransportActions();
  const { isChangingKey } = usePlaybackTransportState();
  const exitIndex = isChangingKey ? 1 : 2;
  const containerRef = useRef<HTMLDivElement>(null);
  const { focusedIndex, focusSegment } = useDialogNav({
    open,
    itemCount: exitIndex + 1,
    containerRef,
    onBack: onContinue,
  });

  return (
    <AlertDialog open={open}>
      <AlertDialogContent ref={containerRef} onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Exit playback?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Continue singing, start this song again, or exit without saving this unfinished attempt.',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row">
          <AlertDialogCancel
            onClick={onContinue}
            onFocus={() => focusSegment(0)}
            onMouseEnter={() => focusSegment(0)}
            className={cn(NO_FOCUS_RING, open && focusedIndex === 0 && RING)}
          >
            {t('Continue')}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            disabled={isChangingKey}
            onClick={handleRestart}
            onFocus={() => focusSegment(1)}
            onMouseEnter={() => focusSegment(1)}
            className={cn(NO_FOCUS_RING, open && !isChangingKey && focusedIndex === 1 && RING)}
          >
            {t('Sing again')}
          </Button>
          <AlertDialogAction
            variant="destructive"
            onClick={onExit}
            onFocus={() => focusSegment(exitIndex)}
            onMouseEnter={() => focusSegment(exitIndex)}
            className={cn(NO_FOCUS_RING, open && focusedIndex === exitIndex && RING)}
          >
            {exitLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
