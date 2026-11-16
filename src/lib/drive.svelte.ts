// Backup automatico cifrato su Google Drive (cartella nascosta appDataFolder), senza server nostri.
// Token OAuth solo in memoria (~1 h); la chiave AES resta sul dispositivo (vedi crypto.ts).
import { untrack } from 'svelte';
import { GOOGLE_CLIENT_ID } from './config';
import { clearLocalKey, decryptJson, deriveKey, encryptJson, isEncryptedFile, loadLocalKey, MIN_PASSWORD, newSalt, saveLocalKey } from './crypto';
import { data, exportBackup, importBackup, isBackup } from './db.svelte';
import { replaceSettings, saveSettings, settings, type Settings } from './settings.svelte';
import type { BackupFile } from './types';

// ---- Tipi minimi di Google Identity Services ----
interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(override?: { prompt?: string }): void;
}
interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    prompt?: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}
const gis = () => (window as unknown as { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }).google?.accounts?.oauth2;

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const MAIN_NAME = 'blank-out-backup.enc.json';
const DAILY_RE = /^blank-out-(\d{4}-\d{2}-\d{2})\.enc\.json$/;
const KEEP_DAILY = 7;
const DEBOUNCE_MS = 20_000;
const STALE_MS = 24 * 3600_000;
const LS_KEY = 'blankout.drive';

// ---- Stato reattivo (persistito senza token) ----
interface Persisted {
  enabled: boolean;
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}
function loadPersisted(): Persisted {
  const d: Persisted = { enabled: false, connected: false, lastSyncAt: null, lastError: null };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch {}
  return d;
}

export const drive = $state({
  configured: GOOGLE_CLIENT_ID !== '',
  ...loadPersisted(),
  needsReauth: false,
  syncing: false,
  hasKey: false
});

function persist() {
  const p: Persisted = { enabled: drive.enabled, connected: drive.connected, lastSyncAt: drive.lastSyncAt, lastError: drive.lastError };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {}
}

// La chiave si carica da IndexedDB in modo asincrono all'avvio del modulo
let localKey: { key: CryptoKey; salt: Uint8Array<ArrayBuffer> } | null = null;
const keyLoaded = (async () => {
  if (typeof indexedDB === 'undefined') return;
  localKey = await loadLocalKey();
  drive.hasKey = !!localKey;
})();

// ---- Caricamento GIS (solo quando serve) ----
let gisP: Promise<void> | null = null;
export function prepareGoogle(): Promise<void> {
  if (!drive.configured) return Promise.reject(new Error('Google Drive non configurato'));
  if (gis()) return Promise.resolve();
  gisP ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (gis() ? resolve() : reject(new Error('Google non disponibile')));
    s.onerror = () => {
      gisP = null;
      s.remove();
      reject(new Error('Impossibile contattare Google. Controlla la connessione.'));
    };
    document.head.appendChild(s);
  });
  return gisP;
}

// ---- Token ----
let token: { value: string; exp: number } | null = null;
const tokenValid = () => !!token && Date.now() < token.exp - 60_000;

class ReauthError extends Error {
  constructor() {
    super('Serve ricollegare Google');
  }
}

// Apre il flusso GIS. Se GIS è già caricato, requestAccessToken parte in modo sincrono:
// importante perché il popup deve nascere dentro il gesto dell'utente.
function requestToken(prompt: '' | 'consent'): Promise<string> {
  const run = () =>
    new Promise<string>((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn();
      };
      // Se l'utente abbandona il popup senza chiuderlo, GIS può non rispondere mai
      const timer = setTimeout(() => finish(() => reject(new ReauthError())), prompt ? 180_000 : 30_000);
      const client = gis()!.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPE,
        prompt,
        callback: (r) => {
          if (r.error || !r.access_token) return finish(() => reject(new ReauthError()));
          token = { value: r.access_token, exp: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
          finish(() => resolve(r.access_token!));
        },
        error_callback: () => finish(() => reject(new ReauthError())) // popup bloccato o chiuso
      });
      client.requestAccessToken({ prompt });
    });
  return gis() ? run() : prepareGoogle().then(run);
}

// Senza gesto dell'utente: usa il token in memoria o tenta un rinnovo silenzioso una sola volta.
async function getToken(): Promise<string> {
  if (tokenValid()) return token!.value;
  if (drive.needsReauth || !drive.connected) throw new ReauthError();
  try {
    return await requestToken('');
  } catch {
    drive.needsReauth = true;
    throw new ReauthError();
  }
}

/** Da chiamare dentro un click: primo collegamento (consenso) o ricollegamento. */
export async function connectGoogle(): Promise<void> {
  await requestToken(drive.connected ? '' : 'consent');
  drive.connected = true;
  drive.needsReauth = false;
  persist();
}

/** "Ricollega Google": ottiene un token nuovo e recupera un eventuale backup in sospeso. */
export async function reauth(): Promise<boolean> {
  await connectGoogle();
  drive.lastError = null;
  persist();
  if (drive.enabled && drive.hasKey && (dirty || isStale())) return backupNow();
  return true;
}

