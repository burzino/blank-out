// Previsione del rischio di attacco: regressione logistica BAYESIANA (MAP) allenata sul dispositivo.
// Un esempio per giorno (dal primo giorno registrato a ieri); y = 1 se quel giorno INIZIA un attacco.
// I coefficienti hanno prior gaussiani centrati sui log-RR della letteratura (vedi LIT in triggers.ts):
// senza dati la stima coincide con "una persona tipica con emicrania", con molti dati domina lo storico personale.
import { addDays, dayKey } from '../clinic';
import type { CheckIn } from '../types';
import { buildTimeline, isWeekend, periAt, type Timeline } from './triggers';
import type { AdvisorContext, Forecast } from './types';

/** Soglie per considerare la stima personale (non bloccano più la previsione). */
export const MIN_DAYS = 60;
export const MIN_ATTACKS = 8;
/** Frequenza di base a priori: ~4 attacchi al mese (emicrania episodica). */
const PRIOR_RATE = 4 / 30;
const PRIOR_RATE_DAYS = 30; // peso del prior sulla frequenza, in giorni equivalenti

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
const logit = (p: number) => Math.log(p / (1 - p));

// ---------- Regressione logistica MAP (Newton-Raphson) ----------
export interface LogisticModel {
  w: number[];
  b: number;
}

/** Risolve H·x = g con Cholesky (H simmetrica definita positiva). */
function cholSolve(H: Float64Array, g: Float64Array, d: number): Float64Array {
  const L = new Float64Array(d * d);
  for (let i = 0; i < d; i++)
    for (let j = 0; j <= i; j++) {
      let s = H[i * d + j];
      for (let k = 0; k < j; k++) s -= L[i * d + k] * L[j * d + k];
      L[i * d + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * d + j];
    }
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let s = g[i];
    for (let k = 0; k < i; k++) s -= L[i * d + k] * y[k];
    y[i] = s / L[i * d + i];
  }
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < d; k++) s -= L[k * d + i] * x[k];
    x[i] = s / L[i * d + i];
  }
  return x;
}

/**
 * MAP con prior gaussiani indipendenti: θ_j ~ N(mu_j, sd_j²). La colonna 0 di X deve essere 1 (intercetta).
 * Minimizza Σ logloss + Σ (θ−mu)²/(2·sd²). Senza dati restituisce il prior.
 */
export function fitMAP(X: Float64Array[], y: ArrayLike<number>, mu: number[], sd: number[], from = 0, to = X.length, init?: number[]): number[] {
  const d = mu.length;
  const th = init ? [...init] : [...mu];
  const prec = sd.map((s) => 1 / (s * s));
  const g = new Float64Array(d);
  const H = new Float64Array(d * d);
  for (let it = 0; it < 30; it++) {
    for (let j = 0; j < d; j++) g[j] = (th[j] - mu[j]) * prec[j];
    H.fill(0);
    for (let j = 0; j < d; j++) H[j * d + j] = prec[j];
    for (let i = from; i < to; i++) {
      const x = X[i];
      let z = 0;
      for (let j = 0; j < d; j++) z += th[j] * x[j];
      const p = sigmoid(z);
      const r = p - y[i];
      const wgt = p * (1 - p);
      for (let j = 0; j < d; j++) {
        const xj = x[j];
        if (xj === 0) continue;
        g[j] += r * xj;
        const wx = wgt * xj;
        for (let k = 0; k <= j; k++) H[j * d + k] += wx * x[k];
      }
    }
    for (let j = 0; j < d; j++) for (let k = 0; k < j; k++) H[k * d + j] = H[j * d + k];
    const step = cholSolve(H, g, d);
    let maxStep = 0;
    for (let j = 0; j < d; j++) maxStep = Math.max(maxStep, Math.abs(step[j]));
    if (maxStep < 1e-7) break;
    // Ricerca lineare a dimezzamento: il passo deve ridurre l'obiettivo (Newton puro può oscillare)
    const f0 = objective(th);
    let t = maxStep > 5 ? 5 / maxStep : 1;
    const cand = new Array<number>(d);
    for (let ls = 0; ls < 30; ls++) {
      for (let j = 0; j < d; j++) cand[j] = th[j] - t * step[j];
      if (objective(cand) <= f0) break;
      t /= 2;
    }
    for (let j = 0; j < d; j++) th[j] = cand[j];
    if (maxStep * t < 1e-7) break;
  }
  return th;

  function objective(w: number[]): number {
    let f = 0;
    for (let j = 0; j < d; j++) f += ((w[j] - mu[j]) ** 2 * prec[j]) / 2;
    for (let i = from; i < to; i++) {
      const x = X[i];
      let z = 0;
      for (let j = 0; j < d; j++) z += w[j] * x[j];
      // log(1 + e^z) − y·z, in forma stabile
      f += (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z))) - y[i] * z;
    }
    return f;
  }
}

