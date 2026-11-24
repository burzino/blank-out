// Logica clinica pura, senza dipendenze dalla UI. Specifica: neurologo del team (ICHD-3, SNOOP4, MIDAS, HIT-6).
import { THRESHOLDS as T, MED_CLASSES, TYPICAL_AURAS, classLabel, intensityLevel, mohGroup } from './catalog';
import type { DayInfo, Episode, MedIntake, Prophylaxis, Questionnaire } from './types';

// ---------- Date (giorni di calendario locali) ----------
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const keyToDate = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (k: string, n: number) => {
  const d = keyToDate(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
export const daysBetween = (a: string, b: string) => Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / 86400000);

export function rangeKeys(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Giorni di calendario toccati dall'episodio (un episodio che passa la mezzanotte conta in entrambi i giorni). */
export function episodeDays(e: Episode, now = new Date()): string[] {
  const end = e.end ? new Date(e.end) : now;
  const from = dayKey(e.start);
  const to = dayKey(end < new Date(e.start) ? e.start : end);
  return rangeKeys(from, to);
}

export const durationMin = (e: Episode, now = new Date()) =>
  Math.max(0, ((e.end ? new Date(e.end) : now).getTime() - new Date(e.start).getTime()) / 60000);

export function formatDuration(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.floor(h / 24)} g ${h % 24} h`;
}

// ---------- Classificazione ICHD-3 (indicativa, singolo episodio) ----------
export type ClassId = 'grappolo' | 'emicrania_aura' | 'emicrania' | 'prob_emicrania' | 'tensiva' | 'prob_tensiva' | 'non_class';

export const CLASS_LABEL: Record<ClassId, string> = {
  grappolo: 'Compatibile con cefalea a grappolo',
  emicrania_aura: 'Compatibile con emicrania con aura',
  emicrania: 'Compatibile con emicrania senza aura',
  prob_emicrania: 'Probabile emicrania',
  tensiva: 'Compatibile con cefalea tensiva',
  prob_tensiva: 'Probabile cefalea tensiva',
  non_class: 'Non classificabile'
};

export interface Classification {
  id: ClassId;
  label: string;
  incomplete: boolean;
  atypicalAura: boolean;
}

const UNILATERAL = ['sinistro', 'destro', 'alternante'];
const isMigraineClass = (c: ClassId) => c === 'emicrania' || c === 'emicrania_aura' || c === 'prob_emicrania';
const MIGRAINE_SPECIFIC: string[] = ['triptano', 'gepante', 'ditano'];

export function classify(e: Episode, now = new Date()): Classification {
  const dur = e.end ? durationMin(e, now) : null;
  const pain = Math.max(e.intensity, e.peak ?? 0);
  const has = (list: string[], id: string) => list.includes(id);
  const unilateral = !!e.side && UNILATERAL.includes(e.side);
  const treated = e.meds.some((m) => m.cls !== 'antiemetico');
  const atypicalAura = e.aura.some((a) => !TYPICAL_AURAS.includes(a));
  const incomplete = !e.side || e.quality.length === 0 || e.symptoms.length === 0 || dur === null;
  const result = (id: ClassId): Classification => ({ id, label: CLASS_LABEL[id], incomplete, atypicalAura });

  // Senza dati qualitativi non si può dire nulla: dati non compilati non equivalgono a sintomi assenti
  if (!e.side && !e.quality.length && !e.symptoms.length && !e.aura.length) return result('non_class');

  // 1. Grappolo
  if (
    pain >= 7 &&
    (e.side === 'sinistro' || e.side === 'destro') &&
    (has(e.locations, 'orbitale') || has(e.locations, 'temporale')) &&
    dur !== null && dur >= 15 && dur <= 180 &&
    e.autonomic.length > 0
  )
    return result('grappolo');

  // 2. Emicrania con aura (aura tipica 5-60 min; se la durata non è nota la consideriamo)
  const typical = e.aura.some((a) => TYPICAL_AURAS.includes(a));
  const auraOk = e.auraDurationMin == null || (e.auraDurationMin >= 5 && e.auraDurationMin <= 60);
  if (typical && auraOk) return result('emicrania_aura');

  // 3. Emicrania senza aura
  const nausea = has(e.symptoms, 'nausea') || has(e.symptoms, 'vomito');
  const photo = has(e.symptoms, 'fotofobia');
  const phono = has(e.symptoms, 'fonofobia');
  const migDurOk = dur === null ? null : (dur >= 240 && dur <= 72 * 60) || (treated && dur < 240);
  const migC = [unilateral, has(e.quality, 'pulsante'), pain >= 4, has(e.symptoms, 'peggiora_attivita')].filter(Boolean).length;
  const migD = nausea || (photo && phono);
  const migCrit = [migDurOk !== false, migC >= 2, migD];
  if (migDurOk === true && migC >= 2 && migD) return result('emicrania');

  // 4. Tensiva
  const ttDurOk = dur === null ? null : dur >= 30 && dur <= 7 * 24 * 60;
  const ttC = [e.side === 'bilaterale', has(e.quality, 'gravativo'), pain <= 6, !has(e.symptoms, 'peggiora_attivita')].filter(Boolean).length;
  const ttD = !nausea && !(photo && phono);
  const ttCrit = [ttDurOk !== false, ttC >= 2, ttD];
  if (ttDurOk === true && ttC >= 2 && ttD) return result('tensiva');

  // 5. Probabile: tutti i criteri tranne uno (prevale l'emicrania)
  const missing = (c: boolean[]) => c.filter((x) => !x).length;
  if (missing(migCrit) <= 1 && (migC >= 1 || migD)) return result('prob_emicrania');
  if (missing(ttCrit) <= 1 && ttC >= 1) return result('prob_tensiva');

  return result('non_class');
}

// ---------- Metriche ----------
export interface Stats {
  days: number; // lunghezza finestra
  headacheDays: number;
  migraineDays: number;
  medDays: number;
  medDaysByClass: Record<string, number>;
  per30: (n: number) => number;
  episodes: Episode[];
  avgIntensity: number | null;
  levelDist: [number, number, number];
  avgDurationMin: number | null;
  medianDurationMin: number | null;
  bedDays: number;
  reducedDays: number;
  triggers: { id: string; count: number; pct: number }[];
  symptoms: { id: string; count: number; pct: number }[];
  efficacy: { name: string; cls: string; n: number; complete: number; partial: number; none: number; recurrence: number; days: number }[];
  classes: Record<ClassId, number>;
  auraCount: number;
  sides: Record<string, number>;
}

const isMigraineSpecific = (m: MedIntake) => MIGRAINE_SPECIFIC.includes(m.cls);

export function isMigraineEpisode(e: Episode, now = new Date()) {
  return isMigraineClass(classify(e, now).id) || e.meds.some(isMigraineSpecific);
}

function countBy(items: string[][], total: number) {
  const map = new Map<string, number>();
  for (const list of items) for (const id of new Set(list)) map.set(id, (map.get(id) ?? 0) + 1);
  return [...map.entries()]
    .map(([id, count]) => ({ id, count, pct: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

export function computeStats(all: Episode[], from: string, to: string, now = new Date()): Stats {
  const days = daysBetween(from, to) + 1;
  const inRange = (k: string) => k >= from && k <= to;
  const episodes = all.filter((e) => episodeDays(e, now).some(inRange));
  const headache = new Set<string>();
  const migraine = new Set<string>();
  const bed = new Set<string>();
  const reduced = new Set<string>();
  const medDayAny = new Set<string>();
  const medDayClass = new Map<string, Set<string>>();
  const classes = { grappolo: 0, emicrania_aura: 0, emicrania: 0, prob_emicrania: 0, tensiva: 0, prob_tensiva: 0, non_class: 0 } as Record<ClassId, number>;
  const sides: Record<string, number> = {};
  const eff = new Map<string, Stats['efficacy'][number] & { daySet: Set<string> }>();
  let auraCount = 0;

  for (const e of episodes) {
    const ks = episodeDays(e, now).filter(inRange);
    const c = classify(e, now).id;
    classes[c]++;
    if (e.aura.length) auraCount++;
    if (e.side) sides[e.side] = (sides[e.side] ?? 0) + 1;
    const mig = isMigraineClass(c) || e.meds.some(isMigraineSpecific);
    for (const k of ks) {
      headache.add(k);
      if (mig) migraine.add(k);
      if (e.disability === 'a_letto') bed.add(k);
      if (e.disability === 'ridotta') reduced.add(k);
    }
    for (const m of e.meds) {
      const k = dayKey(m.time);
      if (!inRange(k)) continue;
      medDayAny.add(k);
      if (!medDayClass.has(m.cls)) medDayClass.set(m.cls, new Set());
      medDayClass.get(m.cls)!.add(k);
      const key = m.name.toLowerCase();
      if (!eff.has(key)) eff.set(key, { name: m.name, cls: m.cls, n: 0, complete: 0, partial: 0, none: 0, recurrence: 0, days: 0, daySet: new Set() });
      const r = eff.get(key)!;
      r.daySet.add(k);
      if (m.efficacy) {
        r.n++;
        if (m.efficacy === 'completa') r.complete++;
        else if (m.efficacy === 'parziale') r.partial++;
        else r.none++;
        if (m.recurrence24h) r.recurrence++;
      }
    }
  }

  const closed = episodes.filter((e) => e.end);
  const durs = closed.map((e) => durationMin(e, now)).sort((a, b) => a - b);
  const levelDist: [number, number, number] = [0, 0, 0];
  for (const e of episodes) {
    const l = intensityLevel(Math.max(e.intensity, e.peak ?? 0));
    if (l > 0) levelDist[l - 1]++;
  }
  const medDaysByClass: Record<string, number> = {};
  for (const [c, s] of medDayClass) medDaysByClass[c] = s.size;

  return {
    days,
    headacheDays: headache.size,
    migraineDays: migraine.size,
    medDays: medDayAny.size,
    medDaysByClass,
    per30: (n: number) => (days ? (n / days) * 30 : 0),
    episodes,
    avgIntensity: episodes.length ? episodes.reduce((s, e) => s + Math.max(e.intensity, e.peak ?? 0), 0) / episodes.length : null,
    levelDist,
    avgDurationMin: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null,
    medianDurationMin: durs.length ? (durs.length % 2 ? durs[(durs.length - 1) / 2] : (durs[durs.length / 2 - 1] + durs[durs.length / 2]) / 2) : null,
    bedDays: bed.size,
    reducedDays: reduced.size,
    triggers: countBy(episodes.map((e) => e.triggers), episodes.length),
    symptoms: countBy(episodes.map((e) => e.symptoms), episodes.length),
    efficacy: [...eff.values()].map(({ daySet, ...r }) => ({ ...r, days: daySet.size })).sort((a, b) => b.days - a.days),
    classes,
    auraCount,
    sides
  };
}

/** Mediana di una lista di numeri (null se vuota). */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

// Ritardo massimo plausibile tra inizio dell'attacco e assunzione: oltre, è quasi sempre un errore di registrazione.
const MAX_DELAY_MIN = 72 * 60;
// Un'assunzione registrata poco prima dell'inizio (orari arrotondati) conta come immediata; prima ancora si scarta.
const EARLY_SLACK_MIN = 60;

/** Minuti dall'inizio dell'attacco all'assunzione; null se l'orario non è plausibile. */
export function intakeDelayMin(e: Episode, m: MedIntake): number | null {
  const d = (new Date(m.time).getTime() - new Date(e.start).getTime()) / 60000;
  if (!isFinite(d) || d < -EARLY_SLACK_MIN || d > MAX_DELAY_MIN) return null;
  return Math.max(0, d);
}

export interface IntakeTiming {
  timed: number; // assunzioni con ritardo valutabile
  medianDelayMin: number | null;
  within1h: number; // assunzioni entro 60 minuti dall'inizio
}

/** Tempo dall'inizio dell'attacco all'assunzione, per farmaco (chiave: nome in minuscolo, come computeStats). */
export function intakeTimingByDrug(episodes: Episode[], from: string, to: string): Map<string, IntakeTiming> {
  const delays = new Map<string, number[]>();
  for (const e of episodes)
    for (const m of e.meds) {
      const k = dayKey(m.time);
      if (k < from || k > to) continue;
      const d = intakeDelayMin(e, m);
      if (d == null) continue;
      const key = m.name.toLowerCase();
      if (!delays.has(key)) delays.set(key, []);
      delays.get(key)!.push(d);
    }
  const out = new Map<string, IntakeTiming>();
  for (const [key, ds] of delays) out.set(key, { timed: ds.length, medianDelayMin: median(ds), within1h: ds.filter((d) => d <= 60).length });
  return out;
}

/** Durata mediana dell'aura (minuti) e numero di episodi con durata registrata. */
export function auraDurationSummary(episodes: Episode[]) {
  const ds = episodes.filter((e) => e.aura.length && e.auraDurationMin != null && e.auraDurationMin > 0).map((e) => e.auraDurationMin!);
  return { n: ds.length, medianMin: median(ds) };
}

// ---------- Avvisi: uso eccessivo di farmaci e cronicità ----------
export interface Alert {
  id: string;
  level: 'warn' | 'danger';
  title: string;
  text: string;
}

function medDays(episodes: Episode[], from: string, to: string, filter: (m: MedIntake) => boolean) {
  const s = new Set<string>();
  for (const e of episodes)
    for (const m of e.meds) {
      const k = dayKey(m.time);
      if (k >= from && k <= to && filter(m)) s.add(k);
    }
  return s.size;
}

function headacheDaysIn(episodes: Episode[], from: string, to: string, now: Date) {
  const s = new Set<string>();
  for (const e of episodes) for (const k of episodeDays(e, now)) if (k >= from && k <= to) s.add(k);
  return s.size;
}

export interface MohRow {
  key: string;
  label: string;
  days: number;
  limit: number;
  status: 'ok' | 'warn' | 'over';
  persistent: boolean;
}

/** Stato MOH sui 30 giorni mobili che terminano in `today`. */
export function mohStatus(episodes: Episode[], today = dayKey(new Date())): MohRow[] {
  const groups: { key: string; label: string; filter: (m: MedIntake) => boolean; limit: number; warn: number }[] = [];
  for (const c of MED_CLASSES) {
    if (!c.moh) continue;
    groups.push({
      key: c.id,
      label: c.label,
      filter: (m) => m.cls === c.id,
      limit: c.moh === 'simple' ? T.mohSimple : T.mohComplex,
      warn: c.moh === 'simple' ? T.mohSimpleWarn : T.mohComplexWarn
    });
  }
  groups.push({ key: 'complex_all', label: 'Triptani, ergotamina, oppioidi e combinati (insieme)', filter: (m) => mohGroup(m.cls) === 'complex', limit: T.mohComplex, warn: T.mohComplexWarn });
  groups.push({ key: 'simple_all', label: 'Antidolorifici semplici (insieme)', filter: (m) => mohGroup(m.cls) === 'simple', limit: T.mohSimple, warn: T.mohSimpleWarn });

  const window = (end: string) => [addDays(end, -29), end] as const;
  return groups.map((g) => {
    const [f, t] = window(today);
    const days = medDays(episodes, f, t, g.filter);
    const persistent = [0, 30, 60].every((back) => {
      const [f2, t2] = window(addDays(today, -back));
      return medDays(episodes, f2, t2, g.filter) >= g.limit;
    });
    return { key: g.key, label: g.label, days, limit: g.limit, status: days >= g.limit ? 'over' : days >= g.warn ? 'warn' : 'ok', persistent };
  });
}

export function computeAlerts(episodes: Episode[], now = new Date()): Alert[] {
  const today = dayKey(now);
  const alerts: Alert[] = [];
  const rows = mohStatus(episodes, today);
  const singleOver = rows.some((r) => r.status !== 'ok' && !r.key.endsWith('_all'));
  for (const r of rows) {
    if (r.status === 'ok') continue;
    // I totali di gruppo si mostrano solo se nessuna classe singola è già in avviso
    if (r.key.endsWith('_all') && singleOver) continue;
    const label = r.key.endsWith('_all') ? r.label.toLowerCase() : classLabel(r.key).toLowerCase();
    if (r.status === 'warn')
      alerts.push({
        id: 'moh-' + r.key,
        level: 'warn',
        title: `${capitalize(label)}: ${r.days} giorni su 30`,
        text: `Negli ultimi 30 giorni hai assunto ${label} in ${r.days} giorni. Superare ${r.limit} giorni al mese può far peggiorare il mal di testa (cefalea da uso eccessivo di farmaci). Valuta con il tuo medico come gestire i prossimi attacchi.`
      });
    else
      alerts.push({
        id: 'moh-' + r.key,
        level: 'danger',
        title: `${capitalize(label)}: oltre la soglia`,
        text: `Hai assunto ${label} in ${r.days} degli ultimi 30 giorni, oltre la soglia di ${r.limit}. Questo uso può cronicizzare il mal di testa. Non sospendere i farmaci da solo: contatta il tuo medico o il centro cefalee.${r.persistent ? ' Uso eccessivo persistente da oltre 3 mesi.' : ''}`
      });
  }
  const hd = headacheDaysIn(episodes, addDays(today, -29), today, now);
  if (hd >= T.chronicDays)
    alerts.push({
      id: 'chronic',
      level: 'warn',
      title: `Mal di testa in ${hd} giorni su 30`,
      text: `Hai avuto mal di testa in ${hd} degli ultimi 30 giorni. Se succede da più di 3 mesi può trattarsi di una cefalea cronica: parlane con il neurologo, esistono terapie di prevenzione efficaci.`
    });
  return alerts;
}

/** Cefalea cronica: ≥15 giorni/30 per 3 finestre consecutive; emicrania cronica se anche ≥8 giorni di emicrania. */
export function chronicStatus(episodes: Episode[], now = new Date()) {
  const today = dayKey(now);
  let months = 0;
  let migraineOk = true;
  for (let i = 0; i < 12; i++) {
    const t = addDays(today, -30 * i);
    const f = addDays(t, -29);
    const s = computeStats(episodes, f, t, now);
    if (s.headacheDays < T.chronicDays) break;
    months++;
    if (i < 3 && s.migraineDays < T.chronicMigraineDays) migraineOk = false;
  }
  return { months, chronic: months >= 1, possibleChronicMigraine: months >= 3 && migraineOk };
}

// ---------- Ciclo mestruale ----------
export function periodStarts(days: DayInfo[]): string[] {
  const set = new Set(days.filter((d) => d.period || d.periodStart).map((d) => d.date));
  // Primo giorno = giorno di flusso non preceduto da un altro giorno di flusso, o marcato esplicitamente
  return [...set].filter((k) => !set.has(addDays(k, -1)) || days.find((d) => d.date === k)?.periodStart).sort();
}

export function cycleCorrelation(episodes: Episode[], days: DayInfo[], now = new Date()) {
  const starts = periodStarts(days);
  const migraine = episodes.filter((e) => isMigraineEpisode(e, now));
  if (!starts.length || !migraine.length) return null;
  const first = starts[0];
  const relevant = migraine.filter((e) => dayKey(e.start) >= addDays(first, -2));
  const inWindow = (k: string, s: string) => {
    const d = daysBetween(s, k);
    return d >= -2 && d <= 2; // giorno 1 = s, senza giorno 0: finestra ICHD da −2 a +3
  };
  const peri = relevant.filter((e) => starts.some((s) => inWindow(dayKey(e.start), s)));
  const last3 = starts.slice(-3);
  const cyclesWithAttack = last3.filter((s) => relevant.some((e) => inWindow(dayKey(e.start), s))).length;
  return {
    total: relevant.length,
    perimenstrual: peri.length,
    pct: relevant.length ? peri.length / relevant.length : 0,
    cycles: last3.length,
    cyclesWithAttack,
    pattern: last3.length >= 3 && cyclesWithAttack >= 2
  };
}

// ---------- Questionari ----------
export function midasGrade(score: number) {
  if (score <= 5) return { grade: 'I', label: 'Disabilità minima o assente' };
  if (score <= 10) return { grade: 'II', label: 'Disabilità lieve' };
  if (score <= 20) return { grade: 'III', label: 'Disabilità moderata' };
  return { grade: 'IV', label: 'Disabilità grave' };
}

export function hit6Impact(score: number) {
  if (score <= 49) return 'Impatto scarso o nullo';
  if (score <= 55) return 'Impatto moderato';
  if (score <= 59) return 'Impatto rilevante';
  return 'Impatto grave';
}

export function questionnaireDue(list: Questionnaire[], type: 'midas' | 'hit6', now = new Date()) {
  const last = list.find((q) => q.type === type);
  if (!last) return true;
  return daysBetween(last.date, dayKey(now)) >= (type === 'midas' ? 90 : 28);
}

// ---------- Profilassi ----------
export function prophylaxisEfficacy(p: Prophylaxis, episodes: Episode[], now = new Date()) {
  const today = dayKey(now);
  const firstRecord = episodes.length ? episodes.map((e) => dayKey(e.start)).sort()[0] : today;
  const before = addDays(p.startDate, -1);
  const longBaseline = daysBetween(firstRecord, before) >= 89;
  const bFrom = addDays(before, longBaseline ? -89 : -29);
  const base = computeStats(episodes, bFrom, before, now);
  const baseline = base.per30(base.migraineDays);
  const end = p.endDate && p.endDate < today ? p.endDate : today;
  const cur = computeStats(episodes, addDays(end, -29), end, now);
  const current = cur.migraineDays;
  const isBotox = /botulin/i.test(p.name);
  const needDays = isBotox ? 180 : 90;
  const elapsed = daysBetween(p.startDate, end);
  const change = baseline > 0 ? (current - baseline) / baseline : null;
  return {
    baseline,
    current,
    change,
    evaluable: elapsed >= needDays,
    daysToEvaluation: Math.max(0, needDays - elapsed),
    responder: change !== null && change <= -T.responder,
    responderChronic: change !== null && change <= -T.responderChronic
  };
}

// ---------- Red flags automatici ----------
export function autoRedFlag(e: Episode, history: Episode[]): string | null {
  const others = history.filter((h) => h.id !== e.id);
  if (e.aura.includes('motoria') && !others.some((h) => h.aura.includes('motoria'))) return 'Prima aura con debolezza di un lato';
  if ((e.auraDurationMin ?? 0) > 60) return 'Aura durata più di 60 minuti';
  const atypical = e.aura.find((a) => !TYPICAL_AURAS.includes(a));
  if (atypical && !others.some((h) => h.aura.includes(atypical))) return 'Aura atipica mai registrata prima';
  return null;
}

// ---------- Default intelligenti ----------
export function rankRecent(episodes: Episode[], pick: (e: Episode) => string[], now = new Date(), days = 90) {
  const from = addDays(dayKey(now), -days);
  const map = new Map<string, number>();
  for (const e of episodes) if (dayKey(e.start) >= from) for (const id of pick(e)) map.set(id, (map.get(id) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Farmaci presi da più di 2 h senza una valutazione dell'efficacia (ultime 48 h). */
export function pendingEfficacy(episodes: Episode[], now = new Date()) {
  const out: { episode: Episode; med: MedIntake }[] = [];
  const t = now.getTime();
  for (const e of episodes.slice(0, 20))
    for (const m of e.meds) {
      const age = (t - new Date(m.time).getTime()) / 60000;
      if (!m.efficacy && age >= T.efficacyAskAfterMin && age <= 48 * 60) out.push({ episode: e, med: m });
    }
  return out;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
