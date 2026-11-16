import { settings } from './settings.svelte';

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export const toasts = $state<Toast[]>([]);
let nextId = 1;

export function toast(text: string, action?: Toast['action'], ms = 6000) {
  const t = { id: nextId++, text, action };
  toasts.push(t);
  setTimeout(() => dismiss(t.id), ms);
}

export function dismiss(id: number) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

export function haptic(ms = 10) {
  if (settings.haptics && 'vibrate' in navigator) navigator.vibrate(ms);
}
