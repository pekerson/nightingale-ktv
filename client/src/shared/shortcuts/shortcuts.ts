type Scope = 'playback' | 'menu' | 'global';
type Definition = { label: string; key: string; scope: Scope; aliases?: readonly string[] };

export const SHORTCUTS = {
  pause: { label: 'Pause / resume', key: 'Space', scope: 'playback' },
  seek_backward: { label: 'Back 5 seconds', key: 'ArrowLeft', scope: 'playback' },
  seek_forward: { label: 'Forward 5 seconds', key: 'ArrowRight', scope: 'playback' },
  exit_playback: { label: 'Exit playback', key: 'Escape', scope: 'playback' },
  accompaniment_up: { label: 'Accompaniment +10%', key: 'ArrowUp', scope: 'playback' },
  accompaniment_down: { label: 'Accompaniment -10%', key: 'ArrowDown', scope: 'playback' },
  guide_toggle: { label: 'Toggle dry vocals', key: 'KeyG', scope: 'playback' },
  guide_up: {
    label: 'Dry vocals +10%',
    key: 'Equal',
    scope: 'playback',
    aliases: ['Shift+Equal', 'NumpadAdd'],
  },
  guide_down: {
    label: 'Dry vocals -10%',
    key: 'Minus',
    scope: 'playback',
    aliases: ['NumpadSubtract'],
  },
  theme_cycle: { label: 'Next playback theme', key: 'KeyT', scope: 'playback' },
  flavor_cycle: { label: 'Next theme variant', key: 'KeyF', scope: 'playback' },
  mic_toggle: { label: 'Toggle microphone', key: 'KeyM', scope: 'playback' },
  mic_cycle: { label: 'Next microphone', key: 'KeyN', scope: 'playback' },
  monitor_toggle: { label: 'Toggle microphone monitor', key: 'KeyR', scope: 'playback' },
  skip_section: {
    label: 'Skip intro / outro',
    key: 'Enter',
    scope: 'playback',
    aliases: ['NumpadEnter'],
  },
  menu_up: { label: 'Menu up', key: 'ArrowUp', scope: 'menu' },
  menu_down: { label: 'Menu down', key: 'ArrowDown', scope: 'menu' },
  menu_left: { label: 'Menu left', key: 'ArrowLeft', scope: 'menu' },
  menu_right: { label: 'Menu right', key: 'ArrowRight', scope: 'menu' },
  menu_confirm: { label: 'Menu confirm', key: 'Enter', scope: 'menu', aliases: ['NumpadEnter'] },
  menu_back: { label: 'Menu back', key: 'Escape', scope: 'menu' },
  panel_next: { label: 'Next library panel', key: 'Tab', scope: 'menu', aliases: ['Shift+Tab'] },
  fullscreen: { label: 'Toggle fullscreen', key: 'F11', scope: 'global' },
  sidebar_toggle: {
    label: 'Toggle sidebar',
    key: 'Ctrl+KeyB',
    scope: 'menu',
    aliases: ['Meta+KeyB'],
  },
} as const satisfies Record<string, Definition>;

export type ShortcutAction = keyof typeof SHORTCUTS;
export type ShortcutBindings = Readonly<Record<string, string>> | null | undefined;
function isShortcutAction(value: string): value is ShortcutAction {
  return value in SHORTCUTS;
}
export const SHORTCUT_ACTIONS = Object.keys(SHORTCUTS).filter(isShortcutAction);

export function shortcutKey(action: ShortcutAction, bindings: ShortcutBindings): string {
  return bindings?.[action] ?? SHORTCUTS[action].key;
}

function keysFor(action: ShortcutAction, bindings: ShortcutBindings): readonly string[] {
  const definition: Definition = SHORTCUTS[action];
  const key = shortcutKey(action, bindings);
  if (key !== definition.key) {
    return [key];
  }
  const letterAliases = /^Key[A-Z]$/.test(key) ? [`Shift+${key}`] : [];
  return [key, ...(definition.aliases ?? []), ...letterAliases];
}

const NUMPAD_ARROWS: Readonly<Partial<Record<string, string>>> = {
  Numpad8: 'ArrowUp',
  Numpad2: 'ArrowDown',
  Numpad4: 'ArrowLeft',
  Numpad6: 'ArrowRight',
};
function keyboardCode(event: KeyboardEvent): string {
  const arrow = NUMPAD_ARROWS[event.code];
  if (arrow !== undefined && !event.getModifierState('NumLock')) {
    return arrow;
  }
  return event.code;
}

export function keyboardBinding(event: KeyboardEvent): string | null {
  if (
    event.isComposing ||
    ['Shift', 'Control', 'Alt', 'Meta', 'Dead', 'Process', 'Unidentified'].includes(event.key)
  ) {
    return null;
  }
  const code = keyboardCode(event);
  if (!code) {
    return null;
  }
  const modifiers = [
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    event.metaKey && 'Meta',
  ].filter(Boolean);
  return [...modifiers, code].join('+');
}

export function matchesShortcut(
  event: KeyboardEvent,
  action: ShortcutAction,
  bindings: ShortcutBindings,
): boolean {
  const key = keyboardBinding(event);
  return key !== null && keysFor(action, bindings).includes(key);
}

export function shortcutLabel(action: ShortcutAction, bindings?: ShortcutBindings): string {
  return shortcutKey(action, bindings)
    .replace(/Key([A-Z])/g, '$1')
    .replace(/Digit([0-9])/g, '$1');
}

export function shortcutConflict(
  action: ShortcutAction,
  key: string,
  bindings: ShortcutBindings,
): ShortcutAction | undefined {
  if (key === '') {
    return undefined;
  }
  const scope = SHORTCUTS[action].scope;
  const candidates = keysFor(action, { ...bindings, [action]: key });
  return SHORTCUT_ACTIONS.find(
    (other) =>
      other !== action &&
      (SHORTCUTS[other].scope === scope ||
        SHORTCUTS[other].scope === 'global' ||
        scope === 'global') &&
      keysFor(other, bindings).some((otherKey) => candidates.includes(otherKey)),
  );
}

export function isShortcutInputBlocked(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    event.isComposing ||
    document.querySelector('[data-shortcut-recording="true"]') !== null ||
    (target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest('input, textarea, select, [role="textbox"]') !== null))
  );
}

let playbackKeyboardOwners = 0;
export function claimPlaybackKeyboard(): () => void {
  playbackKeyboardOwners += 1;
  return () => {
    playbackKeyboardOwners -= 1;
  };
}
export function playbackOwnsKeyboard(): boolean {
  return playbackKeyboardOwners > 0;
}
