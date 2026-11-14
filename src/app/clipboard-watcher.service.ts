import { Injectable, inject, signal } from '@angular/core';
import { NotebookService } from './notebook.service';
import { SettingsService } from './settings.service';

export type WatchState = 'off' | 'listening' | 'idle' | 'blocked' | 'unsupported';

/** Exposed by the Electron preload script when Copio runs as a desktop app. */
interface CopioBridge {
  isDesktop: true;
  start(ms: number): void;
  stop(): void;
  writeText(text: string): void;
  setPinned(pinned: boolean): void;
  onText(cb: (text: string) => void): () => void;
}

/**
 * Watches the system clipboard.
 *  - Desktop app (Electron): the main process polls the clipboard in the background, so copies
 *    from any tab or application are captured even while Copio is minimised or unfocused.
 *  - Plain browser: pages may only read the clipboard while their tab is focused.
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
  private unsubscribe: (() => void) | undefined;

  private readonly onFocus = () => void this.tick();
  private readonly onCopy = () => setTimeout(() => void this.tick(), 80);
  private readonly onVisibility = () => void this.tick();

  private get bridge(): CopioBridge | undefined {
    return (window as unknown as { copioBridge?: CopioBridge }).copioBridge;
  }

  /** True when running inside the desktop app (background capture works). */
  get desktop(): boolean {
    return !!this.bridge;
  }

  get supported(): boolean {
    return this.desktop || (typeof navigator !== 'undefined' && !!navigator.clipboard?.readText);
  }

  async start(): Promise<void> {
    if (!this.supported) {
      this.state.set('unsupported');
      return;
    }
    this.stop(false);
    this.running = true;

    const bridge = this.bridge;
    if (bridge) {
      this.unsubscribe = bridge.onText((text) => this.notebook.append(text));
      bridge.start(this.settings.settings().pollMs);
      this.state.set('listening');
      return;
    }

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
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.bridge?.stop();
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('copy', this.onCopy);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (setOff) this.state.set('off');
  }

  /** Writes to the clipboard without Copio capturing its own copy. */
  async writeText(text: string): Promise<void> {
    const bridge = this.bridge;
    if (bridge) {
      bridge.writeText(text);
      return;
    }
    this.last = text;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  setPinned(pinned: boolean): void {
    this.bridge?.setPinned(pinned);
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
