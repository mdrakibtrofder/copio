export type SepKind = 'space' | 'newline' | 'blank-line' | 'tab' | 'none' | 'custom';

export interface Separator {
  id: string;
  kind: SepKind;
  custom: string;
}

export interface CopioSettings {
  /** Trim spaces, tabs and new lines from both ends of every copied text. */
  trim: boolean;
  /** Ignore a copy that is identical to the previously captured one. */
  skipDuplicates: boolean;
  /** Keep the notebook scrolled to the newest text. */
  autoScroll: boolean;
  /** How often (ms) the clipboard is checked while this tab is focused. */
  pollMs: number;
  /** Separator placed before copy #2, #3, #4 … (repeats in a loop). */
  pattern: Separator[];
}

export const SEP_OPTIONS: { kind: SepKind; label: string }[] = [
  { kind: 'space', label: 'Space' },
  { kind: 'newline', label: 'New line' },
  { kind: 'blank-line', label: 'Blank line' },
  { kind: 'tab', label: 'Tab' },
  { kind: 'none', label: 'Nothing (join)' },
  { kind: 'custom', label: 'Custom text…' },
];

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function makeSep(kind: SepKind, custom = ''): Separator {
  return { id: uid(), kind, custom };
}

export function sepValue(s: Separator): string {
  switch (s.kind) {
    case 'space': return ' ';
    case 'newline': return '\n';
    case 'blank-line': return '\n\n';
    case 'tab': return '\t';
    case 'none': return '';
    case 'custom': return s.custom;
  }
}

export function sepGlyph(s: Separator): string {
  switch (s.kind) {
    case 'space': return '␣';
    case 'newline': return '↵';
    case 'blank-line': return '↵↵';
    case 'tab': return '⇥';
    case 'none': return '∅';
    case 'custom': return s.custom ? `“${s.custom}”` : '∅';
  }
}

export function sepLabel(s: Separator): string {
  if (s.kind === 'custom') return s.custom ? `“${s.custom}”` : 'Custom';
  return SEP_OPTIONS.find((o) => o.kind === s.kind)?.label ?? s.kind;
}

/** Separator placed before the (n+1)-th capture, where n captures are already in the sequence. */
export function separatorFor(pattern: Separator[], n: number): Separator | null {
  if (n <= 0 || pattern.length === 0) return null;
  return pattern[(n - 1) % pattern.length];
}

export function defaultSettings(): CopioSettings {
  return {
    trim: true,
    skipDuplicates: false,
    autoScroll: true,
    pollMs: 500,
    pattern: [makeSep('space'), makeSep('newline')],
  };
}

export interface Preset {
  name: string;
  hint: string;
  make: () => Separator[];
}

export const PRESETS: Preset[] = [
  { name: 'Space → New line', hint: '1 2⏎3 4⏎5', make: () => [makeSep('space'), makeSep('newline')] },
  { name: 'Always new line', hint: 'one per line', make: () => [makeSep('newline')] },
  { name: 'Always space', hint: 'one paragraph', make: () => [makeSep('space')] },
  { name: '3 per line', hint: '1 2 3⏎4 5 6', make: () => [makeSep('space'), makeSep('space'), makeSep('newline')] },
  { name: 'Comma list', hint: '1, 2, 3', make: () => [makeSep('custom', ', ')] },
];

export interface Snapshot {
  text: string;
  count: number;
}

export type LogKind = 'copy' | 'undo' | 'redo' | 'clear' | 'edit' | 'sequence';

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
  sepGlyph?: string;
  sepLabel?: string;
  n?: number;
  time: Date;
}
