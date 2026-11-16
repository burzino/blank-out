// Analisi dei pattern sui dati dell'utente, tutto sul dispositivo.
// Nota metodologica: i fattori scatenanti sono registrati solo nei giorni CON mal di testa (nessun giorno di
// controllo), quindi per loro riportiamo solo la frequenza, mai un rischio relativo. I confronti di rischio si fanno
// solo con variabili note ogni giorno: giorno della settimana, ciclo, meteo, giorni dall'ultimo attacco.
import { TRIGGERS, labelOf } from '../catalog';
import { addDays, computeStats, dayKey, daysBetween, durationMin, formatDuration, keyToDate, periodStarts, rangeKeys } from '../clinic';
import type { Episode } from '../types';
import type { AdvisorContext, Confidence, Pattern } from './types';

export const MIN_EPISODES = 8;

// ---------- Statistica di base ----------
/** Funzione di ripartizione normale standard (Abramowitz-Stegun 7.1.26, errore < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Confronto di due proporzioni (z con varianza combinata), p bilaterale. */
export function twoProp(a1: number, n1: number, a2: number, n2: number): { p1: number; p2: number; pValue: number } {
  const p1 = n1 ? a1 / n1 : 0;
  const p2 = n2 ? a2 / n2 : 0;
  const pool = n1 + n2 ? (a1 + a2) / (n1 + n2) : 0;
  const se = Math.sqrt(pool * (1 - pool) * (1 / Math.max(n1, 1) + 1 / Math.max(n2, 1)));
  const pValue = se > 0 ? 2 * (1 - normCdf(Math.abs(p1 - p2) / se)) : 1;
  return { p1, p2, pValue };
}

/** Intervallo di Wilson al 95%. */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

function lnGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Q(a, x): funzione gamma incompleta regolarizzata superiore. */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n < 200; n++) {
      del *= x / (a + n);
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-10) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

export const chi2Sf = (x: number, df: number) => gammaQ(df / 2, x / 2);

/** Chi-quadro di indipendenza su una tabella 2×k (eventi / giorni per gruppo). */
export function chi2Rates(events: number[], totals: number[]): number {
  const E = events.reduce((a, b) => a + b, 0);
  const N = totals.reduce((a, b) => a + b, 0);
  if (!N || !E || E === N) return 1;
  const rate = E / N;
  let x = 0;
  let k = 0;
  events.forEach((e, i) => {
    const n = totals[i];
    if (!n) return;
    k++;
    const e1 = n * rate;
    const e0 = n * (1 - rate);
    x += (e - e1) ** 2 / e1 + (n - e - e0) ** 2 / e0;
  });
  return k > 1 ? chi2Sf(x, k - 1) : 1;
}

/** Forza dell'evidenza da p-value e numero di eventi. null = non abbastanza per parlarne. */
export function strengthFromP(p: number, events: number): Confidence | null {
  if (p < 0.01 && events >= 15) return 'alta';
  if (p < 0.05) return 'media';
  if (p < 0.15) return 'bassa';
  return null;
}

