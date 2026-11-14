import { Injectable, effect, inject, signal } from '@angular/core';
import { LogEntry, LogKind, Snapshot, separatorFor, sepValue, sepGlyph, sepLabel } from './models';
import { SettingsService } from './settings.service';

const NOTEBOOK_KEY = 'copio.notebook.v1';
const MAX_HISTORY = 300;
const MAX_LOG = 40;

@Injectable({ providedIn: 'root' })
export class NotebookService {
  private readonly settings = inject(SettingsService);

  readonly text = signal('');
  /** Number of captures in the current sequence (drives which separator is used next). */
  readonly count = signal(0);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly log = signal<LogEntry[]>([]);
  readonly captures = signal(0);

  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private editBase: Snapshot | null = null;
  private lastCaptured: string | null = null;
  private logId = 0;

  constructor() {
    this.restore();
    effect(() => {
      const data = { text: this.text(), count: this.count() };
      try {
        localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(data));
      } catch {
        /* ignore */
      }
    });
  }

  /** Adds a freshly copied text according to the configured pattern. Returns true if appended. */
  append(raw: string): boolean {
    const cfg = this.settings.settings();
    const value = cfg.trim ? raw.replace(/^[\s]+|[\s]+$/g, '') : raw;
    if (!value || (!cfg.trim && !value.trim())) return false;
    if (cfg.skipDuplicates && value === this.lastCaptured) return false;

    this.commitEdit();
    const n = this.count();
    const current = this.text();
    let sep = '';
    let glyph = '';
    let label = '';

    if (n === 0) {
      // first copy of a sequence: start on a fresh line if the notebook already has text
      if (current.length > 0 && !current.endsWith('\n')) {
        sep = '\n';
        glyph = '↵';
        label = 'New line';
      } else {
        glyph = '•';
        label = 'Start';
      }
    } else {
      const s = separatorFor(cfg.pattern, n);
      if (s) {
        sep = sepValue(s);
        glyph = sepGlyph(s);
        label = sepLabel(s);
      }
    }

    this.pushHistory();
    this.text.set(current + sep + value);
    this.count.set(n + 1);
    this.captures.update((c) => c + 1);
    this.lastCaptured = value;
    this.addLog('copy', value, { n: n + 1, sepGlyph: glyph, sepLabel: label });
    return true;
  }

  /** Live typing in the notebook (history snapshot is taken once when editing finishes). */
  setLive(text: string): void {
    if (!this.editBase) this.editBase = { text: this.text(), count: this.count() };
    this.text.set(text);
  }

  commitEdit(): void {
    const base = this.editBase;
    if (!base) return;
    this.editBase = null;
    if (base.text === this.text()) return;
    this.past.push(base);
    this.trimHistory();
    this.future = [];
    this.syncFlags();
    this.addLog('edit', 'Edited notebook by hand');
  }

  clear(): void {
    this.commitEdit();
    if (!this.text() && this.count() === 0) return;
    this.pushHistory();
    this.text.set('');
    this.count.set(0);
    this.lastCaptured = null;
    this.addLog('clear', 'Notebook cleared');
  }

  /** Next copy starts a new sequence (restarts the separator pattern) on a new line. */
  newSequence(): void {
    this.commitEdit();
    if (this.count() === 0) return;
    this.pushHistory();
    this.count.set(0);
    this.addLog('sequence', 'Pattern restarted – next copy starts a new line');
  }

  undo(): void {
    this.commitEdit();
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.snapshot());
    this.apply(prev);
    this.syncFlags();
    this.addLog('undo', 'Undid last action');
  }

  redo(): void {
    this.commitEdit();
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.snapshot());
    this.apply(next);
    this.syncFlags();
    this.addLog('redo', 'Redid action');
  }

  clearLog(): void {
    this.log.set([]);
  }

  private snapshot(): Snapshot {
    return { text: this.text(), count: this.count() };
  }

  private apply(s: Snapshot): void {
    this.text.set(s.text);
    this.count.set(s.count);
    this.lastCaptured = null;
  }

  private pushHistory(): void {
    this.past.push(this.snapshot());
    this.trimHistory();
    this.future = [];
    this.syncFlags();
  }

  private trimHistory(): void {
    if (this.past.length > MAX_HISTORY) this.past.splice(0, this.past.length - MAX_HISTORY);
  }

  private syncFlags(): void {
    this.canUndo.set(this.past.length > 0);
    this.canRedo.set(this.future.length > 0);
  }

  private addLog(kind: LogKind, text: string, extra: Partial<LogEntry> = {}): void {
    const entry: LogEntry = { id: ++this.logId, kind, text, time: new Date(), ...extra };
    this.log.update((l) => [entry, ...l].slice(0, MAX_LOG));
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(NOTEBOOK_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<Snapshot>;
      if (typeof d.text === 'string') this.text.set(d.text);
      if (typeof d.count === 'number') this.count.set(d.count);
    } catch {
      /* ignore */
    }
  }
}
