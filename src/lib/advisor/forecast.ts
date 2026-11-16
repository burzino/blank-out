// Previsione del rischio di attacco: regressione logistica L2 allenata sul dispositivo con i dati dell'utente.
// Un esempio per giorno (dal primo giorno registrato a ieri); y = 1 se quel giorno INIZIA un attacco.
import { addDays, dayKey, daysBetween, keyToDate, periodStarts } from '../clinic';
import { dailyBase, type DailyBase } from './patterns';
import type { AdvisorContext, Forecast, WeatherDay } from './types';

export const MIN_DAYS = 60;
export const MIN_ATTACKS = 8;

// ---------- Regressione logistica ----------
export interface LogisticModel {
  w: number[];
  b: number;
}

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/** Discesa del gradiente (batch) su log-loss media + (λ/2)·‖w‖². X deve essere già standardizzata. */
export function trainLogistic(X: number[][], y: number[], opts: { lambda?: number; lr?: number; iters?: number } = {}): LogisticModel {
  const { lambda = 0.01, lr = 0.5, iters = 800 } = opts;
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const w = Array(d).fill(0);
  const rate = Math.min(Math.max(y.reduce((a, c) => a + c, 0) / Math.max(n, 1), 1e-3), 1 - 1e-3);
  let b = Math.log(rate / (1 - rate));
  const gw = Array(d).fill(0);
  for (let it = 0; it < iters; it++) {
    gw.fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const xi = X[i];
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * xi[j];
      const err = sigmoid(z) - y[i];
      gb += err;
      for (let j = 0; j < d; j++) gw[j] += err * xi[j];
    }
    b -= (lr * gb) / n;
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + lambda * w[j]);
  }
  return { w, b };
}

export function predictLogistic(m: LogisticModel, x: number[]): number {
  let z = m.b;
  for (let j = 0; j < x.length; j++) z += m.w[j] * x[j];
  return sigmoid(z);
}