/** Forza di una stima di frequenza: larghezza dell'intervallo di Wilson. */
function strengthFromCI(k: number, n: number): Confidence {
  const [lo, hi] = wilson(k, n);
  const w = hi - lo;
  return w < 0.25 ? 'alta' : w < 0.45 ? 'media' : 'bassa';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const round1 = (x: number) => Math.round(x * 10) / 10;
const RANK: Record<Confidence, number> = { alta: 0, media: 1, bassa: 2 };
const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const WEEKDAY_FULL = ['la domenica', 'il lunedì', 'il martedì', 'il mercoledì', 'il giovedì', 'il venerdì', 'il sabato'];

function ratioText(a: number, b: number) {
  if (b <= 0) return '';
  const r = a / b;
  if (r >= 1.5) return ` (circa ${round1(r).toLocaleString('it-IT')} volte tanto)`;
  if (r <= 0.67 && r > 0) return ` (circa ${Math.round((1 - r) * 100)}% in meno)`;
  return '';
}

// ---------- Dataset giornaliero condiviso ----------
export interface DailyBase {
  valid: Episode[]; // ordinati per inizio crescente
  startDays: Set<string>; // giorni in cui inizia almeno un attacco
  first: string;
  last: string; // ieri (l'ultimo giorno completo)
  keys: string[];
}

export function dailyBase(ctx: AdvisorContext): DailyBase | null {
  const valid = ctx.episodes.filter((e) => !Number.isNaN(new Date(e.start).getTime())).sort((a, b) => a.start.localeCompare(b.start));
  if (!valid.length) return null;
  const today = dayKey(ctx.now);
  const last = addDays(today, -1);
  const candidates = [dayKey(valid[0].start), ...ctx.days.map((d) => d.date)].filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  const first = candidates.sort()[0];
  if (first > last) return null;
  const startDays = new Set(valid.map((e) => dayKey(e.start)));
  return { valid, startDays, first, last, keys: rangeKeys(first, last) };
}

interface Scored extends Pattern {
  p: number;
}

// ---------- Singole analisi ----------
function timeOfDay(b: DailyBase): Scored | null {
  const bins = [0, 0, 0, 0];
  for (const e of b.valid) bins[Math.floor(new Date(e.start).getHours() / 6)]++;
  const n = bins.reduce((a, c) => a + c, 0);
  const exp = n / 4;
  const x = bins.reduce((s, o) => s + (o - exp) ** 2 / exp, 0);
  const p = chi2Sf(x, 3);
  const s = strengthFromP(p, n);
  const labels = ['Notte', 'Mattino', 'Pomeriggio', 'Sera'];
  const phrases = ['di notte', 'al mattino', 'nel pomeriggio', 'di sera'];
  const ranges = ['0-6', '6-12', '12-18', '18-24'];
  const top = bins.indexOf(Math.max(...bins));
  if (!s || bins[top] / n < 0.4) return null;
  return {
    id: 'fascia-oraria',
    title: `Gli attacchi iniziano soprattutto ${phrases[top]}`,
    detail: `${bins[top]} attacchi su ${n} (${pct(bins[top] / n)}) sono iniziati ${phrases[top]} (ore ${ranges[top]}). Se fosse un caso ci aspetteremmo circa il 25% in ogni fascia. Saperlo ti aiuta a tenere il farmaco a portata di mano nel momento giusto.`,
    strength: s,
    p,
    chart: labels.map((label, i) => ({ label, value: bins[i] }))
  };
}

function weekday(b: DailyBase): Scored | null {
  const ev = Array(7).fill(0);
  const tot = Array(7).fill(0);
  for (const k of b.keys) {
    const d = keyToDate(k).getDay();
    tot[d]++;
    if (b.startDays.has(k)) ev[d]++;
  }
  if (Math.min(...tot) < 4) return null;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const chart = order.map((d) => ({ label: WEEKDAYS[d], value: Math.round((ev[d] / tot[d]) * 100) }));
  const E = ev.reduce((a, c) => a + c, 0);
  const we = { a: ev[0] + ev[6], n: tot[0] + tot[6] };
  const wd = { a: E - we.a, n: tot.reduce((a, c) => a + c, 0) - we.n };
  const t = twoProp(we.a, we.n, wd.a, wd.n);
  const pAll = chi2Rates(ev, tot);
  const sWe = strengthFromP(t.pValue, E);
  if (sWe && t.pValue <= pAll) {
    const more = t.p1 > t.p2;
    return {
      id: 'giorno-settimana',
      title: more ? 'Più attacchi nel weekend' : 'Meno attacchi nel weekend',
      detail: `Nel weekend un attacco è iniziato nel ${pct(t.p1)} dei giorni, nei giorni feriali nel ${pct(t.p2)}${ratioText(t.p1, t.p2)}. ${more ? "Spesso succede quando cambiano gli orari di sonno, pasti e caffè, o quando cala lo stress: mantenere ritmi regolari anche nel weekend può aiutare." : 'Qualcosa dei giorni lavorativi (stress, ritmi, schermi) potrebbe pesare: vale la pena osservarlo.'}`,
      strength: sWe,
      p: t.pValue,
      chart
    };
  }
  const s = strengthFromP(pAll, E);
  if (!s) return null;
  const rates = ev.map((e, i) => (tot[i] ? e / tot[i] : 0));
  const top = rates.indexOf(Math.max(...rates));
  const rest = twoProp(ev[top], tot[top], E - ev[top], tot.reduce((a, c) => a + c, 0) - tot[top]);
  return {
    id: 'giorno-settimana',
    title: `Il giorno più a rischio è ${WEEKDAY_FULL[top]}`,
    detail: `${WEEKDAY_FULL[top].charAt(0).toUpperCase() + WEEKDAY_FULL[top].slice(1)} un attacco è iniziato nel ${pct(rest.p1)} dei casi, negli altri giorni nel ${pct(rest.p2)}${ratioText(rest.p1, rest.p2)}.`,
    strength: s,
    p: pAll,
    chart
  };
}

function cycle(b: DailyBase, ctx: AdvisorContext): Scored | null {
  const starts = periodStarts(ctx.days).filter((s) => s <= b.last);
  if (starts.length < 2) return null;
  const lens = starts.slice(1).map((s, i) => daysBetween(starts[i], s)).filter((l) => l >= 18 && l <= 45);
  const avg = lens.length ? lens.reduce((a, c) => a + c, 0) / lens.length : 28;
  // Giorni in cui il ciclo è stato seguito: dal primo flusso registrato fino a un ciclo dopo l'ultimo
  const from = addDays(starts[0], -2) > b.first ? addDays(starts[0], -2) : b.first;
  const toCand = addDays(starts[starts.length - 1], Math.round(avg) - 3);
  const to = toCand < b.last ? toCand : b.last;
  const keys = rangeKeys(from, to);
  if (keys.length < 30) return null;
  const inWin = (k: string) => starts.some((s) => {
    const d = daysBetween(s, k);
    return d >= -2 && d <= 2; // giorno 1 = s: finestra ICHD da −2 a +3
  });
  let a1 = 0, n1 = 0, a2 = 0, n2 = 0;
  for (const k of keys) {
    const y = b.startDays.has(k) ? 1 : 0;
    if (inWin(k)) {
      n1++;
      a1 += y;
    } else {
      n2++;
      a2 += y;
    }
  }
  const t = twoProp(a1, n1, a2, n2);
  const s = strengthFromP(t.pValue, a1 + a2);
  if (!s || t.p1 <= t.p2) return null;
  return {
    id: 'ciclo',
    title: 'Il ciclo è un momento a rischio',
    detail: `Nei giorni da 2 prima a 3 dopo l'inizio del ciclo un attacco è iniziato nel ${pct(t.p1)} dei giorni, negli altri giorni nel ${pct(t.p2)}${ratioText(t.p1, t.p2)}. Analisi su ${starts.length} cicli registrati. Parlane con il medico: esistono strategie di prevenzione mirate per l'emicrania mestruale.`,
    strength: s,
    p: t.pValue,
    chart: [
      { label: 'Intorno al ciclo', value: Math.round(t.p1 * 100) },
      { label: 'Altri giorni', value: Math.round(t.p2 * 100) }
    ]
  };
}

function weather(b: DailyBase, ctx: AdvisorContext): Scored[] {
  if (!ctx.weather?.length) return [];
  const w = new Map(ctx.weather.map((d) => [d.date, d]));
  const keys = b.keys.filter((k) => w.has(k));
  if (keys.length < 30) return [];
  const out: Scored[] = [];
  const compare = (exposed: (k: string) => boolean) => {
    let a1 = 0, n1 = 0, a2 = 0, n2 = 0;
    for (const k of keys) {
      const y = b.startDays.has(k) ? 1 : 0;
      if (exposed(k)) { n1++; a1 += y; } else { n2++; a2 += y; }
    }
    return { a1, n1, a2, n2, ...twoProp(a1, n1, a2, n2) };
  };

  // Calo di pressione ≥ 5 hPa rispetto al giorno prima, quel giorno o il giorno dopo
  const drop = (k: string | undefined) => !!k && (w.get(k)?.pressureChange ?? 0) <= -5;
  const pr = compare((k) => drop(k) || drop(addDays(k, -1)));
  if (pr.n1 >= 5 && pr.n2 >= 5) {
    const s = strengthFromP(pr.pValue, pr.a1 + pr.a2);
    if (s) {
      const more = pr.p1 > pr.p2;
      out.push({
        id: 'meteo-pressione',
        title: more ? 'Più attacchi quando la pressione cala' : 'Il calo di pressione non sembra pesare',
        detail: `Nel giorno di un calo di pressione di almeno 5 hPa (o nel giorno dopo) un attacco è iniziato nel ${pct(pr.p1)} dei casi, negli altri giorni nel ${pct(pr.p2)}${ratioText(pr.p1, pr.p2)}. Su ${pr.n1} giorni con calo di pressione.`,
        strength: s,
        p: pr.pValue,
        chart: [
          { label: 'Pressione in calo', value: Math.round(pr.p1 * 100) },
          { label: 'Altri giorni', value: Math.round(pr.p2 * 100) }
        ]
      });
    }
  }

  // Caldo: ≥ 30 °C se ci sono abbastanza giorni, altrimenti il 25% dei giorni più caldi
  const temps = keys.map((k) => w.get(k)!.tempMax).sort((x, y) => x - y);
  const hot30 = temps.filter((t) => t >= 30).length;
  const thr = hot30 >= 10 ? 30 : temps[Math.floor(temps.length * 0.75)];
  const hot = compare((k) => w.get(k)!.tempMax >= thr);
  if (hot.n1 >= 5 && hot.n2 >= 5) {
    const s = strengthFromP(hot.pValue, hot.a1 + hot.a2);
    if (s && hot.p1 > hot.p2)
      out.push({
        id: 'meteo-caldo',
        title: 'Il caldo sembra favorire gli attacchi',
        detail: `Nei giorni con massima di almeno ${Math.round(thr)} °C un attacco è iniziato nel ${pct(hot.p1)} dei casi, negli altri nel ${pct(hot.p2)}${ratioText(hot.p1, hot.p2)}. Nei giorni caldi bevi di più e cerca di stare al fresco.`,
        strength: s,
        p: hot.pValue,
        chart: [
          { label: `≥ ${Math.round(thr)} °C`, value: Math.round(hot.p1 * 100) },
          { label: 'Altri giorni', value: Math.round(hot.p2 * 100) }
        ]
      });
  }
  return out;
}

function sinceLast(b: DailyBase): Scored | null {
  const bins = [
    { label: '1 g', lo: 1, hi: 1 },
    { label: '2-3 g', lo: 2, hi: 3 },
    { label: '4-7 g', lo: 4, hi: 7 },
    { label: '8-14 g', lo: 8, hi: 14 },
    { label: '15+ g', lo: 15, hi: Infinity }
  ];
  const ev = bins.map(() => 0);
  const tot = bins.map(() => 0);
  let lastStart: string | null = null;
  for (const k of b.keys) {
    if (lastStart) {
      const d = daysBetween(lastStart, k);
      const i = bins.findIndex((x) => d >= x.lo && d <= x.hi);
      tot[i]++;
      if (b.startDays.has(k)) ev[i]++;
    }
    if (b.startDays.has(k)) lastStart = k;
  }
  const E = ev.reduce((a, c) => a + c, 0);
  const p = chi2Rates(ev, tot);
  const s = strengthFromP(p, E);
  if (!s) return null;
  const rates = ev.map((e, i) => (tot[i] >= 5 ? e / tot[i] : -1));
  const top = rates.indexOf(Math.max(...rates));
  const early = top <= 1;
  return {
    id: 'giorni-da-ultimo',
    title: early ? 'Gli attacchi tendono ad arrivare a gruppi' : 'Dopo un periodo tranquillo il rischio sale',
    detail: early
      ? `Il rischio che inizi un attacco è più alto nei primi giorni dopo l'attacco precedente (${pct(rates[top])} dei giorni a ${bins[top].label} di distanza). Dopo un attacco, nei giorni successivi riposo e ritmi regolari contano di più. Attenzione anche alle ricadute dopo il farmaco.`
      : `Il rischio giornaliero è più alto quando sono passati ${bins[top].label.replace(' g', ' giorni')} dall'ultimo attacco (${pct(rates[top])} dei giorni).`,
    strength: s,
    p,
    chart: bins.map((x, i) => ({ label: x.label, value: tot[i] ? Math.round((ev[i] / tot[i]) * 100) : 0 }))
  };
}

interface Intake { name: string; ok: boolean; delayMin: number }

function intakes(b: DailyBase): Intake[] {
  const out: Intake[] = [];
  for (const e of b.valid)
    for (const m of e.meds) {
      if (!m.efficacy || m.cls === 'antiemetico') continue;
      out.push({ name: m.name, ok: m.efficacy === 'completa', delayMin: Math.max(0, (new Date(m.time).getTime() - new Date(e.start).getTime()) / 60000) });
    }
  return out;
}

function medEfficacy(list: Intake[]): Scored | null {
  const by = new Map<string, { name: string; n: number; k: number }>();
  for (const i of list) {
    const key = i.name.trim().toLowerCase();
    if (!by.has(key)) by.set(key, { name: i.name.trim(), n: 0, k: 0 });
    const r = by.get(key)!;
    r.n++;
    if (i.ok) r.k++;
  }
  const meds = [...by.values()].filter((r) => r.n >= 3).sort((a, b) => b.k / b.n - a.k / a.n || b.n - a.n);
  if (!meds.length) return null;
  const chart = meds.slice(0, 12).map((r) => ({ label: r.name, value: Math.round((r.k / r.n) * 100) }));
  const best = meds[0];
  if (meds.length >= 2) {
    const worst = meds[meds.length - 1];
    const t = twoProp(best.k, best.n, worst.k, worst.n);
    const s = strengthFromP(t.pValue, best.n + worst.n);
    if (s && t.p1 - t.p2 >= 0.15)
      return {
        id: 'farmaci-efficacia',
        title: `${best.name} funziona meglio per te`,
        detail: `Con ${best.name} il dolore è passato del tutto entro 2 ore nel ${pct(t.p1)} dei casi (${best.k} su ${best.n}), con ${worst.name} nel ${pct(t.p2)} (${worst.k} su ${worst.n}). Gli attacchi trattati potrebbero non essere uguali tra loro: confrontalo con il medico.`,
        strength: s,
        p: t.pValue,
        chart
      };
    const k = meds.reduce((a, r) => a + r.k, 0);
    const n = meds.reduce((a, r) => a + r.n, 0);
    return {
      id: 'farmaci-efficacia',
      title: 'Efficacia dei tuoi farmaci',
      detail: `Percentuale di volte in cui il dolore è passato del tutto entro 2 ore (farmaci valutati almeno 3 volte). Per ora non c'è una differenza netta tra i farmaci. In totale: ${pct(k / n)} di risposte complete.`,
      strength: strengthFromCI(k, n),
      p: 0.5,
      chart
    };
  }
  return {
    id: 'farmaci-efficacia',
    title: `${best.name}: passa del tutto nel ${pct(best.k / best.n)} dei casi`,
    detail: `Il dolore è passato del tutto entro 2 ore in ${best.k} assunzioni su ${best.n}. ${best.k / best.n < 0.5 ? 'Se succede spesso che non basti, chiedi al medico se esistono alternative più adatte.' : ''}`.trim(),
    strength: strengthFromCI(best.k, best.n),
    p: 0.5,
    chart
  };
}

function earlyLate(list: Intake[]): Scored | null {
  const early = list.filter((i) => i.delayMin <= 60);
  const late = list.filter((i) => i.delayMin > 60);
  if (early.length < 3 || late.length < 3) return null;
  const ke = early.filter((i) => i.ok).length;
  const kl = late.filter((i) => i.ok).length;
  const t = twoProp(ke, early.length, kl, late.length);
  const diff = t.p1 - t.p2;
  const s = strengthFromP(t.pValue, early.length + late.length) ?? 'bassa';
  const title = diff >= 0.1 ? 'Prenderlo presto funziona meglio' : diff <= -0.1 ? 'Prenderlo presto non ha aiutato di più' : 'Presto o tardi: poca differenza finora';
  return {
    id: 'farmaci-tempismo',
    title,
    detail: `Preso entro 1 ora dall'inizio, il farmaco ha fatto passare del tutto il dolore nel ${pct(t.p1)} dei casi (${ke} su ${early.length}); preso più tardi nel ${pct(t.p2)} (${kl} su ${late.length}).${diff >= 0.1 ? " È coerente con quanto raccomandato: trattare l'attacco quando il dolore è ancora lieve." : ''} Attenzione: gli attacchi trattati presto potrebbero essere anche quelli più leggeri.`,
    strength: s,
    p: t.pValue,
    chart: [
      { label: 'Entro 1 h', value: Math.round(t.p1 * 100) },
      { label: 'Dopo 1 h', value: Math.round(t.p2 * 100) }
    ]
  };
}

// t critici bilaterali per df = 1..4 (p 0.05 e 0.01)
const T05 = [12.71, 4.3, 3.18, 2.78];
const T01 = [63.66, 9.92, 5.84, 4.6];

function trend(b: DailyBase, ctx: AdvisorContext): Scored | null {
  const today = dayKey(ctx.now);
  const win: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const to = addDays(today, -30 * i);
    const from = addDays(to, -29);
    if (from < b.first) continue;
    const s = computeStats(b.valid, from, to, ctx.now);
    const d = keyToDate(to);
    win.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: s.headacheDays });
  }
  const n = win.length;
  if (n < 3) return null;
  const xm = (n - 1) / 2;
  const ym = win.reduce((a, w) => a + w.value, 0) / n;
  let sxx = 0, sxy = 0;
  win.forEach((w, x) => {
    sxx += (x - xm) ** 2;
    sxy += (x - xm) * (w.value - ym);
  });
  const slope = sxy / sxx;
  const sse = win.reduce((a, w, x) => a + (w.value - (ym + slope * (x - xm))) ** 2, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx);
  const t = se > 0 ? Math.abs(slope / se) : slope !== 0 ? Infinity : 0;
  const df = n - 2;
  const p = t >= T01[df - 1] ? 0.005 : t >= T05[df - 1] ? 0.04 : 0.5;
  const dir = slope <= -0.5 ? 'meglio' : slope >= 0.5 ? 'peggio' : 'stabile';
  const lastV = win[n - 1].value;
  const firstV = win[0].value;
  let strength: Confidence;
  if (dir === 'stabile') strength = n >= 5 ? 'media' : 'bassa';
  else strength = p < 0.01 && n >= 5 ? 'alta' : p < 0.05 ? 'media' : 'bassa';
  const perMonth = round1(Math.abs(slope)).toLocaleString('it-IT');
  return {
    id: 'andamento',
    title: dir === 'meglio' ? 'Stai migliorando' : dir === 'peggio' ? 'Il mal di testa sta aumentando' : 'Andamento stabile',
    detail:
      dir === 'stabile'
        ? `Negli ultimi ${n} mesi i giorni con mal di testa sono rimasti simili (da ${firstV} a ${lastV} al mese).`
        : `Negli ultimi ${n} mesi i giorni con mal di testa sono ${dir === 'meglio' ? 'diminuiti' : 'aumentati'} di circa ${perMonth} al mese (da ${firstV} a ${lastV}).${dir === 'peggio' ? ' Se continua, parlane con il medico: potrebbe essere utile una terapia di prevenzione o rivedere quella in corso.' : ''}${strength === 'bassa' ? ' La tendenza però non è ancora netta.' : ''}`,
    strength,
    p: dir === 'stabile' ? 0.5 : p,
    chart: win
  };
}

