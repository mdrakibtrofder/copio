import { DatePipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { ClipboardWatcher } from './clipboard-watcher.service';
import {
  PRESETS,
  Preset,
  SEP_OPTIONS,
  SepKind,
  sepGlyph,
  sepLabel,
  sepValue,
  separatorFor,
} from './models';
import { NotebookService } from './notebook.service';
import { SettingsService } from './settings.service';

@Component({
  selector: 'app-root',
  imports: [DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(window:keydown)': 'onKey($event)' },
})
export class App {
  protected readonly cfg = inject(SettingsService);
  protected readonly nb = inject(NotebookService);
  protected readonly clip = inject(ClipboardWatcher);

  protected readonly sepOptions = SEP_OPTIONS;
  protected readonly presets = PRESETS;
  protected readonly sepGlyph = sepGlyph;
  protected readonly sepLabel = sepLabel;

  private readonly area = viewChild<ElementRef<HTMLTextAreaElement>>('area');

  protected readonly stateKey = computed(() => (this.cfg.enabled() ? this.clip.state() : 'off'));

  protected readonly stateText = computed(() => {
    switch (this.stateKey()) {
      case 'listening': return 'Listening to clipboard';
      case 'idle': return 'Paused – click this tab to resume';
      case 'blocked': return 'Clipboard access blocked';
      case 'unsupported': return 'Clipboard API not supported';
      default: return 'Capture is off';
    }
  });

  protected readonly stats = computed(() => {
    const t = this.nb.text();
    const words = t.trim() ? t.trim().split(/\s+/).length : 0;
    return { chars: t.length, words, lines: t ? t.split('\n').length : 0 };
  });

  /** What the next copy will do. */
  protected readonly next = computed(() => {
    const n = this.nb.count();
    const pattern = this.cfg.settings().pattern;
    if (n === 0) {
      return { num: 1, glyph: this.nb.text() ? '↵' : '•', label: this.nb.text() ? 'New line' : 'Start' };
    }
    const s = separatorFor(pattern, n);
    return { num: n + 1, glyph: s ? sepGlyph(s) : '∅', label: s ? sepLabel(s) : 'Nothing' };
  });

  /** Live preview of the configured pattern using sample copies. */
  protected readonly preview = computed(() => {
    const pattern = this.cfg.settings().pattern;
    const items = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'];
    const parts: { word: string; glyph: string; n: number }[] = [];
    let text = '';
    items.forEach((w, i) => {
      const s = separatorFor(pattern, i);
      if (s) text += sepValue(s);
      text += w;
      parts.push({ word: w, glyph: s ? sepGlyph(s) : '', n: i + 1 });
    });
    return { text, parts };
  });

  constructor() {
    if (this.cfg.enabled()) void this.clip.start();

    // keep the notebook scrolled to the newest text
    effect(() => {
      this.nb.text();
      const auto = this.cfg.settings().autoScroll;
      const el = this.area()?.nativeElement;
      if (!auto || !el || document.activeElement === el) return;
      setTimeout(() => (el.scrollTop = el.scrollHeight));
    });
  }

  protected async toggle(): Promise<void> {
    if (this.cfg.enabled()) {
      this.cfg.enabled.set(false);
      this.clip.stop();
    } else {
      this.cfg.enabled.set(true);
      await this.clip.start();
    }
  }

  protected retry(): Promise<void> {
    return this.clip.start();
  }

  protected onInput(e: Event): void {
    this.nb.setLive((e.target as HTMLTextAreaElement).value);
  }

  protected onKind(i: number, e: Event): void {
    this.cfg.setKind(i, (e.target as HTMLSelectElement).value as SepKind);
  }

  protected onCustom(i: number, e: Event): void {
    this.cfg.setCustom(i, (e.target as HTMLInputElement).value);
  }

  protected onPoll(e: Event): void {
    this.cfg.patch({ pollMs: Number((e.target as HTMLInputElement).value) });
    if (this.cfg.enabled() && this.clip.state() !== 'off') void this.clip.start();
  }

  protected onCheck(key: 'trim' | 'skipDuplicates' | 'autoScroll', e: Event): void {
    this.cfg.patch({ [key]: (e.target as HTMLInputElement).checked });
  }

  protected usePreset(p: Preset): void {
    this.cfg.applyPreset(p);
  }

  protected async copyAll(): Promise<void> {
    const text = this.nb.text();
    if (!text) return;
    this.clip.noteSelfWrite(text);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  protected download(): void {
    const blob = new Blob([this.nb.text()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'copio-notebook.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  protected onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && ['TEXTAREA', 'INPUT', 'SELECT'].includes(t.tagName)) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.nb.undo();
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      this.nb.redo();
    }
  }
}