/** Interfaccia semplice: feature già standardizzate, prior N(0, sd²) sui coefficienti. */
export function trainLogistic(X: number[][], y: number[], opts: { sd?: number } = {}): LogisticModel {
  const d = X[0]?.length ?? 0;
  const rate = Math.min(Math.max(y.reduce((a, c) => a + c, 0) / Math.max(y.length, 1), 1e-3), 1 - 1e-3);
  const Xa = X.map((r) => Float64Array.from([1, ...r]));
  const th = fitMAP(Xa, y, [logit(rate), ...Array(d).fill(0)], [10, ...Array(d).fill(opts.sd ?? 1)]);
  return { b: th[0], w: th.slice(1) };
}

export function predictLogistic(m: LogisticModel, x: number[]): number {
  let z = m.b;
  for (let j = 0; j < x.length; j++) z += m.w[j] * x[j];
  return sigmoid(z);
}

/** AUC (Mann-Whitney, con gestione dei pari merito). NaN se manca una delle due classi. */
export function auc(scores: number[], y: number[]): number {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranks = Array(scores.length).fill(0);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    for (let k = i; k <= j; k++) ranks[idx[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  const pos = y.filter((v) => v === 1).length;
  const neg = y.length - pos;
  if (!pos || !neg) return NaN;
  const rpos = ranks.reduce((a, r, i) => a + (y[i] === 1 ? r : 0), 0);
  return (rpos - (pos * (pos + 1)) / 2) / (pos * neg);
}

// ---------- Feature ----------
// rr/sd: prior sul coefficiente (log rr, sd); typical: valore tipico (prevalenza) usato per imputare
// quando mancano dati personali e per centrare l'intercetta; up/down: etichette dei "drivers".
interface Spec { id: string; rr: number; sd: number; typical: number; up: string | null; down: string | null }
const SPECS: Spec[] = [
  { id: 'sleep_poco', rr: 1.6, sd: 0.35, typical: 0.2, up: 'Hai dormito poco', down: null },
  { id: 'sleep_troppo', rr: 1.3, sd: 0.4, typical: 0.1, up: 'Hai dormito più del solito', down: null },
  { id: 'sleep_poco_ieri', rr: 1.3, sd: 0.35, typical: 0.2, up: 'Poco sonno anche la notte prima', down: null },
  { id: 'stress_alto', rr: 1.5, sd: 0.4, typical: 0.2, up: 'Stress alto', down: null },
  { id: 'stress_alto_ieri', rr: 1.2, sd: 0.4, typical: 0.2, up: 'Stress alto ieri', down: null },
  { id: 'stress_calo', rr: 1.6, sd: 0.4, typical: 0.05, up: 'Calo dello stress dopo giorni intensi', down: null },
  { id: 'meals_saltato', rr: 1.5, sd: 0.4, typical: 0.1, up: 'Hai saltato un pasto', down: null },
  { id: 'water_poca', rr: 1.2, sd: 0.4, typical: 0.2, up: 'Hai bevuto poca acqua', down: null },
  { id: 'caffeine_piu', rr: 1.35, sd: 0.4, typical: 0.1, up: 'Più caffè del solito', down: null },
  { id: 'caffeine_meno', rr: 1.3, sd: 0.4, typical: 0.1, up: 'Meno caffè del solito', down: null },
  { id: 'alcohol_ieri', rr: 1.4, sd: 0.4, typical: 0.1, up: 'Alcol ieri', down: null },
  { id: 'alcohol', rr: 1.15, sd: 0.4, typical: 0.1, up: 'Alcol oggi', down: null },
  { id: 'no_exercise', rr: 1.2, sd: 0.3, typical: 0.5, up: 'Niente movimento', down: 'Hai fatto movimento' },
  { id: 'prodrome', rr: 2.0, sd: 0.5, typical: 0.1, up: 'Segnali premonitori oggi', down: null },
  { id: 'prodrome_ieri', rr: 3.0, sd: 0.5, typical: 0.1, up: 'Segnali premonitori ieri', down: null },
  { id: 'checkin_missing', rr: 1, sd: 0.5, typical: 0.5, up: null, down: null },
  { id: 'peri', rr: 2.0, sd: 0.35, typical: 0.18, up: 'Ciclo in arrivo', down: null },
  { id: 'pressure_drop', rr: 1.25, sd: 0.3, typical: 0.15, up: 'Calo di pressione previsto', down: null },
  { id: 'heat', rr: 1.15, sd: 0.3, typical: 0.1, up: 'Caldo', down: null },
  { id: 'weekend', rr: 1.1, sd: 0.3, typical: 2 / 7, up: 'Weekend', down: null },
  // Storia personale: nessun prior informativo (centrato su 0)
  { id: 'since', rr: 1, sd: 0.5, typical: 0, up: 'Più giorni senza attacchi', down: 'Attacco recente' },
  { id: 'recent7', rr: 1, sd: 0.5, typical: 1, up: 'Molti attacchi negli ultimi giorni', down: 'Pochi attacchi negli ultimi giorni' },
  { id: 'meds3', rr: 1, sd: 0.5, typical: 0.5, up: 'Antidolorifici negli ultimi giorni', down: null }
];
const D = SPECS.length;
const F = Object.fromEntries(SPECS.map((s, j) => [s.id, j])) as Record<string, number>;
const LOG8 = Math.log(8);

/**
 * Feature grezze del giorno i (può essere tl.today + 1 = domani). Usa solo la storia prima di i,
 * il check-in del giorno e di ieri, calendario e meteo del giorno. NaN = non noto (verrà imputato).
 */
function rawRow(tl: Timeline, i: number, mode: 'train' | 'predict'): Float64Array {
  const x = new Float64Array(D).fill(NaN);
  const k = i < tl.keys.length ? tl.keys[i] : addDays(tl.keys[tl.keys.length - 1], i - tl.keys.length + 1);
  const c: CheckIn | undefined = i < tl.keys.length ? tl.checkin[i] : undefined;
  const cy: CheckIn | undefined = i > 0 && i - 1 < tl.keys.length ? tl.checkin[i - 1] : undefined;
  const set = (id: string, v: number | undefined | null) => {
    if (v !== undefined && v !== null) x[F[id]] = v;
  };
  const b = (v: boolean) => (v ? 1 : 0);
  if (c) {
    if (c.sleep) {
      set('sleep_poco', b(c.sleep === 'poco'));
      set('sleep_troppo', b(c.sleep === 'troppo'));
    }
    if (c.stress) set('stress_alto', b(c.stress === 'alto'));
    if (c.meals) set('meals_saltato', b(c.meals === 'saltato'));
    if (c.water) set('water_poca', b(c.water === 'poca'));
    if (c.caffeine) {
      set('caffeine_piu', b(c.caffeine === 'piu'));
      set('caffeine_meno', b(c.caffeine === 'meno'));
    }
    if (c.alcohol !== undefined) set('alcohol', b(c.alcohol));
    if (c.exercise !== undefined) set('no_exercise', b(!c.exercise));
    // Prodromi registrati durante un attacco sono sintomi dell'attacco, non segnali premonitori
    if (!tl.duringAttack[i]) set('prodrome', b((c.prodromes ?? []).length > 0));
  }
  if (cy) {
    if (cy.sleep) set('sleep_poco_ieri', b(cy.sleep === 'poco'));
    if (cy.stress) set('stress_alto_ieri', b(cy.stress === 'alto'));
    if (cy.stress && c?.stress) set('stress_calo', b(cy.stress === 'alto' && c.stress !== 'alto'));
    if (cy.alcohol !== undefined) set('alcohol_ieri', b(cy.alcohol));
    if (!tl.duringAttack[i - 1]) set('prodrome_ieri', b((cy.prodromes ?? []).length > 0));
  }
  // Domani il check-in non c'è ancora: si imputa come se fosse compilato (valori attesi), non come "mancante"
  x[F.checkin_missing] = c || mode === 'predict' ? 0 : 1;

  if (!tl.periods.length) x[F.peri] = 0;
  else if (mode === 'train' && i < tl.keys.length) x[F.peri] = tl.peri[i] < 0 ? NaN : tl.peri[i];
  else x[F.peri] = periAt(tl, k) ?? NaN;

  if (!tl.weather.size) {
    x[F.pressure_drop] = 0;
    x[F.heat] = 0;
  } else {
    const w = tl.weather.get(k);
    const wp = tl.weather.get(addDays(k, -1));
    if (w) {
      x[F.pressure_drop] = b(w.pressureChange <= -5 || (!!wp && wp.pressureChange <= -5));
      x[F.heat] = b(w.tempMax >= 30);
    }
  }
  x[F.weekend] = b(isWeekend(k));

  let since = 30; // nessun attacco precedente noto: valore neutro
  for (let j = i - 1; j >= 0 && j >= i - 60; j--)
    if (j < tl.keys.length && tl.start[j]) {
      since = i - j;
      break;
    }
  x[F.since] = Math.log(1 + since) - LOG8;
  let r7 = 0;
  for (let j = Math.max(0, i - 7); j < i; j++) if (j < tl.keys.length) r7 += tl.start[j];
  x[F.recent7] = r7;
  let m3 = 0;
  for (let j = Math.max(0, i - 3); j < i; j++) if (j < tl.keys.length) m3 += tl.med[j];
  x[F.meds3] = m3;
  return x;
}

interface Prepared {
  tl: Timeline;
  X: Float64Array[]; // con intercetta in colonna 0
  y: Uint8Array;
  impute: number[];
  ref: number[]; // valore di riferimento ("giorno tipico") per i drivers
  mu: number[];
  sd: number[];
}

function prepare(ctx: AdvisorContext): Prepared {
  const tl = buildTimeline(ctx);
  const n = tl.today; // giorni completi: da 0 a ieri
  const raw: Float64Array[] = [];
  for (let i = 0; i < n; i++) raw.push(rawRow(tl, i, 'train'));
  // Imputazione neutra: prevalenza personale se ci sono almeno 10 valori, altrimenti quella tipica
  const impute = SPECS.map((s, j) => {
    let sum = 0, cnt = 0;
    for (const r of raw) if (!Number.isNaN(r[j])) { sum += r[j]; cnt++; }
    return cnt >= 10 ? sum / cnt : s.typical;
  });
  const X: Float64Array[] = raw.map((r) => {
    const row = new Float64Array(D + 1);
    row[0] = 1;
    for (let j = 0; j < D; j++) row[j + 1] = Number.isNaN(r[j]) ? impute[j] : r[j];
    return row;
  });
  const ref = SPECS.map((s, j) => {
    if (n < 30) return s.typical;
    let sum = 0;
    for (const r of X) sum += r[j + 1];
    return sum / n;
  });
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) y[i] = tl.start[i];
  const priorB = logit(PRIOR_RATE) - SPECS.reduce((a, s) => a + Math.log(s.rr) * s.typical, 0);
  return { tl, X, y, impute, ref, mu: [priorB, ...SPECS.map((s) => Math.log(s.rr))], sd: [1.5, ...SPECS.map((s) => s.sd)] };
}

function rowFor(p: Prepared, i: number): Float64Array {
  const r = rawRow(p.tl, i, 'predict');
  const row = new Float64Array(D + 1);
  row[0] = 1;
  for (let j = 0; j < D; j++) row[j + 1] = Number.isNaN(r[j]) ? p.impute[j] : r[j];
  return row;
}

const dot = (th: number[], x: Float64Array) => {
  let z = 0;
  for (let j = 0; j < th.length; j++) z += th[j] * x[j];
  return z;
};

/** Stima del rischio che inizi un attacco oggi e domani. Disponibile dal primo giorno. */
export function forecast(ctx: AdvisorContext): Forecast {
  const p = prepare(ctx);
  const { tl, X, y } = p;
  const n = X.length;
  const attacks = tl.attacks;
  const th = fitMAP(X, y, p.mu, p.sd);

  // Valutazione rolling-origin (finestra che si allarga): si allena sul passato, si prevede il blocco successivo
  let quality: Forecast['quality'];
  let brier: number | undefined;
  let platt: number[] | null = null;
  let aucVal = NaN;
  if (n >= MIN_DAYS && attacks >= MIN_ATTACKS) {
    const origins = [0.5, 0.625, 0.75, 0.875, 1].map((f) => Math.floor(n * f));
    const scores: number[] = [];
    const ys: number[] = [];
    let init: number[] | undefined;
    for (let f = 0; f < origins.length - 1; f++) {
      const o = origins[f];
      const m = fitMAP(X, y, p.mu, p.sd, 0, o, init);
      init = m;
      for (let i = o; i < origins[f + 1]; i++) {
        scores.push(sigmoid(dot(m, X[i])));
        ys.push(y[i]);
      }
    }
    aucVal = auc(scores, ys);
    brier = Math.round((scores.reduce((a, s, i) => a + (s - ys[i]) ** 2, 0) / scores.length) * 1000) / 1000;
    quality = { auc: Number.isNaN(aucVal) ? 0.5 : Math.round(aucVal * 100) / 100, samples: scores.length };
    // Calibrazione di Platt sulle previsioni fuori campione (solo con abbastanza attacchi)
    const pos = ys.reduce((a, v) => a + v, 0);
    if (pos >= 15) {
      const Z = scores.map((s) => Float64Array.from([1, logit(Math.min(Math.max(s, 1e-4), 1 - 1e-4))]));
      const ab = fitMAP(Z, ys, [0, 1], [1, 0.5]);
      if (ab[1] > 0) platt = ab;
    }
  }
  const calibrate = (z: number) => (platt ? sigmoid(platt[0] + platt[1] * z) : sigmoid(z));

  const xToday = rowFor(p, tl.today);
  const xTomorrow = rowFor(p, tl.today + 1);
  const pToday = calibrate(dot(th, xToday));
  const pTomorrow = calibrate(dot(th, xTomorrow));

  // Frequenza di base personale con prior (~4 attacchi/mese)
  const baseRate = (attacks + PRIOR_RATE * PRIOR_RATE_DAYS) / (n + PRIOR_RATE_DAYS);
  const level: Forecast['level'] = pToday < 0.8 * baseRate ? 'basso' : pToday > 1.5 * baseRate ? 'alto' : 'medio';

  const contribs = SPECS.map((s, j) => {
    const dx = xToday[j + 1] - p.ref[j];
    return { s, dx, c: th[j + 1] * dx };
  })
    .filter((d) => Math.abs(d.c) >= 0.08 && (d.dx > 0 ? d.s.up : d.s.down))
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
  const drivers: Forecast['drivers'] = [];
  for (const d of contribs) {
    const label = (d.dx > 0 ? d.s.up : d.s.down)!;
    if (drivers.some((x) => x.label === label)) continue;
    drivers.push({ label, effect: d.c > 0 ? 'aumenta' : 'riduce' });
    if (drivers.length === 3) break;
  }

  const basis: Forecast['basis'] =
    n < MIN_DAYS || attacks < MIN_ATTACKS ? 'generale' : n >= 180 && attacks >= 20 && tl.checkinDays >= 60 ? 'personale' : 'misto';
  const notes: string[] = [];
  if (basis === 'generale')
    notes.push(
      `Stima basata soprattutto su dati generali sull'emicrania e sui tuoi check-in: diventerà personale man mano che registri attacchi e check-in (servono circa ${MIN_DAYS} giorni e ${MIN_ATTACKS} attacchi; ora ${n} giorni e ${attacks} attacchi).`
    );
  else if (basis === 'misto') notes.push('Stima in parte personale: unisce i tuoi dati con quelli generali sull\'emicrania.');
  if (quality && (Number.isNaN(aucVal) || aucVal < 0.6)) notes.push('Stima ancora poco affidabile: sui tuoi dati il modello non distingue ancora bene i giorni a rischio.');

  return {
    available: true,
    basis,
    brier,
    reason: notes.length ? notes.join(' ') : undefined,
    today: pToday,
    tomorrow: pTomorrow,
    level,
    drivers,
    quality
  };
}

/** Fattori di rischio presenti oggi o attesi per domani (stessi id di personalTriggers). */
export function riskFactorsToday(ctx: AdvisorContext): { id: string; label: string }[] {
  const tl = buildTimeline(ctx);
  const today = dayKey(ctx.now);
  const tomorrow = addDays(today, 1);
  const c = tl.checkin[tl.today];
  const cy = tl.today > 0 ? tl.checkin[tl.today - 1] : undefined;
  const out: { id: string; label: string }[] = [];
  const add = (id: string, label: string) => {
    if (!out.some((f) => f.id === id)) out.push({ id, label });
  };
  if (c) {
    if (c.sleep === 'poco') add('sleep_poco', 'Hai dormito poco');
    if (c.sleep === 'troppo') add('sleep_troppo', 'Hai dormito più del solito');
    if (c.stress === 'alto') add('stress_alto', 'Stress alto');
    else if (cy?.stress === 'alto' && c.stress) add('stress_alto', 'Calo dello stress dopo giorni intensi');
    if (c.meals === 'saltato') add('meals_saltato', 'Hai saltato un pasto');
    if (c.water === 'poca') add('water_poca', 'Hai bevuto poca acqua');
    if (c.caffeine === 'piu') add('caffeine_piu', 'Più caffè del solito');
    if (c.caffeine === 'meno') add('caffeine_meno', 'Meno caffè del solito');
    if (c.alcohol) add('alcohol', 'Alcol');
    if (c.exercise === false) add('no_exercise', 'Niente movimento');
    if ((c.prodromes ?? []).length && !tl.duringAttack[tl.today]) add('prodrome', 'Segnali premonitori oggi');
  }
  if (cy) {
    if (cy.alcohol) add('alcohol', 'Alcol ieri');
    if ((cy.prodromes ?? []).length && !tl.duringAttack[tl.today - 1]) add('prodrome', 'Segnali premonitori ieri');
  }
  const pt = periAt(tl, today);
  const pm = periAt(tl, tomorrow);
  if (pt === 1) add('perimenstrual', 'Giorni del ciclo');
  else if (pm === 1) add('perimenstrual', 'Ciclo in arrivo');
  const drop = (k: string) => (tl.weather.get(k)?.pressureChange ?? 0) <= -5;
  if (drop(today)) add('pressure_drop', 'Calo di pressione oggi');
  else if (drop(tomorrow)) add('pressure_drop', 'Calo di pressione previsto');
  if (isWeekend(today)) add('weekend', 'Weekend');
  return out;
}