function durationChange(b: DailyBase, ctx: AdvisorContext): Scored | null {
  const cut = addDays(dayKey(ctx.now), -90);
  const closed = b.valid.filter((e) => e.end && durationMin(e, ctx.now) > 0);
  const recent = closed.filter((e) => dayKey(e.start) >= cut).map((e) => durationMin(e, ctx.now));
  const before = closed.filter((e) => dayKey(e.start) < cut).map((e) => durationMin(e, ctx.now));
  if (recent.length < 5 || before.length < 5) return null;
  const stats = (xs: number[]) => {
    const l = xs.map(Math.log);
    const m = l.reduce((a, c) => a + c, 0) / l.length;
    const v = l.reduce((a, c) => a + (c - m) ** 2, 0) / (l.length - 1);
    return { m, v, n: l.length, mean: xs.reduce((a, c) => a + c, 0) / xs.length };
  };
  const r = stats(recent);
  const o = stats(before);
  const se = Math.sqrt(r.v / r.n + o.v / o.n);
  const p = se > 0 ? 2 * (1 - normCdf(Math.abs(r.m - o.m) / se)) : 1;
  const ratio = Math.exp(r.m - o.m);
  const s = strengthFromP(p, r.n + o.n);
  if (!s || Math.abs(ratio - 1) < 0.2) return null;
  const shorter = ratio < 1;
  return {
    id: 'durata',
    title: shorter ? 'Gli attacchi durano meno di prima' : 'Gli attacchi durano più di prima',
    detail: `Negli ultimi 3 mesi un attacco è durato in media ${formatDuration(r.mean)}, prima ${formatDuration(o.mean)} (circa ${Math.round(Math.abs(1 - ratio) * 100)}% ${shorter ? 'in meno' : 'in più'}).`,
    strength: s,
    p,
    chart: [
      { label: 'Prima (ore)', value: round1(o.mean / 60) },
      { label: 'Ultimi 3 mesi (ore)', value: round1(r.mean / 60) }
    ]
  };
}

