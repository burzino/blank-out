// Coach: consigli pratici e NON medici per oggi, durante l'attacco e per la settimana.
// Nessun farmaco specifico e nessuna dose: solo abitudini e gesti concreti.
import { addDays, dayKey } from '../clinic';
import type { CheckIn } from '../types';
import type { AdvisorContext, DailyPlan, Forecast, TriggerRisk, WeeklyGoal } from './types';

type Action = DailyPlan['actions'][number];
type Factor = { id: string; label: string };

const fmtRr = (rr: number) => (Math.round(rr * 10) / 10).toString().replace('.', ',');

/** Spiega il perché di un'azione: dato personale se disponibile, altrimenti conoscenza generale. */
function reason(triggers: TriggerRisk[], id: string, generic: string, today?: Factor): string {
  const t = triggers.find((x) => x.id === id);
  const pre = today ? `Oggi: ${today.label.toLowerCase()}. ` : '';
  if (t && t.basis !== 'generale' && t.rr >= 1.2) {
    const effect =
      t.rr >= 1.8 && t.rr < 2.3
        ? 'per te circa raddoppia il rischio di un attacco'
        : t.rr >= 1.8
          ? `per te porta il rischio a circa ${fmtRr(t.rr)} volte`
          : `per te aumenta il rischio di circa il ${Math.round((t.rr - 1) * 100)}%`;
    return `${pre}${t.label}: ${effect} (dati del tuo diario).`;
  }
  return pre + generic;
}

// Azioni per fattore. `action` = per i giorni a rischio; `habit` = abitudine di mantenimento.
const ACTIONS: Record<string, { action: string; habit: string; generic: string }> = {
  prodrome: {
    action: 'Tieni il tuo farmaco in borsa: se il dolore arriva, prendilo all’inizio, come concordato con il medico.',
    habit: 'Impara i tuoi segnali premonitori: segnali nel check-in quando li senti.',
    generic: 'I segnali premonitori spesso anticipano l’attacco di 24-48 ore: è il momento giusto per prepararsi.'
  },
  sleep_poco: {
    action: 'Stasera a letto alla solita ora, senza fare tardi. Un riposino breve, sotto i 20 minuti, va bene.',
    habit: 'Vai a letto e alzati più o meno alla stessa ora, anche nel weekend.',
    generic: 'Per molte persone con emicrania dormire poco è uno dei fattori scatenanti più comuni.'
  },
  sleep_troppo: {
    action: 'Domattina sveglia alla solita ora, anche se è festa: dormire troppo può scatenare il dolore.',
    habit: 'Sveglia alla stessa ora tutti i giorni, anche nel weekend.',
    generic: 'Per molte persone con emicrania anche dormire troppo può scatenare un attacco.'
  },
  weekend: {
    action: 'Stasera a letto alla solita ora, anche se è venerdì o sabato. Colazione agli orari di sempre.',
    habit: 'Nel weekend mantieni orari di sonno e pasti simili alla settimana.',
    generic: 'Per molte persone con emicrania i cambi di ritmo del weekend favoriscono gli attacchi.'
  },
  stress_alto: {
    action: 'Prenditi 10 minuti di rilassamento: prova la respirazione 4-7-8 (inspira 4, trattieni 7, espira 8).',
    habit: '10 minuti al giorno di rilassamento o respirazione lenta.',
    generic: 'Per molte persone con emicrania lo stress, e anche il calo dopo lo stress, favorisce gli attacchi.'
  },
  meals_saltato: {
    action: 'Pranza entro le 13:30 e tieni uno spuntino in borsa.',
    habit: 'Tre pasti a orari regolari, colazione compresa.',
    generic: 'Per molte persone con emicrania saltare un pasto è un fattore scatenante frequente.'
  },
  water_poca: {
    action: 'Bevi 1,5-2 litri d’acqua: tieni una bottiglia a vista.',
    habit: 'Una bottiglia d’acqua sempre a portata di mano.',
    generic: 'Per molte persone con emicrania bere poco può favorire il dolore.'
  },
  caffeine_piu: {
    action: 'Caffè come al solito: né di più né di meno, e non dopo pranzo.',
    habit: 'Caffè costante ogni giorno, al massimo 2 tazze.',
    generic: 'Per molte persone con emicrania sia l’eccesso sia la mancanza di caffeina possono scatenare il dolore.'
  },
  caffeine_meno: {
    action: 'Caffè come al solito: né di più né di meno. Se vuoi ridurlo, fallo poco alla volta.',
    habit: 'Caffè costante ogni giorno, al massimo 2 tazze.',
    generic: 'Per molte persone con emicrania saltare il solito caffè può scatenare il dolore.'
  },
  alcohol: {
    action: 'Evita l’alcol stasera.',
    habit: 'Alcol al massimo una sera a settimana.',
    generic: 'Per molte persone con emicrania l’alcol, soprattutto vino rosso, è un fattore scatenante.'
  },
  no_exercise: {
    action: 'Fai una camminata di 20-30 minuti a passo svelto.',
    habit: 'Movimento aerobico almeno 3 volte a settimana.',
    generic: 'L’attività aerobica regolare è una delle abitudini con più prove nel ridurre gli attacchi.'
  },
  perimenstrual: {
    action: 'Sono i giorni del ciclo: pasti regolari, acqua e sonno curati. Tieni a portata il farmaco previsto dal medico.',
    habit: 'Segna i giorni del ciclo: aiuta a prevedere i giorni a rischio.',
    generic: 'Per molte donne con emicrania i giorni intorno al ciclo sono quelli più a rischio.'
  },
  pressure_drop: {
    action: 'Il tempo sta cambiando: oggi non sommare altri fattori. Pasti regolari, acqua e niente nottate.',
    habit: 'Nei giorni di cambio meteo cura di più sonno, pasti e acqua.',
    generic: 'Per alcune persone con emicrania il calo di pressione atmosferica favorisce gli attacchi.'
  },
  screens: {
    action: 'Pause dagli schermi ogni ora: 5 minuti guardando lontano. Abbassa la luminosità.',
    habit: 'Pause regolari dagli schermi.',
    generic: 'Per molte persone con emicrania la luce intensa e gli schermi affaticano e favoriscono il dolore.'
  }
};