/** AUC (Mann-Whitney, con gestione dei pari merito). NaN se manca una delle due classi. */
export function auc(scores: number[], y: number[]): number {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
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
type FeatureId = 'daysSince' | 'recent7' | 'weekend' | 'friMon' | 'peri' | 'toNext' | 'pressDrop' | 'lowPress' | 'tempMax' | 'meds3';

interface Env {
  base: DailyBase;
  startList: string[]; // giorni di inizio attacco, ordinati
  medDays: Set<string>;
  periods: string[];
  cycleLen: number;
  weather: Map<string, WeatherDay>;
  features: FeatureId[];
}

function buildEnv(ctx: AdvisorContext, base: DailyBase): Env {
  const medDays = new Set<string>();
  for (const e of base.valid) for (const m of e.meds) if (m.cls !== 'antiemetico') medDays.add(dayKey(m.time));
  const periods = periodStarts(ctx.days);
  const lens = periods.slice(1).map((s, i) => daysBetween(periods[i], s)).filter((l) => l >= 18 && l <= 45);
  const cycleLen = lens.length ? lens.reduce((a, c) => a + c, 0) / lens.length : 28;
  const weather = new Map((ctx.weather ?? []).map((w) => [w.date, w]));
  const features: FeatureId[] = ['daysSince', 'recent7', 'weekend', 'friMon', 'meds3'];
  if (periods.length >= 2) features.push('peri', 'toNext');
  const covered = base.keys.filter((k) => weather.has(k)).length;
  if (covered >= Math.max(30, base.keys.length * 0.5)) features.push('pressDrop', 'lowPress', 'tempMax');
  return { base, startList: [...base.startDays].sort(), medDays, periods, cycleLen, weather, features };
}

/** Feature grezze del giorno k usando solo ciò che si sa prima di k (calendario e meteo del giorno a parte). NaN = mancante. */
function rawFeatures(env: Env, k: string, knownUntil: string): Record<FeatureId, number> {
  const prev = env.startList.filter((s) => s < k && s <= knownUntil);
  const last = prev[prev.length - 1];
  const since = last ? daysBetween(last, k) : daysBetween(env.base.first, k) + 1;
  const recent7 = prev.filter((s) => daysBetween(s, k) <= 7).length;
  const dow = keyToDate(k).getDay();
  let meds3 = 0;
  for (let i = 1; i <= 3; i++) if (env.medDays.has(addDays(k, -i))) meds3++;

  let peri = NaN;
  let toNext = NaN;
  if (env.periods.length >= 2) {
    const L = Math.round(env.cycleLen);
    const known = env.periods.filter((s) => s <= knownUntil);
    // Finestra perimestruale (−2/+3): flusso reale se già registrato, altrimenti stimato
    const actual = known.some((s) => {
      const d = daysBetween(s, k);
      return d >= -2 && d <= 2;
    });
    const lastP = known.filter((s) => s <= k).pop();
    if (lastP && daysBetween(lastP, k) <= 2 * L) {
      const sinceP = daysBetween(lastP, k);
      const nextIn = L - sinceP; // giorni al prossimo ciclo stimato
      toNext = Math.max(-5, Math.min(40, nextIn));
      peri = actual || (nextIn >= -2 && nextIn <= 2) ? 1 : 0;
    } else if (actual) {
      peri = 1;
    }
  }

  const w = env.weather.get(k);
  const wPrev = env.weather.get(addDays(k, -1));
  const drop = (x?: WeatherDay) => (x ? Math.max(0, -x.pressureChange) : NaN);
  const pressDrop = w ? Math.max(drop(w), wPrev ? drop(wPrev) : 0) : NaN;
  return {
    daysSince: Math.log(1 + Math.min(since, 90)),
    recent7,
    weekend: dow === 0 || dow === 6 ? 1 : 0,
    friMon: dow === 1 || dow === 5 ? 1 : 0,
    meds3,
    peri,
    toNext,
    pressDrop,
    lowPress: w ? Math.max(0, 1015 - w.pressureMean) : NaN,
    tempMax: w ? w.tempMax : NaN
  };
}

interface Scaler {
  mean: number[];
  sd: number[];
}

function fitScaler(rows: number[][]): Scaler {
  const d = rows[0].length;
  const mean = Array(d).fill(0);
  const sd = Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    const v = rows.map((r) => r[j]).filter((x) => !Number.isNaN(x));
    const m = v.length ? v.reduce((a, c) => a + c, 0) / v.length : 0;
    const s = v.length > 1 ? Math.sqrt(v.reduce((a, c) => a + (c - m) ** 2, 0) / (v.length - 1)) : 0;
    mean[j] = m;
    sd[j] = s > 1e-9 ? s : 0; // 0 = feature costante: verrà azzerata
  }
  return { mean, sd };
}

/** Standardizza; i valori mancanti diventano 0 (= media). */
const scale = (s: Scaler, r: number[]) => r.map((x, j) => (Number.isNaN(x) || !s.sd[j] ? 0 : (x - s.mean[j]) / s.sd[j]));

const LABELS: Record<FeatureId, [string, string]> = {
  // [etichetta se il valore è sopra la media, se è sotto]
  daysSince: ['Più giorni senza attacchi', 'Attacco recente'],
  recent7: ['Molti attacchi negli ultimi giorni', 'Pochi attacchi negli ultimi giorni'],
  weekend: ['È weekend', 'Giorno feriale'],
  friMon: ['Venerdì o lunedì', 'Metà settimana'],
  meds3: ['Antidolorifici negli ultimi giorni', 'Niente antidolorifici negli ultimi giorni'],
  peri: ['Ciclo in arrivo', 'Lontano dal ciclo'],
  toNext: ['Ciclo ancora lontano', 'Ciclo in arrivo'],
  pressDrop: ['Calo di pressione previsto', 'Pressione stabile'],
  lowPress: ['Pressione bassa', 'Pressione alta'],
  tempMax: ['Caldo', 'Temperature fresche']
};

const vec = (env: Env, k: string, knownUntil: string) => {
  const r = rawFeatures(env, k, knownUntil);
  return env.features.map((f) => r[f]);
};

