// Fattori di rischio personali stimati con i giorni di check-in come confronto (giorni con e senza il fattore).
// Approccio bayesiano: il log del rischio relativo ha un prior normale centrato sui valori della letteratura;
// i dati dell'utente lo aggiornano (media pesata per la precisione). Pochi dati → resta vicino alla letteratura.
import { PRODROMES, labelOf } from '../catalog';
import { addDays, dayKey, daysBetween, keyToDate, periodStarts, rangeKeys } from '../clinic';
import type { CheckIn, Episode } from '../types';
import type { AdvisorContext, TriggerRisk, WeatherDay } from './types';

// ---------- Prior dalla letteratura (ordini di grandezza, non valori esatti) ----------
// rr = rischio relativo atteso che un attacco inizi oggi o domani; sd = incertezza sul log(rr).
// Fonti principali:
// - Prodromi: Giffin et al., Neurology 2003 (diario elettronico: i prodromi predicevano l'attacco nel ~72% dei casi);
//   Karsan & Goadsby, Cephalalgia 2018; Schulte & May 2016 → RR ~2.5-4.
// - Finestra perimestruale (−2/+3): MacGregor et al., Neurology 2004; Stewart et al., Neurology 2000 → RR ~1.8-2.5.
// - Sonno scarso: Bertisch et al., Neurology 2020 (scarsa efficienza del sonno → emicrania il giorno dopo);
//   Houle et al., Headache 2012 → RR ~1.3-2. Sonno eccessivo: evidenza più debole (~1.2-1.4).
// - Stress alto e "let-down" (calo dello stress): Lipton et al., Neurology 2014 (OR ~1.9 per il calo);
//   Houle et al., Cephalalgia 2012 → RR ~1.3-1.9.
// - Pasto saltato / digiuno: Kelman, Cephalalgia 2007; Martin & Behbehani 2006 → RR ~1.5.
// - Disidratazione: evidenza scarsa (Blau 2004) → RR ~1.2, prior largo.
// - Caffeina: Mostofsky et al., Am J Med 2019 (≥3 porzioni: OR ~1.4); astinenza da caffeina ~1.2-1.5.
// - Alcol: Panconesi 2008 (rassegna); Vives-Mestres et al., Headache 2019 → RR ~1.3-1.6, soprattutto il giorno dopo.
// - Attività fisica regolare: protettiva (Varkey et al., Cephalalgia 2011; Lemmens 2019) → RR ~0.8,
//   quindi "niente movimento" ~1.15-1.25.
// - Calo di pressione: Kimoto et al., Headache 2011; Okuma et al., SpringerPlus 2015 → RR ~1.2-1.4.
// - Weekend: Couturier et al., Cephalalgia 1992 ("emicrania del weekend") → effetto modesto ~1.1.
export const LIT: Record<string, { rr: number; sd: number; label: string }> = {
  sleep_poco: { rr: 1.6, sd: 0.35, label: 'Dormire poco' },
  sleep_troppo: { rr: 1.3, sd: 0.4, label: 'Dormire troppo' },
  stress_alto: { rr: 1.5, sd: 0.4, label: 'Stress alto' },
  meals_saltato: { rr: 1.5, sd: 0.4, label: 'Saltare un pasto' },
  water_poca: { rr: 1.2, sd: 0.4, label: 'Bere poca acqua' },
  caffeine_piu: { rr: 1.35, sd: 0.4, label: 'Più caffè del solito' },
  caffeine_meno: { rr: 1.3, sd: 0.4, label: 'Meno caffè del solito' },
  alcohol: { rr: 1.4, sd: 0.4, label: 'Alcol' },
  no_exercise: { rr: 1.2, sd: 0.3, label: 'Niente movimento' },
  prodrome: { rr: 3.0, sd: 0.5, label: 'Segnali premonitori' },
  perimenstrual: { rr: 2.0, sd: 0.35, label: 'Giorni intorno al ciclo' },
  pressure_drop: { rr: 1.25, sd: 0.3, label: 'Calo di pressione' },
  weekend: { rr: 1.1, sd: 0.3, label: 'Weekend' }
};
const SINGLE_PRODROME = { rr: 2.0, sd: 0.6 };

