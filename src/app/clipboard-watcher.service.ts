import { Injectable, inject, signal } from '@angular/core';
import { NotebookService } from './notebook.service';
import { SettingsService } from './settings.service';

export type WatchState = 'off' | 'listening' | 'idle' | 'blocked' | 'unsupported';

/**
 * Watches the system clipboard. Browsers only allow reading the clipboard while the page
 * is focused, so this polls while the tab is focused and also reads right when it regains focus.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardWatcher {
  private readonly notebook = inject(NotebookService);
  private readonly settings = inject(SettingsService);

  readonly state = signal<WatchState>('off');

  private running = false;
  private busy = false;
  private last: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly onFocus = () => void this.tick();
  private readonly onCopy = () => setTimeout(() => void this.tick(), 80);
  private readonly onVisibility = () => void this.tick();

  get supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
  }

  async start(): Promise<void> {
    if (!this.supported) {
      this.state.set('unsupported');
      return;
    }
    this.stop(false);
    this.running = true;
    this.last = null; // first successful read becomes the baseline (not captured)
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('copy', this.onCopy);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.state.set(document.hasFocus() ? 'listening' : 'idle');
    await this.tick();
    this.loop();
  }

  stop(setOff = true): void {
    this.running = false;
    clearTimeout(this.timer);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('copy', this.onCopy);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (setOff) this.state.set('off');
  }

  /** Call after the app itself writes to the clipboard so it is not captured back. */
  noteSelfWrite(text: string): void {
    this.last = text;
  }

  private loop(): void {
    clearTimeout(this.timer);
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.tick();
      this.loop();
    }, this.settings.settings().pollMs);
  }

  private async tick(): Promise<void> {
    if (!this.running || this.busy) return;
    if (!document.hasFocus()) {
      if (this.state() !== 'blocked') this.state.set('idle');
      return;
    }
    this.busy = true;
    try {
      const text = await navigator.clipboard.readText();
      this.state.set('listening');
      if (this.last === null) {
        this.last = text;
        return;
      }
      if (text !== this.last) {
        this.last = text;
        this.notebook.append(text);
      }
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError') this.state.set(document.hasFocus() ? 'blocked' : 'idle');
    } finally {
      this.busy = false;
    }
  }
}