// ---- REST Drive ----
class HttpError extends Error {
  constructor(public status: number) {
    super(`Drive ha risposto ${status}`);
  }
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const t = await getToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } });
  if (res.status === 401) {
    token = null; // scaduto o revocato: al prossimo giro si rinnova
    throw new ReauthError();
  }
  if (!res.ok) throw new HttpError(res.status);
  return res;
}

export interface DriveBackupInfo {
  id: string;
  name: string;
  modifiedTime: string;
  size?: number;
  daily: boolean; // snapshot giornaliero o file principale
}

async function listFiles(): Promise<DriveBackupInfo[]> {
  const q = encodeURIComponent("trashed=false and name contains 'blank-out-'");
  const url = `${API}?spaces=appDataFolder&q=${q}&orderBy=modifiedTime desc&pageSize=100&fields=files(id,name,modifiedTime,size)`;
  const json = (await (await api(url)).json()) as { files?: { id: string; name: string; modifiedTime: string; size?: string }[] };
  return (json.files ?? [])
    .filter((f) => f.name === MAIN_NAME || DAILY_RE.test(f.name))
    .map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: f.size ? Number(f.size) : undefined, daily: f.name !== MAIN_NAME }));
}

// Upload multipart: POST crea in appDataFolder, PATCH aggiorna il contenuto di un file esistente
async function upload(name: string, content: string, id?: string): Promise<string> {
  const boundary = 'blankout' + Math.random().toString(36).slice(2);
  const meta = id ? {} : { name, parents: ['appDataFolder'], mimeType: 'application/json' };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const url = id ? `${UPLOAD}/${id}?uploadType=multipart&fields=id` : `${UPLOAD}?uploadType=multipart&fields=id`;
  const res = await api(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  return ((await res.json()) as { id: string }).id;
}

const pad = (n: number) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Cache degli id: nello stesso giorno bastano due PATCH, senza rielencare i file
let ids: { main?: string; day?: string; dayId?: string } = {};

async function uploadAll(content: string) {
  const day = today();
  if (!ids.main || ids.day !== day || !ids.dayId) {
    const files = await listFiles();
    ids = { main: files.find((f) => !f.daily)?.id, day, dayId: files.find((f) => f.name === `blank-out-${day}.enc.json`)?.id };
    ids.main = await upload(MAIN_NAME, content, ids.main);
    ids.dayId = await upload(`blank-out-${day}.enc.json`, content, ids.dayId);
    // Tieni solo gli ultimi 7 snapshot giornalieri (il nome contiene la data: ordine lessicografico = cronologico)
    const old = files
      .filter((f) => f.daily && f.name !== `blank-out-${day}.enc.json`)
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(KEEP_DAILY - 1);
    for (const f of old) await api(`${API}/${f.id}`, { method: 'DELETE' }).catch(() => {});
    return;
  }
  ids.main = await upload(MAIN_NAME, content, ids.main);
  ids.dayId = await upload(`blank-out-${day}.enc.json`, content, ids.dayId);
}

// ---- Backup ----
let dirty = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<boolean> | null = null;

const isStale = () => !drive.lastSyncAt || Date.now() - new Date(drive.lastSyncAt).getTime() > STALE_MS;

function errorText(e: unknown): string {
  if (e instanceof ReauthError) return 'Serve ricollegare Google per continuare il backup.';
  if (e instanceof HttpError) return e.status === 403 || e.status === 429 ? 'Google Drive è momentaneamente occupato: riproverò più tardi.' : 'Google Drive non ha accettato il backup: riproverò più tardi.';
  if (e instanceof TypeError) return 'Connessione assente: riproverò appena possibile.';
  return e instanceof Error ? e.message : 'Backup non riuscito.';
}

/** Cifra e carica subito. Restituisce true se il backup è andato a buon fine. */
export function backupNow(): Promise<boolean> {
  if (running) {
    dirty = true; // ci sono modifiche arrivate durante l'invio: un altro giro dopo
    return running;
  }
  running = doBackup().finally(() => {
    running = null;
    if (dirty && drive.enabled && drive.hasKey && !drive.needsReauth) schedule();
  });
  return running;
}

async function doBackup(): Promise<boolean> {
  await keyLoaded;
  if (!drive.configured || !drive.enabled) return false;
  if (!localKey) {
    drive.hasKey = false;
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    dirty = true; // offline: si riprova all'evento "online"
    return false;
  }
  clearTimeout(timer);
  dirty = false;
  drive.syncing = true;
  try {
    const payload = exportBackup($state.snapshot(settings) as unknown as Record<string, unknown>);
    const file = await encryptJson(payload, localKey.key, localKey.salt);
    await uploadAll(JSON.stringify(file));
    const now = new Date().toISOString();
    drive.lastSyncAt = now;
    drive.lastError = null;
    drive.needsReauth = false;
    settings.lastBackupAt = now;
    saveSettings();
    return true;
  } catch (e) {
    dirty = true;
    if (e instanceof HttpError && e.status === 404) ids = {}; // file rimosso da fuori: al prossimo giro si ricrea
    if (e instanceof ReauthError) drive.needsReauth = true;
    drive.lastError = errorText(e);
    return false;
  } finally {
    drive.syncing = false;
    persist();
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

function flush() {
  clearTimeout(timer);
  if (dirty && drive.enabled && drive.hasKey && !drive.needsReauth) void backupNow();
}

let started = false;
/** Da chiamare una volta dopo loadAll(): osserva i dati e fa il backup in automatico. */
export function startAutoBackup() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let last: string | null = null;

  $effect.root(() => {
    $effect(() => {
      if (!data.ready) return;
      const { ready: _r, ...rest } = data;
      const s = JSON.stringify(rest);
      if (last === null || s === last) {
        last = s; // primo giro: è lo stato caricato, non una modifica
        return;
      }
      last = s;
      untrack(() => {
        dirty = true;
        if (drive.enabled && drive.hasKey && !drive.needsReauth) schedule();
      });
    });
  });

  // App in background (cambio app, blocco schermo): invia subito quello che è in sospeso
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('online', flush);

  // All'avvio: se l'ultimo backup è vecchio di oltre 24 h, ne fa uno
  void keyLoaded.then(() => {
    if (drive.enabled && drive.hasKey && isStale()) {
      dirty = true;
      void backupNow();
    }
  });
}

// ---- Attivazione / disattivazione ----
export function passwordProblem(pw: string, confirm: string): string | null {
  if (pw.length < MIN_PASSWORD) return `La password deve avere almeno ${MIN_PASSWORD} caratteri.`;
  if (pw !== confirm) return 'Le due password non coincidono.';
  return null;
}

/** Da chiamare dentro il click di "Collega Google e attiva". */
export async function enableAutoBackup(password: string): Promise<boolean> {
  if (password.length < MIN_PASSWORD) throw new Error(`La password deve avere almeno ${MIN_PASSWORD} caratteri.`);
  await connectGoogle(); // prima di ogni altro await: il popup deve partire dal gesto
  const salt = newSalt();
  const key = await deriveKey(password, salt);
  await useKey(key, salt);
  return backupNow();
}

async function useKey(key: CryptoKey, salt: Uint8Array<ArrayBuffer>) {
  await saveLocalKey(key, salt);
  localKey = { key, salt };
  drive.hasKey = true;
  drive.enabled = true;
  drive.lastError = null;
  dirty = true;
  persist();
}

/** Revoca l'accesso, spegne il backup e cancella la chiave locale. I file su Drive restano. */
export async function disconnect() {
  clearTimeout(timer);
  const t = token?.value;
  token = null;
  ids = {};
  dirty = false;
  if (t) {
    try {
      await prepareGoogle();
      await new Promise<void>((r) => {
        gis()!.revoke(t, () => r());
        setTimeout(r, 5000);
      });
    } catch {}
  }
  await clearLocalKey();
  localKey = null;
  Object.assign(drive, { enabled: false, connected: false, needsReauth: false, hasKey: false, lastError: null });
  persist();
}

// ---- Ripristino ----
/** Elenco dei backup su Drive, dal più recente. Serve un token: chiamare dopo connectGoogle(). */
export async function listBackups(): Promise<DriveBackupInfo[]> {
  const files = await listFiles();
  return files.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
}

// Chiave ottenuta dall'ultimo restore riuscito: riusata per riattivare il backup senza rifare PBKDF2
let restored: { key: CryptoKey; salt: Uint8Array<ArrayBuffer> } | null = null;

/** Scarica e decifra. Non importa nulla: la UI mostra il riepilogo e chiede conferma. */
export async function restore(fileId: string, password: string): Promise<BackupFile> {
  const res = await api(`${API}/${encodeURIComponent(fileId)}?alt=media`);
  const file: unknown = await res.json();
  if (!isEncryptedFile(file)) throw new Error('Questo file non sembra un backup di Blank Out.');
  const { value, key, salt } = await decryptJson<unknown>(file, password); // password errata → "Password non corretta"
  if (!isBackup(value)) throw new Error('Il backup è danneggiato o incompleto.');
  restored = { key, salt };
  return value;
}

/** Sostituisce i dati del dispositivo con il backup e riattiva il backup automatico con la stessa password. */
export async function applyRestore(b: BackupFile): Promise<void> {
  await importBackup(b);
  if (b.settings) replaceSettings({ ...(b.settings as Partial<Settings>), onboarded: true });
  if (restored) {
    await useKey(restored.key, restored.salt);
    restored = null;
    // I dati ora coincidono col backup letto: niente invio finché non cambia qualcosa
    // (così un ripristino da uno snapshot vecchio non sovrascrive subito il file principale)
    dirty = false;
    clearTimeout(timer);
  }
}