/** Stima del rischio che inizi un attacco oggi e domani. */
export function forecast(ctx: AdvisorContext): Forecast {
  const base = dailyBase(ctx);
  const days = base?.keys.length ?? 0;
  const attacks = base ? [...base.startDays].filter((k) => k <= base.last).length : 0;
  if (!base || days < MIN_DAYS || attacks < MIN_ATTACKS)
    return {
      available: false,
      reason: `Servono almeno ${MIN_DAYS} giorni di diario e ${MIN_ATTACKS} attacchi registrati (ora: ${days} giorni, ${attacks} attacchi).`,
      drivers: []
    };

  const env = buildEnv(ctx, base);
  // Nel training ogni giorno vede la storia nota fino al giorno prima e il ciclo reale già registrato.
  const raw = base.keys.map((k) => vec(env, k, addDays(k, -1)).map((x, j) => (env.features[j] === 'peri' ? rawFeatures(env, k, base.last).peri : x)));
  const y: number[] = base.keys.map((k) => (base.startDays.has(k) ? 1 : 0));

  // Validazione temporale: allena sul primo 75%, valuta sul 25% finale
  const cut = Math.floor(raw.length * 0.75);
  const sTrain = fitScaler(raw.slice(0, cut));
  const mTrain = trainLogistic(raw.slice(0, cut).map((r) => scale(sTrain, r)), y.slice(0, cut));
  const testScores = raw.slice(cut).map((r) => predictLogistic(mTrain, scale(sTrain, r)));
  const a = auc(testScores, y.slice(cut));

  // Modello finale su tutto lo storico
  const scaler = fitScaler(raw);
  const model = trainLogistic(raw.map((r) => scale(scaler, r)), y);
  const baseRate = y.reduce((s, v) => s + v, 0) / y.length;

  const today = dayKey(ctx.now);
  const tomorrow = addDays(today, 1);
  const xToday = scale(scaler, vec(env, today, base.last));
  // Domani: si conosce anche oggi (attacchi e farmaci di oggi entrano nello storico); meteo previsto se c'è
  const envTomorrow: Env = { ...env, medDays: new Set(env.medDays), startList: [...new Set([...env.startList, ...(base.valid.some((e) => dayKey(e.start) === today) ? [today] : [])])].sort() };
  for (const e of base.valid) for (const m of e.meds) if (m.cls !== 'antiemetico' && dayKey(m.time) === today) envTomorrow.medDays.add(today);
  const xTomorrow = scale(scaler, vec(envTomorrow, tomorrow, today));
  const pToday = predictLogistic(model, xToday);
  const pTomorrow = predictLogistic(model, xTomorrow);

  const level: Forecast['level'] = pToday < 0.8 * baseRate ? 'basso' : pToday > 1.5 * baseRate ? 'alto' : 'medio';
  const contribs = env.features
    .map((f, j) => ({ f, z: xToday[j], c: model.w[j] * xToday[j] }))
    .filter((d) => Math.abs(d.c) >= 0.05)
    .sort((p, q) => Math.abs(q.c) - Math.abs(p.c));
  const drivers: Forecast['drivers'] = [];
  for (const d of contribs) {
    const label = LABELS[d.f][d.z >= 0 ? 0 : 1];
    if (drivers.some((x) => x.label === label)) continue;
    drivers.push({ label, effect: d.c > 0 ? 'aumenta' : 'riduce' });
    if (drivers.length === 3) break;
  }

  const reliable = !Number.isNaN(a) && a >= 0.6;
  return {
    available: true,
    reason: reliable
      ? undefined
      : Number.isNaN(a)
        ? 'Stima ancora poco affidabile: nel periodo di verifica non ci sono abbastanza attacchi per misurarne la qualità.'
        : 'Stima ancora poco affidabile: sui tuoi dati il modello non distingue ancora bene i giorni a rischio.',
    today: pToday,
    tomorrow: pTomorrow,
    level,
    drivers,
    quality: { auc: Number.isNaN(a) ? 0.5 : Math.round(a * 100) / 100, samples: y.length }
  };
}