/** Finestra di esito 0-1 giorni: giorni consecutivi condividono metà della finestra, quindi le osservazioni
 *  non sono indipendenti. Raddoppiamo la varianza (≈ dimezziamo la numerosità effettiva). */
const OVERLAP = 2;
const MAX_DAYS = 3 * 365; // si analizzano al più gli ultimi 3 anni

// ---------- Linea temporale giornaliera condivisa (anche con zero dati) ----------
export interface Timeline {
  keys: string[]; // dal primo giorno registrato a OGGI compreso
  idx: Map<string, number>;
  today: number; // indice di oggi
  start: Uint8Array; // 1 se quel giorno inizia almeno un attacco
  checkin: (CheckIn | undefined)[];
  duringAttack: Uint8Array; // 1 se il check-in è stato compilato durante un attacco già iniziato
  med: Uint8Array; // 1 se quel giorno è stato preso un sintomatico (antiemetici esclusi)
  peri: Int8Array; // 1 finestra perimestruale, 0 no, −1 sconosciuto
  periods: string[];
  cycleLen: number;
  weather: Map<string, WeatherDay>;
  attacks: number; // attacchi iniziati fino a ieri
  checkinDays: number;
}

export function buildTimeline(ctx: AdvisorContext): Timeline {
  const today = dayKey(ctx.now);
  const valid = ctx.episodes.filter((e) => !Number.isNaN(new Date(e.start).getTime()));
  let first = today;
  for (const e of valid) {
    const k = dayKey(e.start);
    if (k < first) first = k;
  }
  for (const d of ctx.days) if ((d.checkin || d.period || d.periodStart || d.headacheFree) && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date < first) first = d.date;
  const minFirst = addDays(today, -MAX_DAYS);
  if (first < minFirst) first = minFirst;
  const keys = rangeKeys(first, today);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const n = keys.length;
  const start = new Uint8Array(n);
  const med = new Uint8Array(n);
  const byDay = new Map<number, Episode[]>();
  for (const e of valid) {
    const i = idx.get(dayKey(e.start));
    if (i !== undefined) {
      start[i] = 1;
      if (!byDay.has(i)) byDay.set(i, []);
      byDay.get(i)!.push(e);
    }
    for (const m of e.meds) {
      if (m.cls === 'antiemetico') continue;
      const j = idx.get(dayKey(m.time));
      if (j !== undefined) med[j] = 1;
    }
  }
  const checkin: (CheckIn | undefined)[] = Array(n).fill(undefined);
  const duringAttack = new Uint8Array(n);
  let checkinDays = 0;
  const nowMs = ctx.now.getTime();
  for (const d of ctx.days) {
    const i = idx.get(d.date);
    if (i === undefined || !d.checkin) continue;
    checkin[i] = d.checkin;
    checkinDays++;
    const at = new Date(d.checkin.at).getTime();
    if (Number.isNaN(at)) continue;
    // Un attacco iniziato negli ultimi 3 giorni e ancora in corso al momento del check-in
    for (let j = Math.max(0, i - 3); j <= i; j++)
      for (const e of byDay.get(j) ?? []) {
        const s = new Date(e.start).getTime();
        const end = e.end ? new Date(e.end).getTime() : nowMs;
        if (s <= at && at <= end) duringAttack[i] = 1;
      }
  }

  const periods = periodStarts(ctx.days);
  const lens = periods.slice(1).map((s, i) => daysBetween(periods[i], s)).filter((l) => l >= 18 && l <= 45);
  const cycleLen = lens.length ? lens.reduce((a, c) => a + c, 0) / lens.length : 28;
  const peri = new Int8Array(n).fill(periods.length ? -1 : 0);
  if (periods.length) {
    // Giorni in cui il ciclo è seguito: dal primo flusso fino a poco prima del prossimo atteso
    const from = addDays(periods[0], -2);
    let to = addDays(periods[periods.length - 1], Math.round(cycleLen) - 3);
    if (to > today) to = today;
    for (let i = 0; i < n; i++) if (keys[i] >= from && keys[i] <= to) peri[i] = 0;
    for (const s of periods)
      for (let d = -2; d <= 2; d++) {
        const i = idx.get(addDays(s, d));
        if (i !== undefined) peri[i] = 1;
      }
  }
  const weather = new Map((ctx.weather ?? []).map((w) => [w.date, w]));
  let attacks = 0;
  for (let i = 0; i < n - 1; i++) attacks += start[i];
  return { keys, idx, today: n - 1, start, checkin, duringAttack, med, peri, periods, cycleLen, weather, attacks, checkinDays };
}

