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

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const nowMinutes = (now: Date) => now.getHours() * 60 + now.getMinutes();
// Il promemoria del mattino ha senso solo nelle ore successive: aprendo l'app la sera non arriva più
const MORNING_WINDOW = 4 * 60;

/** Contenuto del promemoria serale, o null se oggi è già tutto registrato (giornata e check-in). */
export function eveningMessage(now = new Date()): { title: string; body: string } | null {
  const today = dayKey(now);
  const day = getDay(today);
  const loggedToday =
    !!activeEpisode() || !!day?.headacheFree || data.episodes.some((e) => dayKey(e.start) === today || (e.end && dayKey(e.end) === today));
  // Check-in della sera: lo stress è la riga che, con il sonno, segna il check-in come fatto
  const checkinDone = !!day?.checkin?.stress;
  if (loggedToday && checkinDone) return null;
  if (loggedToday) return { title: 'Check-in della sera', body: 'Stress, pasti, movimento: bastano 10 secondi' };
  if (checkinDone) return { title: 'Oggi tutto bene?', body: 'Tocca per registrare la giornata' };
  return { title: 'Com’è andata oggi?', body: 'Completa il check-in e segna se hai avuto mal di testa' };
}

/** Promemoria serale: una volta al giorno, dopo l'ora scelta, se manca la giornata o il check-in. */
export function checkDailyReminder(now = new Date()) {
  if (!settings.reminderEnabled || !granted() || !data.ready) return;
  const today = dayKey(now);
  if (settings.lastReminderDate === today) return;
  if (nowMinutes(now) < minutes(settings.reminderTime)) return;
  const msg = eveningMessage(now);
  if (!msg) return;
  settings.lastReminderDate = today;
  saveSettings();
  show(msg.title, { body: msg.body, tag: 'daily' });
}

/** Promemoria del mattino: una volta al giorno, nelle ore dopo l'ora scelta, se il sonno non è ancora segnato. */
export function checkMorningReminder(now = new Date()) {
  if (!settings.morningReminderEnabled || !granted() || !data.ready) return;
  const today = dayKey(now);
  if (settings.lastMorningReminderDate === today) return;
  const from = minutes(settings.morningReminderTime);
  const t = nowMinutes(now);
  if (t < from || t >= from + MORNING_WINDOW) return;
  if (getDay(today)?.checkin?.sleep) return;
  settings.lastMorningReminderDate = today;
  saveSettings();
  show('Come hai dormito?', { body: 'Segnalo nel check-in di oggi: basta un tocco', tag: 'morning' });
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
  checkMorningReminder(now);
  checkDailyReminder(now);
  notifyPendingEfficacy(now);
}

/** Avvia i controlli periodici (idempotente). Va chiamata dopo il caricamento dei dati. */
export function startReminders() {
  if (timer || typeof window === 'undefined') return;
  // Al primo avvio non notifichiamo i farmaci già in attesa: la Home li mostra già
  for (const { med } of pendingEfficacy(data.episodes)) notifiedMeds.add(med.id);
  checkMorningReminder();
  checkDailyReminder();
  timer = setInterval(tick, 60000);
}