// Ordine di importanza dei fattori presenti oggi
const FACTOR_ORDER = ['prodrome', 'perimenstrual', 'sleep_poco', 'sleep_troppo', 'meals_saltato', 'stress_alto', 'water_poca', 'alcohol', 'caffeine_meno', 'caffeine_piu', 'pressure_drop', 'weekend', 'no_exercise', 'screens'];
const MODIFIABLE = ['sleep_poco', 'sleep_troppo', 'stress_alto', 'meals_saltato', 'water_poca', 'caffeine_piu', 'caffeine_meno', 'alcohol', 'no_exercise', 'weekend'];

function levelOf(fc: Forecast, factors: Factor[]): DailyPlan['level'] {
  if (fc.available && fc.level) return fc.level;
  if (factors.some((f) => f.id === 'prodrome') || factors.length >= 3) return 'alto';
  return factors.length ? 'medio' : 'basso';
}

export function dailyPlan(ctx: AdvisorContext, fc: Forecast, triggers: TriggerRisk[], todayFactors: Factor[]): DailyPlan {
  const level = levelOf(fc, todayFactors);
  const max = level === 'alto' ? 4 : level === 'medio' ? 3 : 2;
  const actions: Action[] = [];
  const has = (id: string) => actions.some((a) => a.id === id);
  const push = (id: string, kind: 'action' | 'habit', today?: Factor) => {
    const a = ACTIONS[id];
    if (!a || has(id) || actions.length >= max) return;
    // Le due varianti del caffè danno lo stesso consiglio
    if (id.startsWith('caffeine') && actions.some((x) => x.id.startsWith('caffeine'))) return;
    actions.push({ id, text: kind === 'action' ? a.action : a.habit, why: reason(triggers, id, a.generic, today) });
  };
  const personal = [...triggers].filter((t) => t.rr > 1.1 && ACTIONS[t.id]).sort((a, b) => b.rr - a.rr);

  if (level === 'basso') {
    // Abitudini di mantenimento sui trigger personali più forti
    for (const t of personal.filter((t) => MODIFIABLE.includes(t.id))) push(t.id, 'habit');
    for (const id of ['water_poca', 'no_exercise']) push(id, 'habit');
    return {
      level,
      headline: 'Rischio basso oggi: ottimo! Continua con le tue buone abitudini.',
      actions
    };
  }

  const factors = [...todayFactors].sort((a, b) => {
    const ia = FACTOR_ORDER.indexOf(a.id);
    const ib = FACTOR_ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const f of factors) push(f.id, 'action', f);
  // Venerdì e sabato sera: se il weekend è un tuo fattore, ricorda gli orari
  const wk = triggers.find((t) => t.id === 'weekend');
  if ([5, 6].includes(ctx.now.getDay()) && wk && wk.basis !== 'generale' && wk.rr >= 1.2) push('weekend', 'action');
  // Nei giorni ad alto rischio: essere pronti a trattare presto
  if (level === 'alto' && !has('prodrome') && !has('perimenstrual')) {
    const a = ACTIONS.prodrome;
    if (actions.length >= max) actions.pop();
    actions.push({ id: 'pronto', text: a.action, why: 'Oggi il rischio è più alto: trattare l’attacco all’inizio funziona meglio.' });
  }
  // Dai trigger personali solo azioni su fattori modificabili (prodromi e ciclo solo se presenti oggi)
  for (const t of personal.filter((t) => MODIFIABLE.includes(t.id))) push(t.id, 'action');
  for (const id of ['water_poca', 'stress_alto', 'no_exercise']) if (actions.length < 2) push(id, 'action');

  const names = factors.filter((f) => ACTIONS[f.id]).slice(0, 2).map((f) => f.label.toLowerCase());
  const headline =
    level === 'alto'
      ? `Oggi il rischio è più alto${names.length ? ` (${names.join(', ')})` : ''}. Qualche attenzione in più ti aiuta.`
      : `Rischio medio oggi${names.length ? ` (${names.join(', ')})` : ''}. Piccoli gesti fanno la differenza.`;
  return { level, headline, actions };
}

export function attackPlan(ctx: AdvisorContext): { id: string; text: string }[] {
  const today = dayKey(ctx.now);
  const eps = ctx.episodes.filter((e) => dayKey(e.start) >= addDays(today, -179));
  const n = eps.length;
  const share = (pred: (s: string[]) => boolean) => (n ? eps.filter((e) => pred(e.symptoms)).length / n : 0);
  const nausea = n >= 3 && share((s) => s.includes('nausea') || s.includes('vomito')) >= 0.4;
  const neck = n >= 3 && share((s) => s.includes('cervicalgia')) >= 0.4;
  const sensory = n >= 3 && share((s) => s.includes('fotofobia') || s.includes('fonofobia')) >= 0.4;
  const meds = eps.flatMap((e) => e.meds.filter((m) => m.cls !== 'antiemetico'));
  const noEfficacy = meds.length >= 2 && meds.filter((m) => !m.efficacy).length / meds.length > 0.5;
  const durs = eps.filter((e) => e.end).map((e) => (new Date(e.end!).getTime() - new Date(e.start).getTime()) / 3600000);
  const longAttacks = durs.length >= 3 && durs.filter((h) => h >= 12).length / durs.length >= 0.5;
  const hasMeds = ctx.medications.some((m) => !m.archived && m.cls !== 'antiemetico');

  const out: { id: string; text: string }[] = [];
  out.push({
    id: 'farmaco',
    text: hasMeds
      ? 'Se il tuo medico ti ha indicato un sintomatico, prendilo subito, quando il dolore è ancora lieve.'
      : 'Chiedi al medico quale farmaco usare per gli attacchi e tienilo sempre con te.'
  });
  out.push({
    id: 'buio',
    text: sensory
      ? 'Luce e rumori ti danno fastidio: vai in una stanza buia e silenziosa, metti via telefono e schermi. Se riesci, dormi.'
      : 'Stanza buia e silenziosa, lontano dagli schermi. Stenditi e, se riesci, dormi.'
  });
  out.push({
    id: 'freddo',
    text: neck
      ? 'Impacco freddo sulla fronte per 15-20 minuti. Se il collo è rigido, prova il caldo sulla nuca.'
      : 'Impacco freddo su fronte o nuca per 15-20 minuti.'
  });
  out.push({
    id: 'acqua',
    text: nausea
      ? 'Contro la nausea: piccoli sorsi d’acqua fresca. Lo zenzero può aiutare.'
      : 'Bevi acqua a piccoli sorsi e respira lentamente.'
  });
  if (noEfficacy || longAttacks)
    out.push({
      id: 'efficacia',
      text: 'Dopo 2 ore segna nel diario se il farmaco ha funzionato: così tu e il medico capite cosa funziona davvero.'
    });
  else out.push({ id: 'riposo', text: 'Concediti una pausa: rimanda gli impegni non urgenti, senza sensi di colpa.' });
  return out.slice(0, 5);
}

// ---------- Obiettivi settimanali ----------
const GOALS: { id: string; triggers: string[]; title: string; target: number; unit: string; ok: (c: CheckIn) => boolean; generic: string }[] = [
  { id: 'sonno', triggers: ['sleep_poco', 'sleep_troppo', 'weekend'], title: 'Dormi il giusto', target: 5, unit: 'giorni', ok: (c) => c.sleep === 'ok', generic: 'Un sonno regolare è una delle abitudini più utili contro l’emicrania.' },
  { id: 'pasti', triggers: ['meals_saltato'], title: 'Pasti regolari', target: 6, unit: 'giorni', ok: (c) => c.meals === 'regolari', generic: 'Saltare i pasti è un fattore scatenante frequente.' },
  { id: 'acqua', triggers: ['water_poca'], title: 'Bevi abbastanza', target: 6, unit: 'giorni', ok: (c) => c.water === 'ok', generic: 'Bere poco può favorire il dolore.' },
  { id: 'stress', triggers: ['stress_alto'], title: 'Stress sotto controllo (10 minuti di relax al giorno)', target: 5, unit: 'giorni', ok: (c) => !!c.stress && c.stress !== 'alto', generic: 'Il rilassamento regolare riduce gli attacchi legati allo stress.' },
  { id: 'movimento', triggers: ['no_exercise'], title: 'Movimento almeno 3 volte', target: 3, unit: 'volte', ok: (c) => !!c.exercise, generic: 'L’attività aerobica regolare riduce gli attacchi.' },
  { id: 'alcol', triggers: ['alcohol'], title: 'Alcol al massimo 1 sera', target: 6, unit: 'giorni senza alcol', ok: (c) => !c.alcohol, generic: 'L’alcol è un fattore scatenante comune.' },
  { id: 'caffe', triggers: ['caffeine_piu', 'caffeine_meno'], title: 'Caffè costante, il solito', target: 5, unit: 'giorni', ok: (c) => c.caffeine === 'solito', generic: 'Sbalzi di caffeina, in più o in meno, possono scatenare il dolore.' }
];

export function weeklyGoals(ctx: AdvisorContext, triggers: TriggerRisk[]): WeeklyGoal[] {
  const today = dayKey(ctx.now);
  const monday = addDays(today, -((ctx.now.getDay() + 6) % 7));
  const sunday = addDays(monday, 6);
  const week = ctx.days.filter((d) => d.checkin && d.date >= monday && d.date <= sunday).map((d) => d.checkin!);
  const everCheckin = ctx.days.some((d) => d.checkin);
  const checkinGoal: WeeklyGoal = {
    id: 'checkin',
    title: 'Fai il check-in 5 giorni su 7',
    why: 'Bastano 10 secondi al giorno: servono per scoprire quali sono i tuoi fattori scatenanti.',
    target: 5,
    done: week.length,
    unit: 'giorni'
  };
  if (!everCheckin) return [checkinGoal];

  const out: WeeklyGoal[] = [];
  const ranked = [...triggers].filter((t) => t.rr > 1.1).sort((a, b) => b.rr - a.rr);
  const addGoal = (g: (typeof GOALS)[number], t?: TriggerRisk) => {
    if (out.length >= 3 || out.some((x) => x.id === g.id)) return;
    out.push({
      id: g.id,
      title: g.title,
      why: t ? reason(triggers, t.id, g.generic) : g.generic,
      target: g.target,
      done: Math.min(g.target, week.filter(g.ok).length),
      unit: g.unit
    });
  };
  for (const t of ranked) {
    const g = GOALS.find((x) => x.triggers.includes(t.id));
    if (g) addGoal(g, t);
  }
  if (week.length < 5 && out.length < 3) out.push(checkinGoal);
  // Se i dati personali non indicano nulla: abitudini con più prove
  for (const id of ['sonno', 'movimento']) {
    if (out.length >= 2) break;
    addGoal(GOALS.find((g) => g.id === id)!);
  }
  return out.slice(0, 3);
}
