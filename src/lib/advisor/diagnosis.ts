// Inquadramento probabile sull'intero storico (criteri ICHD-3 semplificati, applicati all'insieme degli episodi).
// Non è una diagnosi: serve a dare all'utente e al medico una lettura ordinata dei dati del diario.
import { THRESHOLDS as T, TYPICAL_AURAS } from '../catalog';
import { addDays, chronicStatus, classify, computeStats, cycleCorrelation, dayKey, daysBetween, mohStatus, type ClassId, type Classification } from '../clinic';
import type { Episode } from '../types';
import type { AdvisorContext, Confidence, Diagnosis } from './types';

/** Numero minimo di attacchi compatibili richiesto dall'ICHD-3 per ciascun quadro. */
export const ICHD_MIN = { senzaAura: 5, conAura: 2, tensiva: 10, grappolo: 5 } as const;

const r = (x: number) => Math.round(x);

/** Giorni di cefalea / emicrania al mese (normalizzati a 30) negli ultimi 90 giorni o dall'inizio del diario se più breve. */
export function recentFrequency(ctx: AdvisorContext) {
  if (!ctx.episodes.length) return null;
  const today = dayKey(ctx.now);
  const first = ctx.episodes.map((e) => dayKey(e.start)).sort()[0];
  const span = daysBetween(first, today) + 1;
  const window = Math.min(90, Math.max(30, span));
  const stats = computeStats(ctx.episodes, addDays(today, -(window - 1)), today, ctx.now);
  return { stats, window, headache: stats.per30(stats.headacheDays), migraine: stats.per30(stats.migraineDays) };
}

export function frequencyClass(perMonth: number): 'bassa' | 'alta' | 'cronica' {
  if (perMonth >= T.chronicDays) return 'cronica';
  if (perMonth >= 8) return 'alta';
  return 'bassa';
}

const FREQ_SUFFIX = { bassa: ' a bassa frequenza', alta: ' ad alta frequenza', cronica: ' con giorni di dolore molto frequenti' };

const pct = (a: number, b: number) => (b ? r((a / b) * 100) : 0);

function missingData(ctx: AdvisorContext, closed: Episode[], cls: Classification[]): string[] {
  const out: string[] = [];
  const now = ctx.now.getTime();
  const stuck = ctx.episodes.filter((e) => !e.end && now - new Date(e.start).getTime() > T.stuckEpisodeHours * 3600000);
  if (stuck.length) out.push('Registra la durata chiudendo gli episodi ancora aperti');
  if (closed.length < ICHD_MIN.senzaAura) out.push('Continua a registrare ogni attacco: ne servono almeno 5 per un inquadramento');
  const n = closed.length || 1;
  const noSide = closed.filter((e) => !e.side).length / n;
  const noQuality = closed.filter((e) => !e.quality.length).length / n;
  const noSymptoms = closed.filter((e) => !e.symptoms.length).length / n;
  if (noSide > 0.3 && noQuality > 0.3) out.push('Indica lato e tipo di dolore negli episodi');
  else if (noSide > 0.3) out.push('Indica il lato del dolore negli episodi');
  else if (noQuality > 0.3) out.push('Indica il tipo di dolore (pulsante, a peso…) negli episodi');
  if (noSymptoms > 0.3) out.push('Segna i sintomi associati, come nausea o fastidio per luce e rumori');
  if (closed.some((e) => e.aura.length && e.auraDurationMin == null)) out.push("Indica quanto dura l'aura");
  const meds = ctx.episodes.flatMap((e) => e.meds.filter((m) => m.cls !== 'antiemetico'));
  if (meds.length >= 3 && meds.filter((m) => !m.efficacy).length / meds.length > 0.5)
    out.push("Segna se il farmaco ha funzionato dopo 2 ore");
  if (closed.length >= 3 && closed.filter((e) => !e.disability).length / n > 0.5) out.push('Indica quanto il dolore ti ha limitato');
  if (!cls.length && ctx.episodes.length) out.push('Chiudi gli episodi indicando quando è finito il dolore');
  return out;
}

