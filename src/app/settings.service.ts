import { Injectable, effect, signal } from '@angular/core';
import { CopioSettings, Preset, SepKind, defaultSettings, makeSep } from './models';

const SETTINGS_KEY = 'copio.settings.v1';
const ENABLED_KEY = 'copio.enabled.v1';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<CopioSettings>(this.load());
  /** Whether automatic capture is switched on (also remembered between visits). */
  readonly enabled = signal<boolean>(this.loadEnabled());

  constructor() {
    effect(() => this.save(SETTINGS_KEY, this.settings()));
    effect(() => this.save(ENABLED_KEY, this.enabled()));
  }

  patch(partial: Partial<CopioSettings>): void {
    this.settings.update((s) => ({ ...s, ...partial }));
  }

  addStep(kind: SepKind = 'space'): void {
    this.settings.update((s) => ({ ...s, pattern: [...s.pattern, makeSep(kind)] }));
  }

  removeStep(index: number): void {
    this.settings.update((s) => ({ ...s, pattern: s.pattern.filter((_, i) => i !== index) }));
  }

  setKind(index: number, kind: SepKind): void {
    this.settings.update((s) => ({
      ...s,
      pattern: s.pattern.map((p, i) => (i === index ? { ...p, kind } : p)),
    }));
  }

  setCustom(index: number, custom: string): void {
    this.settings.update((s) => ({
      ...s,
      pattern: s.pattern.map((p, i) => (i === index ? { ...p, custom } : p)),
    }));
  }

  applyPreset(preset: Preset): void {
    this.patch({ pattern: preset.make() });
  }

  reset(): void {
    this.settings.set(defaultSettings());
  }

  private load(): CopioSettings {
    const base = defaultSettings();
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return base;
      const p = JSON.parse(raw) as Partial<CopioSettings>;
      const pattern = Array.isArray(p.pattern)
        ? p.pattern
            .filter((x) => x && typeof x.kind === 'string')
            .map((x) => makeSep(x.kind, typeof x.custom === 'string' ? x.custom : ''))
        : base.pattern;
      return {
        trim: p.trim ?? base.trim,
        skipDuplicates: p.skipDuplicates ?? base.skipDuplicates,
        autoScroll: p.autoScroll ?? base.autoScroll,
        pollMs: Math.min(3000, Math.max(200, Number(p.pollMs) || base.pollMs)),
        pattern,
      };
    } catch {
      return base;
    }
  }

  private loadEnabled(): boolean {
    try {
      return localStorage.getItem(ENABLED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private save(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable – ignore */
    }
  }
}
