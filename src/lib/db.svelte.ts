// Archivio dati: tutto in memoria (reattivo) con scrittura su IndexedDB.
// I volumi sono piccoli (anni di diario = poche migliaia di record), quindi la UI legge sempre dalla memoria.
import { openDB, type IDBPDatabase } from 'idb';
import { normalizeProfile } from './profile';
import type { BackupFile, DayInfo, Episode, Medication, Profile, Prophylaxis, Questionnaire } from './types';

type Stores = 'episodes' | 'medications' | 'prophylaxis' | 'questionnaires' | 'days' | 'meta';

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('blank-out', 1, {
    upgrade(d) {
      d.createObjectStore('episodes', { keyPath: 'id' });
      d.createObjectStore('medications', { keyPath: 'id' });
      d.createObjectStore('prophylaxis', { keyPath: 'id' });
      d.createObjectStore('questionnaires', { keyPath: 'id' });
      d.createObjectStore('days', { keyPath: 'date' });
      d.createObjectStore('meta');
    }
  });
  return dbp;
}

export const data = $state({
  ready: false,
  episodes: [] as Episode[],
  medications: [] as Medication[],
  prophylaxis: [] as Prophylaxis[],
  questionnaires: [] as Questionnaire[],
  days: [] as DayInfo[],
  customTriggers: [] as string[],
  profile: {} as Profile
});

export const uid = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
export const nowIso = () => new Date().toISOString();

const byStartDesc = (a: Episode, b: Episode) => b.start.localeCompare(a.start);

export async function loadAll() {
  const d = await db();
  const [episodes, medications, prophylaxis, questionnaires, days, customTriggers, profile] = await Promise.all([
    d.getAll('episodes'),
    d.getAll('medications'),
    d.getAll('prophylaxis'),
    d.getAll('questionnaires'),
    d.getAll('days'),
    d.get('meta', 'customTriggers'),
    d.get('meta', 'profile')
  ]);
  data.episodes = (episodes as Episode[]).sort(byStartDesc);
  data.medications = medications;
  data.prophylaxis = prophylaxis;
  data.questionnaires = (questionnaires as Questionnaire[]).sort((a, b) => b.date.localeCompare(a.date));
  data.days = days;
  data.customTriggers = customTriggers ?? [];
  data.profile = normalizeProfile(profile);
  data.ready = true;
  try {
    await navigator.storage?.persist?.();
  } catch {}
}

// $state.snapshot rimuove i proxy reattivi prima della scrittura su IndexedDB
async function put(store: Stores, value: unknown) {
  (await db()).put(store, $state.snapshot(value));
}
async function del(store: Stores, key: string) {
  (await db()).delete(store, key);
}

function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

// ---- Episodi ----
export function newEpisode(partial: Partial<Episode> = {}): Episode {
  const t = nowIso();
  return {
    id: uid(),
    start: t,
    end: null,
    intensity: 5,
    locations: [],
    quality: [],
    symptoms: [],
    autonomic: [],
    aura: [],
    triggers: [],
    meds: [],
    redFlags: [],
    notes: '',
    createdAt: t,
    updatedAt: t,
    ...partial
  };
}

export async function saveEpisode(e: Episode) {
  e.updatedAt = nowIso();
  upsert(data.episodes, e);
  data.episodes.sort(byStartDesc);
  await put('episodes', e);
}

export async function deleteEpisode(id: string) {
  data.episodes = data.episodes.filter((e) => e.id !== id);
  await del('episodes', id);
}

/** Aggiunge più episodi in un'unica transazione (importazione da altre app). */
export async function addEpisodes(list: Episode[]) {
  const d = await db();
  const tx = d.transaction('episodes', 'readwrite');
  for (const e of list) tx.store.put($state.snapshot(e));
  await tx.done;
  data.episodes.push(...list);
  data.episodes.sort(byStartDesc);
}

export const getEpisode =(id: string) => data.episodes.find((e) => e.id === id);
export const activeEpisode = () => data.episodes.find((e) => e.end === null);