export function overallDiagnosis(ctx: AdvisorContext): Diagnosis {
  const now = ctx.now;
  const today = dayKey(now);
  const closed = ctx.episodes.filter((e) => e.end);
  const cls = closed.map((e) => classify(e, now));
  const count = (...ids: ClassId[]) => cls.filter((c) => ids.includes(c.id)).length;
  const nMig = count('emicrania');
  const nAura = count('emicrania_aura');
  const nProbMig = count('prob_emicrania');
  const nTT = count('tensiva');
  const nProbTT = count('prob_tensiva');
  const nCl = count('grappolo');
  const nClassified = closed.length - count('non_class');
  const migTot = nMig + nAura + nProbMig;
  const ttTot = nTT + nProbTT;
  const incompleteRatio = closed.length ? cls.filter((c) => c.incomplete).length / closed.length : 1;

  const freq = recentFrequency(ctx);
  const frequency = freq ? frequencyClass(freq.headache) : null;
  const chronic = chronicStatus(ctx.episodes, now);
  const missing = missingData(ctx, closed, cls);

  // ---- Quadri secondari ----
  const secondary: Diagnosis['secondary'] = [];
  const moh = mohStatus(ctx.episodes, today);
  const over = moh.filter((m) => m.status === 'over');
  const overMain = over.find((m) => !m.key.endsWith('_all')) ?? over[0];
  if (overMain) {
    const proper = overMain.persistent && (freq?.headache ?? 0) >= T.chronicDays;
    secondary.push({
      label: proper ? 'Compatibile con cefalea da uso eccessivo di farmaci' : 'Rischio di cefalea da uso eccessivo di farmaci',
      reason: `${overMain.label}: ${overMain.days} giorni negli ultimi 30 (soglia ${overMain.limit})${overMain.persistent ? ', da oltre 3 mesi' : ''}`
    });
  }
  const cc = cycleCorrelation(ctx.episodes, ctx.days, now);
  if (cc?.pattern) {
    secondary.push({
      label: cc.pct >= 0.9 ? 'Compatibile con emicrania mestruale pura' : 'Emicrania correlata al ciclo mestruale',
      reason: `Attacchi intorno all'inizio del ciclo in ${cc.cyclesWithAttack} degli ultimi ${cc.cycles} cicli (${pct(cc.perimenstrual, cc.total)}% degli attacchi)`
    });
  }
  const atypical = ctx.episodes.filter((e) => e.aura.some((a) => !TYPICAL_AURAS.includes(a)) || (e.auraDurationMin ?? 0) > 60);
  if (atypical.length)
    secondary.push({
      label: 'Aura atipica da valutare con il medico',
      reason: `${atypical.length} ${atypical.length === 1 ? 'episodio' : 'episodi'} con aura non tipica (debolezza, disturbi della vista di un occhio, visione doppia o aura oltre 60 minuti)`
    });

  // ---- Dati insufficienti ----
  if (closed.length < 3 || nClassified < 2) {
    return {
      id: 'insufficiente',
      label: 'Ancora pochi dati per un inquadramento',
      confidence: 'bassa',
      reasons: [
        closed.length
          ? `Hai registrato ${closed.length} ${closed.length === 1 ? 'episodio concluso' : 'episodi conclusi'}, ${nClassified} con dettagli sufficienti.`
          : 'Non ci sono ancora episodi conclusi.',
        'Ogni attacco registrato rende il quadro più preciso: stai andando bene, continua così!'
      ],
      missing,
      secondary,
      frequency
    };
  }

  // ---- Quadro principale ----
  const migMet = nMig >= ICHD_MIN.senzaAura;
  const auraMet = nAura >= ICHD_MIN.conAura;
  const ttMet = nTT >= ICHD_MIN.tensiva;
  const clMet = nCl >= ICHD_MIN.grappolo;
  const suffix = frequency ? FREQ_SUFFIX[frequency] : '';
  const reasons: string[] = [];
  let id: string;
  let label: string;
  let met = true;

  if (chronic.possibleChronicMigraine) {
    id = 'emicrania_cronica';
    label = 'Compatibile con emicrania cronica';
    reasons.push(`Mal di testa in almeno 15 giorni al mese da ${chronic.months} mesi, con almeno 8 giorni di emicrania al mese`);
  } else if (chronic.months >= 3 && ttTot > migTot) {
    id = 'tensiva_cronica';
    label = 'Compatibile con cefalea tensiva cronica';
    reasons.push(`Mal di testa in almeno 15 giorni al mese da ${chronic.months} mesi, con caratteristiche soprattutto tensive`);
  } else if (chronic.months >= 3) {
    id = 'cefalea_cronica';
    label = 'Cefalea cronica (mal di testa quasi tutti i giorni)';
    reasons.push(`Mal di testa in almeno 15 giorni al mese da ${chronic.months} mesi`);
  } else if (clMet && nCl >= migTot) {
    id = 'grappolo';
    label = 'Compatibile con cefalea a grappolo';
  } else if (auraMet) {
    id = 'emicrania_con_aura';
    label = `Compatibile con emicrania con aura${suffix}`;
  } else if (migMet) {
    id = 'emicrania_senza_aura';
    label = `Compatibile con emicrania episodica senza aura${suffix}`;
  } else if (clMet) {
    id = 'grappolo';
    label = 'Compatibile con cefalea a grappolo';
  } else if (ttMet) {
    id = 'tensiva_episodica';
    label = `Compatibile con cefalea tensiva episodica${suffix}`;
  } else if (migTot >= 3) {
    id = 'probabile_emicrania';
    label = 'Probabile emicrania: servono altri attacchi per confermarla';
    met = false;
  } else if (ttTot >= 3) {
    id = 'probabile_tensiva';
    label = 'Probabile cefalea tensiva: servono altri attacchi per confermarla';
    met = false;
  } else {
    id = 'non_classificabile';
    label = 'Quadro non ancora classificabile';
    met = false;
  }

  // Motivazioni basate sui conteggi
  if (nMig) reasons.push(`${nMig} attacchi con le caratteristiche dell'emicrania senza aura (ne servono almeno ${ICHD_MIN.senzaAura})`);
  if (nAura) reasons.push(`${nAura} attacchi con aura tipica (visiva, sensitiva o del linguaggio; ne servono almeno ${ICHD_MIN.conAura})`);
  if (nProbMig) reasons.push(`${nProbMig} attacchi con quasi tutte le caratteristiche dell'emicrania`);
  if (nCl) reasons.push(`${nCl} attacchi brevi, forti, attorno all'occhio con lacrimazione o naso chiuso (ne servono almeno ${ICHD_MIN.grappolo})`);
  if (nTT && (id.includes('tensiva') || nTT >= 3)) reasons.push(`${nTT} episodi con le caratteristiche della cefalea tensiva (ne servono almeno ${ICHD_MIN.tensiva})`);
  if (freq)
    reasons.push(
      `In media ${r(freq.headache)} giorni di mal di testa al mese${freq.migraine >= 1 ? `, di cui ${r(freq.migraine)} di emicrania` : ''} (ultimi ${freq.window} giorni)`
    );
  const sides = closed.filter((e) => e.side);
  const uni = sides.filter((e) => e.side === 'sinistro' || e.side === 'destro' || e.side === 'alternante').length;
  if (id.includes('emicrania') && sides.length >= 3 && uni / sides.length >= 0.5) reasons.push(`Dolore su un lato nel ${pct(uni, sides.length)}% degli attacchi`);
  const withNausea = closed.filter((e) => e.symptoms.includes('nausea') || e.symptoms.includes('vomito')).length;
  if (id.includes('emicrania') && withNausea >= 2) reasons.push(`Nausea o vomito nel ${pct(withNausea, closed.length)}% degli attacchi`);

  // Quadri coesistenti
  const migPrimary = id.includes('emicrania');
  if (migPrimary && ttTot >= 3) secondary.push({ label: 'Cefalea tensiva coesistente', reason: `${ttTot} episodi con caratteristiche tensive (dolore a fascia, lieve-moderato)` });
  if (!migPrimary && migTot >= 3 && id !== 'cefalea_cronica') secondary.push({ label: 'Attacchi di tipo emicranico', reason: `${migTot} attacchi con caratteristiche dell'emicrania` });
  if (id === 'emicrania_con_aura' && migMet) secondary.push({ label: 'Anche attacchi di emicrania senza aura', reason: `${nMig} attacchi senza aura` });
  if (frequency === 'cronica' && chronic.months < 3 && !id.includes('cronica'))
    secondary.push({ label: 'Frequenza molto alta nell’ultimo periodo', reason: `${r(freq!.headache)} giorni al mese: se dura oltre 3 mesi si parla di forma cronica` });

  // ---- Confidenza ----
  let confidence: Confidence;
  if (closed.length < 5 || incompleteRatio > 0.5) confidence = 'bassa';
  else if (closed.length >= 10 && incompleteRatio <= 0.3 && met) confidence = 'alta';
  else confidence = 'media';

  return { id, label, confidence, reasons, missing, secondary, frequency };
}
