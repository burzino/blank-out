// Preferenze dell'interfaccia: piccole, per-dispositivo, salvate in localStorage.
export interface Settings {
  theme: 'dark' | 'light';
  largeText: boolean;
  haptics: boolean;
  onboarded: boolean;
  reminderEnabled: boolean;
  reminderTime: string; // HH:MM
  trackCycle: boolean;
  lastBackupAt: string | null;
  lastReminderDate: string | null;
  weatherEnabled: boolean;
  weatherLat: number | null;
  weatherLon: number | null;
}

const KEY = 'blankout.settings';

const defaults: Settings = {
  theme: 'dark',
  largeText: false,
  haptics: true,
  onboarded: false,
  reminderEnabled: false,
  reminderTime: '21:00',
  trackCycle: false,
  lastBackupAt: null,
  lastReminderDate: null,
  weatherEnabled: false,
  weatherLat: null,
  weatherLon: null
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return { ...defaults };
}

export const settings = $state<Settings>(load());

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
  applySettings();
}

export function replaceSettings(next: Partial<Settings>) {
  Object.assign(settings, defaults, next);
  saveSettings();
}

export function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.large = String(settings.largeText);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#121316' : '#ece7de');
}
