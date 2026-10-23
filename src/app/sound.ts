/**
 * Sound effects, synthesised with the Web Audio API (no audio files to download). Sound can be
 * switched off in Settings; the choice is a per-device convenience kept apart from the save.
 * Where audio or storage is unavailable, everything here quietly does nothing.
 */
import { useSyncExternalStore } from 'react';

export type SoundName = 'success' | 'error' | 'fanfare' | 'bell' | 'tick' | 'register';

const KEY = 'rlt-cafe-empire/bunyi';
const CHANGE = 'rlt-cafe-empire:bunyi';

/** The stored setting, read once and then kept in step with every write. */
let enabled: boolean | undefined;
let context: AudioContext | null | undefined;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function isEnabled(): boolean {
  if (enabled === undefined) enabled = readEnabled();
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Not stored: the choice lasts until the page is reloaded.
  }
  enabled = on;
  window.dispatchEvent(new Event(CHANGE));
  if (on) playSound('success');
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    enabled = readEnabled();
    onChange();
  };
  window.addEventListener(CHANGE, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, isEnabled);
}

function audio(): AudioContext | null {
  if (context === undefined) {
    const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    try {
      context = Ctor ? new Ctor() : null;
    } catch {
      context = null;
    }
  }
  if (context?.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
}

interface Note {
  /** Hz, optionally sliding to `to` over the note. */
  freq: number;
  to?: number;
  /** Seconds after the sound starts. */
  at: number;
  length: number;
  gain: number;
  wave?: OscillatorType;
}

const SOUNDS: Record<SoundName, Note[]> = {
  success: [
    { freq: 660, at: 0, length: 0.09, gain: 0.07 },
    { freq: 880, at: 0.07, length: 0.12, gain: 0.07 },
  ],
  error: [{ freq: 220, to: 140, at: 0, length: 0.22, gain: 0.09, wave: 'triangle' }],
  fanfare: [523, 659, 784, 1047].map((freq, i) => ({ freq, at: i * 0.09, length: i === 3 ? 0.4 : 0.12, gain: 0.07, wave: 'triangle' as const })),
  bell: [
    { freq: 1047, at: 0, length: 0.9, gain: 0.07 },
    { freq: 1568, at: 0, length: 0.5, gain: 0.025 },
  ],
  tick: [{ freq: 1568, at: 0, length: 0.06, gain: 0.025 }],
  register: [
    { freq: 1319, at: 0, length: 0.05, gain: 0.05, wave: 'square' },
    { freq: 1760, at: 0.06, length: 0.05, gain: 0.05, wave: 'square' },
    { freq: 2637, at: 0.13, length: 0.45, gain: 0.05 },
  ],
};

export function playSound(name: SoundName): void {
  if (!isEnabled()) return;
  const ctx = audio();
  if (!ctx) return;
  try {
    const start = ctx.currentTime + 0.01;
    for (const note of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = note.wave ?? 'sine';
      osc.frequency.setValueAtTime(note.freq, start + note.at);
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, start + note.at + note.length);
      // A quick attack and an exponential fade, so notes start and stop without clicks.
      amp.gain.setValueAtTime(0.0001, start + note.at);
      amp.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
      osc.connect(amp).connect(ctx.destination);
      osc.start(start + note.at);
      osc.stop(start + note.at + note.length + 0.02);
    }
  } catch {
    // Audio is a nicety: never let it break the game.
  }
}