/** Finestra perimestruale di un giorno qualsiasi (anche futuro): reale se registrata, altrimenti stimata. */
export function periAt(tl: Timeline, k: string): 0 | 1 | null {
  const i = tl.idx.get(k);
  if (i !== undefined && tl.peri[i] >= 0) return tl.peri[i] as 0 | 1;
  if (!tl.periods.length) return 0;
  const last = tl.periods.filter((s) => s <= k).pop();
  if (!last) return null;
  const L = Math.round(tl.cycleLen);
  const n = daysBetween(last, k);
  if (n > 2 * L + 2) return null; // troppo lontano dall'ultimo ciclo registrato
  const off = n - Math.round(n / L) * L;
  return off >= -2 && off <= 2 && n >= L - 2 ? 1 : n <= 2 ? 1 : 0;
}

export const isWeekend = (k: string) => {
  const d = keyToDate(k).getDay();
  return d === 0 || d === 6;
};

// ---------- Stima bayesiana del rischio relativo ----------
export interface RRPosterior {
  rr: number;
  low: number;
  high: number;
  weight: number; // quota di informazione che viene dai dati personali (0-1)
}

/** a eventi su n1 giorni esposti, c eventi su n0 non esposti; prior lognormale sul RR. */
export function posteriorRR(a: number, n1: number, c: number, n0: number, prior: { rr: number; sd: number }): RRPosterior {
  const mu0 = Math.log(prior.rr);
  const p0 = 1 / (prior.sd * prior.sd);
  let est = 0;
  let prec = 0;
  if (n1 > 0 && n0 > 0) {
    const r1 = (a + 0.5) / (n1 + 1);
    const r0 = (c + 0.5) / (n0 + 1);
    est = Math.log(r1 / r0);
    const v = (1 / (a + 0.5) - 1 / (n1 + 1) + 1 / (c + 0.5) - 1 / (n0 + 1)) * OVERLAP;
    prec = v > 0 ? 1 / v : 0;
  }
  const mean = (mu0 * p0 + est * prec) / (p0 + prec);
  const sd = 1 / Math.sqrt(p0 + prec);
  const z = 1.645; // intervallo di credibilità al 90%
  return { rr: Math.exp(mean), low: Math.exp(mean - z * sd), high: Math.exp(mean + z * sd), weight: prec / (p0 + prec) };
}

export const basisOf = (w: number): TriggerRisk['basis'] => (w < 0.33 ? 'generale' : w < 0.67 ? 'misto' : 'personale');

type Exposure = (i: number) => 0 | 1 | null; // null = non noto quel giorno

function estimate(tl: Timeline, id: string, label: string, prior: { rr: number; sd: number }, exp: Exposure): TriggerRisk {
  let a = 0, n1 = 0, c = 0, n0 = 0;
  // Esito: un attacco inizia il giorno stesso o il giorno dopo (serve che "domani" sia già concluso → fino a ieri)
  const lastIdx = tl.today - 2;
  for (let i = 0; i <= lastIdx; i++) {
    const x = exp(i);
    if (x === null) continue;
    const y = tl.start[i] || tl.start[i + 1] ? 1 : 0;
    if (x) {
      n1++;
      a += y;
    } else {
      n0++;
      c += y;
    }
  }
  const p = posteriorRR(a, n1, c, n0, prior);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { id, label, rr: r2(p.rr), low: r2(p.low), high: r2(p.high), exposedDays: n1, basis: basisOf(p.weight) };
}