function triggers(b: DailyBase): Scored | null {
  const n = b.valid.length;
  const map = new Map<string, number>();
  for (const e of b.valid) for (const t of new Set(e.triggers)) map.set(t, (map.get(t) ?? 0) + 1);
  const list = [...map.entries()].filter(([, c]) => c >= 3 && c / n >= 0.15).sort((a, b) => b[1] - a[1]);
  if (!list.length) return null;
  const [topId, topC] = list[0];
  const label = labelOf(TRIGGERS, topId);
  const withAny = b.valid.filter((e) => e.triggers.length).length;
  let strength = strengthFromCI(topC, n);
  if (strength === 'alta') strength = 'media'; // è solo una frequenza, non una causa
  if (withAny < 15) strength = 'bassa';
  return {
    id: 'fattori-frequenti',
    title: `Fattore più segnalato: ${label.toLowerCase()}`,
    detail: `"${label}" è presente nel ${pct(topC / n)} degli attacchi (${topC} su ${n}).${list[1] ? ` Seguono: ${list.slice(1, 3).map(([id, c]) => `${labelOf(TRIGGERS, id).toLowerCase()} (${pct(c / n)})`).join(', ')}.` : ''} Questi fattori vengono annotati solo nei giorni con mal di testa: indicano cosa accompagna spesso i tuoi attacchi, non quanto aumentino il rischio.`,
    strength,
    p: 0.5,
    chart: list.slice(0, 8).map(([id, c]) => ({ label: labelOf(TRIGGERS, id), value: Math.round((c / n) * 100) }))
  };
}

/** Pattern individuati nei dati dell'utente, dal più solido al meno solido. */
export function findPatterns(ctx: AdvisorContext): Pattern[] {
  const b = dailyBase(ctx);
  if (!b || b.valid.length < MIN_EPISODES) return [];
  const med = intakes(b);
  const all: (Scored | null)[] = [
    timeOfDay(b),
    weekday(b),
    cycle(b, ctx),
    ...weather(b, ctx),
    sinceLast(b),
    medEfficacy(med),
    earlyLate(med),
    trend(b, ctx),
    durationChange(b, ctx),
    triggers(b)
  ];
  return all
    .filter((x): x is Scored => !!x)
    .sort((a, c) => RANK[a.strength] - RANK[c.strength] || a.p - c.p)
    .map(({ p: _p, ...rest }) => rest);
}
