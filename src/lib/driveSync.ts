// Logica pura del backup su Google Drive (token, modifiche in sospeso, avviso in Home).
// Separata da drive.svelte.ts per poterla testare senza browser né Google.
//
// Limite di fondo, da tenere presente: un'app solo-browser (senza server) riceve da Google
// Identity Services soltanto access token di circa 1 ora, mai un refresh token. Il rinnovo
// passa sempre da un popup di Google, che i browser lasciano aprire solo dentro un tocco
// dell'utente. Un accesso davvero "permanente" richiederebbe un piccolo backend (o una
// funzione serverless) che faccia il flusso "authorization code" e custodisca il refresh
// token con un client secret: qui volutamente non c'è. Quello che si può fare senza server:
// riusare il token finché vale, far sì che il popup sia di un solo tocco e si chiuda da solo
// (account ricordato, niente consenso ripetuto), e chiedere di ricollegarsi solo quando serve davvero.

export interface StoredToken {
  value: string;
  exp: number; // epoch ms
}

/** Margine prima della scadenza: un token che scade tra meno di 1 minuto non si usa. */
export const TOKEN_MARGIN_MS = 60_000;

/** Dopo quanto tempo con modifiche non salvate su Drive la Home mostra l'avviso. */
export const BANNER_AFTER_MS = 48 * 3600_000;

/** Legge il token salvato, scartando valori malformati (localStorage modificato, versioni vecchie). */
export function parseStoredToken(raw: string | null): StoredToken | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Partial<StoredToken> | null;
    if (t && typeof t.value === 'string' && t.value !== '' && typeof t.exp === 'number' && Number.isFinite(t.exp)) return { value: t.value, exp: t.exp };
  } catch {}
  return null;
}

/** true se il token si può ancora usare adesso (con un minuto di margine). */
export function tokenUsable(t: StoredToken | null, now: number): t is StoredToken {
  return !!t && now < t.exp - TOKEN_MARGIN_MS;
}

/** Scadenza del token a partire da expires_in di Google (secondi, a volte stringa); 1 h se assente o strano. */
export function tokenExpiry(expiresIn: number | string | undefined, now: number): number {
  const s = Number(expiresIn);
  return now + (Number.isFinite(s) && s > 0 ? s : 3600) * 1000;
}

export interface BannerInput {
  enabled: boolean;
  hasKey: boolean;
  needsReauth: boolean;
  pendingSince: string | null | undefined;
  now: number;
}

/**
 * Avviso "backup da aggiornare" in Home: solo se il backup è attivo, serve un tocco per ricollegare
 * Google e ci sono modifiche non ancora su Drive da più di BANNER_AFTER_MS. Nel frattempo le modifiche
 * restano al sicuro sul dispositivo e partono da sole al primo token valido.
 */
export function shouldShowSyncBanner(i: BannerInput): boolean {
  if (!i.enabled || !i.hasKey || !i.needsReauth || !i.pendingSince) return false;
  const since = new Date(i.pendingSince).getTime();
  if (!Number.isFinite(since)) return true; // data illeggibile: meglio avvisare
  return i.now - since >= BANNER_AFTER_MS;
}

/** Impronta (FNV-1a 32 bit) dei dati: serve solo a capire se sono cambiati dall'ultimo backup. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + ':' + s.length.toString(36);
}