const ci = (tl: Timeline, i: number) => tl.checkin[i];
const known = <T>(v: T | undefined, test: (v: T) => boolean): 0 | 1 | null => (v === undefined ? null : test(v) ? 1 : 0);

/** Esposizione ai prodromi: nota solo se il check-in non è stato fatto durante un attacco (sarebbero sintomi dell'attacco). */
export function prodromeExposure(tl: Timeline, i: number, id?: string): 0 | 1 | null {
  const c = tl.checkin[i];
  if (!c || tl.duringAttack[i]) return null;
  const list = c.prodromes ?? [];
  return (id ? list.includes(id) : list.length > 0) ? 1 : 0;
}

/** Rischi relativi personali dei fattori, dal più alto. */
export function personalTriggers(ctx: AdvisorContext, timeline?: Timeline): TriggerRisk[] {
  const tl = timeline ?? buildTimeline(ctx);
  const L = LIT;
  const out: TriggerRisk[] = [
    estimate(tl, 'sleep_poco', L.sleep_poco.label, L.sleep_poco, (i) => known(ci(tl, i)?.sleep, (v) => v === 'poco')),
    estimate(tl, 'sleep_troppo', L.sleep_troppo.label, L.sleep_troppo, (i) => known(ci(tl, i)?.sleep, (v) => v === 'troppo')),
    estimate(tl, 'stress_alto', L.stress_alto.label, L.stress_alto, (i) => known(ci(tl, i)?.stress, (v) => v === 'alto')),
    estimate(tl, 'meals_saltato', L.meals_saltato.label, L.meals_saltato, (i) => known(ci(tl, i)?.meals, (v) => v === 'saltato')),
    estimate(tl, 'water_poca', L.water_poca.label, L.water_poca, (i) => known(ci(tl, i)?.water, (v) => v === 'poca')),
    estimate(tl, 'caffeine_piu', L.caffeine_piu.label, L.caffeine_piu, (i) => known(ci(tl, i)?.caffeine, (v) => v === 'piu')),
    estimate(tl, 'caffeine_meno', L.caffeine_meno.label, L.caffeine_meno, (i) => known(ci(tl, i)?.caffeine, (v) => v === 'meno')),
    estimate(tl, 'alcohol', L.alcohol.label, L.alcohol, (i) => known(ci(tl, i)?.alcohol, (v) => v)),
    estimate(tl, 'no_exercise', L.no_exercise.label, L.no_exercise, (i) => known(ci(tl, i)?.exercise, (v) => !v)),
    estimate(tl, 'prodrome', L.prodrome.label, L.prodrome, (i) => prodromeExposure(tl, i)),
    estimate(tl, 'weekend', L.weekend.label, L.weekend, (i) => (isWeekend(tl.keys[i]) ? 1 : 0))
  ];
  for (const p of PRODROMES) {
    const r = estimate(tl, 'prodrome_' + p.id, labelOf(PRODROMES, p.id), SINGLE_PRODROME, (i) => prodromeExposure(tl, i, p.id));
    if (r.exposedDays >= 3) out.push(r);
  }
  if (tl.periods.length) out.push(estimate(tl, 'perimenstrual', L.perimenstrual.label, L.perimenstrual, (i) => (tl.peri[i] < 0 ? null : (tl.peri[i] as 0 | 1))));
  if (tl.weather.size)
    out.push(
      estimate(tl, 'pressure_drop', L.pressure_drop.label, L.pressure_drop, (i) => {
        const w = tl.weather.get(tl.keys[i]);
        return w ? (w.pressureChange <= -5 ? 1 : 0) : null;
      })
    );
  return out.sort((x, y) => y.rr - x.rr);
}
