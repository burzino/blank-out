// Funzioni pure di supporto per Calendario, Statistiche e Report (nessuna dipendenza dalla UI).
import { intensityLevel } from './catalog';
import { addDays, dayKey, daysBetween, episodeDays, keyToDate } from './clinic';
import type { DayInfo, Episode } from './types';
import type { TriggerRisk } from './advisor/types';

const pad = (n: number) => String(n).padStart(2, '0');

export interface DayMark {
  level: 0 | 1 | 2 | 3;
  maxPain: number;
  aura: boolean;
  med: boolean;
  episodes: Episode[];
}

/** Riepilogo per giorno (intensità massima, aura, farmaci) nell'intervallo [from, to]. */
export function dayMarks(episodes: Episode[], from: string, to: string, now = new Date()): Map<string, DayMark> {
  const map = new Map<string, DayMark>();
  const get = (k: string) => {
    let m = map.get(k);
    if (!m) map.set(k, (m = { level: 0, maxPain: 0, aura: false, med: false, episodes: [] }));
    return m;
  };
  for (const e of episodes) {
    const pain = Math.max(e.intensity, e.peak ?? 0);
    for (const k of episodeDays(e, now)) {
      if (k < from || k > to) continue;
      const m = get(k);
      m.maxPain = Math.max(m.maxPain, pain);
      m.level = intensityLevel(m.maxPain);
      if (e.aura.length) m.aura = true;
      if (!m.episodes.includes(e)) m.episodes.push(e);
    }
    for (const med of e.meds) {
      const k = dayKey(med.time);
      if (k >= from && k <= to) get(k).med = true;
    }
  }
  for (const m of map.values()) m.episodes.sort((a, b) => a.start.localeCompare(b.start));
  return map;
}

export const dayInfoMap = (days: DayInfo[]) => new Map(days.map((d) => [d.date, d]));

// ---------- Mesi ----------
export interface MonthSpan {
  year: number;
  month: number; // 0-11
  from: string;
  to: string;
  label: string; // "novembre 2026"
  short: string; // "nov"
}

export function monthSpan(year: number, month: number): MonthSpan {
  const d = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0).getDate();
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`,
    to: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(last)}`,
    label: d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
    short: d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')
  };
}

/** Gli ultimi `n` mesi di calendario fino a quello di `today` (dal più vecchio). */
export function lastMonths(today: string, n: number): MonthSpan[] {
  const t = keyToDate(today);
  return Array.from({ length: n }, (_, i) => monthSpan(t.getFullYear(), t.getMonth() - (n - 1 - i)));
}

/** Mesi di calendario toccati dall'intervallo [from, to]. */
export function monthsIn(from: string, to: string): MonthSpan[] {
  const out: MonthSpan[] = [];
  const f = keyToDate(from);
  let m = monthSpan(f.getFullYear(), f.getMonth());
  while (m.from <= to) {
    out.push(m);
    m = monthSpan(m.year, m.month + 1);
  }
  return out;
}

/** Celle della griglia mensile, settimane da lunedì: null = cella vuota. */
export function monthCells(year: number, month: number): (string | null)[] {
  const m = monthSpan(year, month);
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const n = keyToDate(m.to).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= n; d++) cells.push(`${m.from.slice(0, 8)}${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Finestra mobile di `months` × 30 giorni che termina in `today`. */
export const rollingWindow = (today: string, months: number) => ({ from: addDays(today, -(30 * months - 1)), to: today });

/** Primo giorno con dati registrati (episodi o giorni), o null. */
export function firstRecord(episodes: Episode[], days: DayInfo[]): string | null {
  let first: string | null = null;
  for (const e of episodes) {
    const k = dayKey(e.start);
    if (!first || k < first) first = k;
  }
  for (const d of days) if (!first || d.date < first) first = d.date;
  return first;
}

/** Restringe la finestra all'inizio del diario, così la normalizzazione a 30 giorni non sottostima. */
export function effectiveWindow(from: string, to: string, first: string | null) {
  const f = first && first > from ? (first > to ? to : first) : from;
  return { from: f, to, days: daysBetween(f, to) + 1 };
}

/** Posizione frazionaria (0…n) di una data sull'asse dei mesi; null se fuori. */
export function monthAxisPos(months: MonthSpan[], k: string): number | null {
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    if (k >= m.from && k <= m.to) {
      const len = keyToDate(m.to).getDate();
      return i + (keyToDate(k).getDate() - 1) / len;
    }
  }
  return null;
}

// ---------- Formattazione ----------
export const fmtDay = (k: string) => keyToDate(k).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDayShort = (k: string) => keyToDate(k).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
export const fmt1 = (n: number | null | undefined) => (n == null || !isFinite(n) ? '–' : n.toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
export const pct = (x: number | null | undefined) => (x == null || !isFinite(x) ? '–' : `${Math.round(x * 100)}%`);

/** Conteggio semplice di valori (con frequenza su `total`). */
export function tally(lists: string[][], total: number) {
  const map = new Map<string, number>();
  for (const l of lists) for (const id of new Set(l)) map.set(id, (map.get(id) ?? 0) + 1);
  return [...map.entries()].map(([id, count]) => ({ id, count, pct: total ? count / total : 0 })).sort((a, b) => b.count - a.count);
}

// ---------- Riepilogo check-in (report) ----------
export interface CheckinSummary {
  days: number; // giorni del periodo
  done: number; // giorni con check-in completo (sonno e stress)
  compliance: number; // done / days
  sleep: Record<'poco' | 'ok' | 'troppo', number>; // quote sui check-in con il sonno indicato
  sleepN: number;
  stress: Record<'basso' | 'medio' | 'alto', number>;
  stressN: number;
}

/** Aderenza al check-in e distribuzione di sonno e stress nel periodo [from, to]. */
export function checkinSummary(days: DayInfo[], from: string, to: string): CheckinSummary {
  const n = Math.max(0, daysBetween(from, to) + 1);
  const sleep = { poco: 0, ok: 0, troppo: 0 };
  const stress = { basso: 0, medio: 0, alto: 0 };
  let done = 0;
  let sleepN = 0;
  let stressN = 0;
  for (const d of days) {
    const c = d.checkin;
    if (!c || d.date < from || d.date > to) continue;
    if (c.sleep && c.stress) done++;
    if (c.sleep && c.sleep in sleep) {
      sleep[c.sleep]++;
      sleepN++;
    }
    if (c.stress && c.stress in stress) {
      stress[c.stress]++;
      stressN++;
    }
  }
  const share = <K extends string>(r: Record<K, number>, tot: number) => {
    for (const k in r) r[k] = tot ? r[k] / tot : 0;
    return r;
  };
  return { days: n, done, compliance: n ? done / n : 0, sleep: share(sleep, sleepN), sleepN, stress: share(stress, stressN), stressN };
}

/** Fattori personali da mostrare al medico: stime con quota personale (misto/personale) e RR ≥ minRR. */
export function reportFactors(list: TriggerRisk[], minRR = 1.2, max = 5): TriggerRisk[] {
  return list.filter((t) => t.basis !== 'generale' && t.rr >= minRR).sort((a, b) => b.rr - a.rr).slice(0, max);
}

/** Lato prevalente (id) o null. */
export function prevalentSide(sides: Record<string, number>) {
  const e = Object.entries(sides).sort((a, b) => b[1] - a[1])[0];
  return e ? { id: e[0], count: e[1] } : null;
}