// ---- Farmaci personali ----
export async function saveMedication(m: Medication) {
  upsert(data.medications, m);
  await put('medications', m);
}
export async function deleteMedication(id: string) {
  data.medications = data.medications.filter((m) => m.id !== id);
  await del('medications', id);
}

// ---- Profilassi ----
export async function saveProphylaxis(p: Prophylaxis) {
  upsert(data.prophylaxis, p);
  await put('prophylaxis', p);
}
export async function deleteProphylaxis(id: string) {
  data.prophylaxis = data.prophylaxis.filter((p) => p.id !== id);
  await del('prophylaxis', id);
}

// ---- Questionari ----
export async function saveQuestionnaire(q: Questionnaire) {
  upsert(data.questionnaires, q);
  data.questionnaires.sort((a, b) => b.date.localeCompare(a.date));
  await put('questionnaires', q);
}
export async function deleteQuestionnaire(id: string) {
  data.questionnaires = data.questionnaires.filter((q) => q.id !== id);
  await del('questionnaires', id);
}

// ---- Giorni ----
export const getDay = (date: string) => data.days.find((d) => d.date === date);

export async function saveDay(day: DayInfo) {
  const empty = !day.period && !day.periodStart && !day.headacheFree && !day.checkin;
  data.days = data.days.filter((d) => d.date !== day.date);
  if (empty) return del('days', day.date);
  data.days.push(day);
  await put('days', day);
}

// ---- Meta ----
export async function addCustomTrigger(label: string) {
  const t = label.trim();
  if (!t || data.customTriggers.includes(t)) return;
  data.customTriggers.push(t);
  await (await db()).put('meta', $state.snapshot(data.customTriggers), 'customTriggers');
}

export async function saveProfile() {
  await (await db()).put('meta', $state.snapshot(data.profile), 'profile');
}

// ---- Backup ----
export function exportBackup(settings: Record<string, unknown>): BackupFile {
  const s = $state.snapshot(data);
  return {
    app: 'blank-out',
    version: 1,
    exportedAt: nowIso(),
    episodes: s.episodes,
    medications: s.medications,
    prophylaxis: s.prophylaxis,
    questionnaires: s.questionnaires,
    days: s.days,
    customTriggers: s.customTriggers,
    profile: s.profile,
    settings
  };
}

export function isBackup(x: unknown): x is BackupFile {
  return !!x && typeof x === 'object' && (x as BackupFile).app === 'blank-out' && Array.isArray((x as BackupFile).episodes);
}

export async function importBackup(b: BackupFile) {
  const d = await db();
  const stores = ['episodes', 'medications', 'prophylaxis', 'questionnaires', 'days', 'meta'] as const;
  const tx = d.transaction(stores, 'readwrite');
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  // put() può lanciare in modo sincrono (DataCloneError su proxy, DataError su record senza id):
  // senza abort la transazione verrebbe comunque confermata, con i dati già cancellati.
  try {
    for (const e of b.episodes) tx.objectStore('episodes').put({ ...newEpisode(), ...e });
    for (const m of b.medications ?? []) tx.objectStore('medications').put(m);
    for (const p of b.prophylaxis ?? []) tx.objectStore('prophylaxis').put(p);
    for (const q of b.questionnaires ?? []) tx.objectStore('questionnaires').put(q);
    for (const day of b.days ?? []) tx.objectStore('days').put(day);
    tx.objectStore('meta').put(b.customTriggers ?? [], 'customTriggers');
    tx.objectStore('meta').put(normalizeProfile(b.profile), 'profile');
  } catch (err) {
    tx.done.catch(() => {});
    tx.abort();
    throw err;
  }
  await tx.done;
  await loadAll();
}

export async function wipeAll() {
  await importBackup({ app: 'blank-out', version: 1, exportedAt: nowIso(), episodes: [], medications: [], prophylaxis: [], questionnaires: [], days: [], customTriggers: [] });
}
