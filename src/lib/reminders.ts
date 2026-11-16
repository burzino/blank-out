// Promemoria locali (notifiche di sistema).
//
// LIMITE IMPORTANTE: l'app non ha un server e quindi non usa Web Push. Le notifiche vengono
// mostrate dal service worker solo mentre l'app è aperta o è stata in background di recente
// (il browser può sospendere i timer in qualsiasi momento). Per questo la Home mostra comunque
// tutto in-app: la card "Oggi tutto bene?" dopo l'ora del promemoria e le richieste di efficacia
// dei farmaci a 2 ore. Le notifiche sono solo un aiuto in più.
import { dayKey, pendingEfficacy } from './clinic';
import { activeEpisode, data, getDay } from './db.svelte';
import { saveSettings, settings } from './settings.svelte';

let timer: ReturnType<typeof setInterval> | null = null;
// Farmaci per cui abbiamo già inviato la notifica di efficacia (solo in memoria)
const notifiedMeds = new Set<string>();

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
const granted = () => notificationsSupported() && Notification.permission === 'granted';

/** Chiede il permesso alle notifiche; restituisce true se concesso. Non fallisce mai. */
export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    if (Notification.permission === 'default') await Notification.requestPermission();
  } catch {}
  return Notification.permission === 'granted';
}

async function show(title: string, options: NotificationOptions) {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { icon: 'pwa-192x192.png', ...options });
  } catch {}
}

/** Promemoria serale: una volta al giorno, dopo l'ora scelta, se oggi non è registrato nulla. */
export function checkDailyReminder(now = new Date()) {
  if (!settings.reminderEnabled || !granted() || !data.ready) return;
  const today = dayKey(now);
  if (settings.lastReminderDate === today) return;
  const [h, m] = settings.reminderTime.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  const loggedToday = !!activeEpisode() || data.episodes.some((e) => dayKey(e.start) === today || (e.end && dayKey(e.end) === today));
  if (loggedToday || getDay(today)?.headacheFree) return;
  settings.lastReminderDate = today;
  saveSettings();
  show('Oggi tutto bene?', { body: 'Tocca per registrare la giornata', tag: 'daily' });
}

/** Una notifica per ogni farmaco preso da più di 2 ore senza valutazione dell'efficacia. */
export function notifyPendingEfficacy(now = new Date()) {
  if (!granted() || !data.ready) return;
  for (const { med } of pendingEfficacy(data.episodes, now)) {
    if (notifiedMeds.has(med.id)) continue;
    notifiedMeds.add(med.id);
    show(`Com'è andata con ${med.name}?`, { body: 'Tocca per dire se ha funzionato', tag: 'efficacy-' + med.id });
  }
}

function tick() {
  const now = new Date();
  checkDailyReminder(now);
  notifyPendingEfficacy(now);
}

/** Avvia i controlli periodici (idempotente). Va chiamata dopo il caricamento dei dati. */
export function startReminders() {
  if (timer || typeof window === 'undefined') return;
  // Al primo avvio non notifichiamo i farmaci già in attesa: la Home li mostra già
  for (const { med } of pendingEfficacy(data.episodes)) notifiedMeds.add(med.id);
  checkDailyReminder();
  timer = setInterval(tick, 60000);
}
