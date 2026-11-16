// Consigli personalizzati basati sulle linee guida (EHF, AHS, SISC, ICHD-3).
// Regole: mai prescrizioni né dosaggi; ogni consiglio cita il dato personale che lo attiva.
import { RED_FLAGS_SOON, RED_FLAGS_URGENT, TRIGGERS, labelOf } from '../catalog';
import { addDays, autoRedFlag, chronicStatus, computeStats, cycleCorrelation, dayKey, daysBetween, mohStatus, prophylaxisEfficacy, questionnaireDue } from '../clinic';
import { recentFrequency } from './diagnosis';
import type { Advice, AdviceCategory, AdvisorContext, Diagnosis } from './types';

export const ADVISOR_DISCLAIMER =
  "Questi consigli sono indicativi, generati automaticamente dai dati del tuo diario sulla base delle linee guida, e non sostituiscono il parere del medico. Non iniziare, modificare o sospendere alcuna terapia senza averne parlato con il tuo medico.";

const MAX_ADVICE = 10;
const CATEGORY_ORDER: AdviceCategory[] = ['urgente', 'visita', 'prevenzione', 'terapia_acuta', 'stile_di_vita', 'diario'];
const r = (x: number) => Math.round(x);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (k: string) => {
  const [y, m, d] = k.split('-');
  return `${d}/${m}/${y}`;
};

const SRC = {
  ichd: 'ICHD-3',
  ehfProf: 'Linee guida EHF 2022 / AHS 2021 (prevenzione)',
  ehfAcute: 'Linee guida EHF / EAN (terapia acuta); SISC',
  sisc: 'Linee guida SISC',
  ehfLife: 'EHF; SISC (misure non farmacologiche)',
  snoop: 'Red flags SNOOP4'
};

const RED_FLAG_SHORT: Record<string, string> = {
  thunderclap: 'dolore improvviso e violentissimo',
  neuro: 'disturbi neurologici non tipici',
  fever_neck: 'febbre con collo rigido',
  trauma: 'trauma alla testa',
  seizure: 'convulsioni o perdita di coscienza',
  over50: 'primo mal di testa dopo i 50 anni',
  new_pattern: 'mal di testa nuovo o in peggioramento',
  valsalva: 'dolore scatenato da tosse o sforzo',
  postural: 'dolore legato alla posizione',
  risk: 'gravidanza, tumore o difese basse',
  systemic: 'febbre o calo di peso'
};
const URGENT_IDS = RED_FLAGS_URGENT.map((f) => f.id);
const flagLabel = (id: string) => RED_FLAG_SHORT[id] ?? labelOf([...RED_FLAGS_URGENT, ...RED_FLAGS_SOON], id);

// Stile di vita: un consiglio per gruppo di trigger
const LIFESTYLE: { id: string; triggers: string[]; title: string; text: string }[] = [
  {
    id: 'sonno',
    triggers: ['sonno_scarso', 'sonno_eccessivo', 'viaggio'],
    title: 'Orari di sonno regolari',
    text: 'Vai a letto e alzati più o meno alla stessa ora, anche nel weekend e in vacanza. Sia dormire poco sia dormire troppo possono scatenare un attacco.'
  },
  {
    id: 'stress',
    triggers: ['stress', 'post_stress'],
    title: 'Gestire lo stress',
    text: 'Rilassamento, biofeedback e terapia cognitivo-comportamentale riducono gli attacchi. Bastano 10-15 minuti al giorno. Dopo un periodo intenso mantieni gli stessi orari di sonno e pasti.'
  },
  {
    id: 'pasti',
    triggers: ['digiuno'],
    title: 'Non saltare i pasti',
    text: 'Fai pasti regolari, a partire dalla colazione. Se tra un pasto e l’altro passano molte ore, fai uno spuntino.'
  },
  {
    id: 'acqua',
    triggers: ['disidratazione'],
    title: 'Bevi a sufficienza',
    text: 'Tieni l’acqua a portata di mano e bevi durante tutta la giornata, di più quando fa caldo o fai sport.'
  },
  {
    id: 'caffeina',
    triggers: ['caffeina_eccesso', 'astinenza_caffeina'],
    title: 'Caffeina costante e moderata',
    text: 'Prendi più o meno la stessa quantità di caffè ogni giorno, senza superare 2 tazze. Sia l’eccesso sia la mancanza improvvisa possono scatenare il dolore. Se vuoi ridurlo, fallo poco alla volta.'
  },
  {
    id: 'alcol',
    triggers: ['alcol'],
    title: 'Attenzione all’alcol',
    text: 'Prova a ridurre l’alcol, soprattutto vino rosso e superalcolici, e osserva nel diario se gli attacchi calano.'
  },
  {
    id: 'schermi',
    triggers: ['schermi', 'rumore'],
    title: 'Luce, schermi e rumore',
    text: 'Fai pause regolari dallo schermo guardando lontano, abbassa la luminosità e usa occhiali da sole all’aperto. Negli ambienti rumorosi possono aiutare i tappi.'
  },
  {
    id: 'cibo',
    triggers: ['cibo'],
    title: 'Cibi sospetti',
    text: 'Elimina solo i cibi che scatenano attacchi in modo ripetuto. Evita diete troppo restrittive: saltare pasti è un trigger più frequente dei singoli cibi.'
  },
  {
    id: 'meteo',
    triggers: ['meteo'],
    title: 'Cambi di tempo',
    text: 'Il meteo non si può evitare: nei giorni a rischio cura di più sonno, pasti e idratazione per non sommare altri fattori.'
  },
  {
    id: 'sforzo',
    triggers: ['sforzo'],
    title: 'Sforzo fisico',
    text: 'Fai sempre un riscaldamento graduale e bevi. Se il dolore compare a ogni sforzo intenso, dillo al medico: va valutato.'
  }
];

export function recommendations(ctx: AdvisorContext, dx: Diagnosis): Advice[] {
  const now = ctx.now;
  const today = dayKey(now);
  const eps = ctx.episodes;
  const out: Advice[] = [];
  const add = (a: Advice) => {
    if (!out.some((x) => x.id === a.id)) out.push(a);
  };

  const isMig = dx.id.includes('emicrania');
  const isChronic = ['emicrania_cronica', 'tensiva_cronica', 'cefalea_cronica'].includes(dx.id);
  const freq = recentFrequency(ctx);
  const migMonth = freq?.migraine ?? 0;
  const hdMonth = freq?.headache ?? 0;
  const midas = ctx.questionnaires.find((q) => q.type === 'midas');
  const hit6 = ctx.questionnaires.find((q) => q.type === 'hit6');
  const recent = (days: number) => eps.filter((e) => dayKey(e.start) >= addDays(today, -(days - 1)));
  const year = computeStats(eps, addDays(today, -364), today, now);
  const half = computeStats(eps, addDays(today, -179), today, now);

  // ================= URGENTE =================
  const flagged = recent(30).filter((e) => e.redFlags.length);
  if (flagged.length) {
    const ids = [...new Set(flagged.flatMap((e) => e.redFlags))];
    const urgent = ids.some((id) => URGENT_IDS.includes(id));
    add({
      id: 'red_flags',
      category: 'urgente',
      priority: 1,
      title: 'Sintomi da far valutare dal medico',
      text: urgent
        ? 'Hai segnalato sintomi che possono indicare una condizione seria. Se sono ancora presenti o ricompaiono, chiama subito il 112/118. Se sono passati, parlane al più presto con il medico.'
        : 'Hai segnalato sintomi che richiedono una valutazione medica. Contatta il tuo medico nei prossimi giorni, e prima se peggiorano.',
      why: `Negli ultimi 30 giorni, in ${plural(flagged.length, 'episodio', 'episodi')}: ${ids.map(flagLabel).join(', ')}.`,
      source: SRC.snoop
    });
  }

  const auraFlags: string[] = [];
  for (const e of recent(90).filter((x) => x.aura.length)) {
    const older = eps.filter((h) => h.start < e.start);
    const f = autoRedFlag(e, older);
    if (f) auraFlags.push(`${f} (${fmtDate(dayKey(e.start))})`);
  }
  if (auraFlags.length)
    add({
      id: 'aura_atipica',
      category: 'urgente',
      priority: 1,
      title: 'Aura insolita: falla valutare',
      text: 'Un’aura con debolezza di un lato, visione doppia, perdita della vista da un occhio o che dura più di un’ora va valutata dal medico, anche se è passata. Se è in corso ora, chiama il 112/118.',
      why: auraFlags.slice(0, 2).join('; ') + '.',
      source: SRC.ichd
    });

  // ================= USO ECCESSIVO DI FARMACI =================
  const moh = mohStatus(eps, today);
  const pickRow = (status: 'over' | 'warn') => {
    const rows = moh.filter((m) => m.status === status);
    return rows.find((m) => !m.key.endsWith('_all')) ?? rows[0];
  };
  const over = pickRow('over');
  const warn = over ? undefined : pickRow('warn');
  if (over)
    add({
      id: 'moh',
      category: 'visita',
      priority: 1,
      title: 'Troppi giorni con farmaci per il dolore',
      text: 'Un uso così frequente può far peggiorare il mal di testa (cefalea da uso eccessivo di farmaci). Non sospendere da solo: parlane presto con il medico, che può aiutarti a ridurli e impostare una prevenzione.',
      why: `${over.label}: ${over.days} giorni negli ultimi 30, oltre il limite di ${over.limit}${over.persistent ? ', da più di 3 mesi' : ''}.`,
      source: SRC.ichd + '; ' + SRC.ehfAcute
    });
  else if (warn)
    add({
      id: 'moh_warn',
      category: 'terapia_acuta',
      priority: 2,
      title: 'Limita i giorni con antidolorifici',
      text: 'Cerca di restare sotto i 10 giorni al mese con triptani o combinati e sotto i 15 con antidolorifici semplici. Se fai fatica, parlane con il medico: può essere il momento di una prevenzione.',
      why: `${warn.label}: ${warn.days} giorni negli ultimi 30 (limite ${warn.limit}).`,
      source: SRC.ichd
    });

  // ================= VISITA / PREVENZIONE =================
  const active = ctx.prophylaxis.filter((p) => p.startDate <= today && (!p.endDate || p.endDate >= today));
  const failed = [
    ...new Set(
      ctx.prophylaxis
        .filter((p) => p.endDate && p.endDate < today && (p.stopReason === 'inefficacia' || p.stopReason === 'effetti_collaterali'))
        .map((p) => p.name)
    )
  ];
  const chronic = chronicStatus(eps, now);
  const triggersWhy: string[] = [];
  if (isMig && migMonth >= 4) triggersWhy.push(`${r(migMonth)} giorni di emicrania al mese`);
  if (midas && midas.score >= 11) triggersWhy.push(`MIDAS ${midas.score} (disabilità ${midas.score > 20 ? 'grave' : 'moderata'})`);
  if (hit6 && hit6.score >= 56) triggersWhy.push(`HIT-6 ${hit6.score}`);
  if (isChronic || chronic.months >= 3) triggersWhy.push(`mal di testa in almeno 15 giorni al mese da ${chronic.months} mesi`);
  const candidate = triggersWhy.length > 0 && (isMig || isChronic || dx.id === 'probabile_emicrania');

  if (candidate && !active.length) {
    add({
      id: 'visita_prevenzione',
      category: 'visita',
      priority: 1,
      title: isChronic ? 'Mal di testa cronico: parlane con il neurologo' : 'Parla con il neurologo di una terapia di prevenzione',
      text: 'La prevenzione è una terapia presa con regolarità per ridurre numero e forza degli attacchi. Nella tua situazione le linee guida la raccomandano: chiedi una visita, meglio in un centro cefalee.',
      why: `Dal tuo diario: ${triggersWhy.join(', ')}.`,
      source: SRC.ehfProf
    });
    if (isMig) {
      let text =
        'Le opzioni più usate sono beta-bloccanti, amitriptilina, topiramato, flunarizina e candesartan. Il medico sceglie in base alla tua salute e agli altri farmaci che prendi.';
      text +=
        failed.length >= 2
          ? ' Dopo almeno 2 terapie non riuscite si possono valutare gli anticorpi anti-CGRP.'
          : ' Se 2 terapie non funzionano o non sono tollerate, esistono gli anticorpi anti-CGRP.';
      if (dx.id === 'emicrania_cronica') text += ' Nell’emicrania cronica è indicata anche la tossina botulinica.';
      text += ' Se pensi a una gravidanza, dillo al medico: alcuni farmaci non sono adatti.';
      add({
        id: 'opzioni_prevenzione',
        category: 'prevenzione',
        priority: 2,
        title: 'Le terapie di prevenzione, in breve',
        text,
        why: failed.length
          ? `Terapie già interrotte per inefficacia o effetti collaterali: ${failed.join(', ')}.`
          : `Nessuna terapia di prevenzione registrata, con ${triggersWhy[0]}.`,
        source: SRC.ehfProf + '; ' + SRC.sisc
      });
    } else if (dx.id === 'tensiva_cronica') {
      add({
        id: 'opzioni_prevenzione',
        category: 'prevenzione',
        priority: 2,
        title: 'Prevenzione della cefalea tensiva cronica',
        text: 'Il farmaco più studiato è l’amitriptilina, da valutare con il medico. Rilassamento, biofeedback e attività fisica regolare sono parte importante della cura.',
        why: `Nessuna terapia di prevenzione registrata, con ${triggersWhy[0]}.`,
        source: 'Linee guida EFNS / EAN (cefalea tensiva)'
      });
    }
  }

  // Valutazione delle profilassi in corso
  for (const p of active.slice(0, 2)) {
    const recentSE = p.sideEffects.filter((s) => s.date >= addDays(today, -30));
    if (recentSE.length)
      add({
        id: 'effetti_' + p.id,
        category: 'prevenzione',
        priority: 2,
        title: `Effetti collaterali di ${p.name}`,
        text: 'Parlane con il medico: spesso si possono gestire o si può cambiare terapia. Non sospenderla da solo.',
        why: `${plural(recentSE.length, 'effetto collaterale registrato', 'effetti collaterali registrati')} negli ultimi 30 giorni.`,
        source: SRC.ehfProf
      });
    const ev = prophylaxisEfficacy(p, eps, now);
    const isBotox = /botulin/i.test(p.name);
    if (!ev.evaluable) {
      add({
        id: 'attesa_' + p.id,
        category: 'diario',
        priority: 3,
        title: `Dai tempo a ${p.name}`,
        text: `Una prevenzione si giudica dopo almeno ${isBotox ? '6' : '3'} mesi. Continua a registrare ogni attacco: servirà per capire se funziona.`,
        why: `Iniziata il ${fmtDate(p.startDate)}: mancano ${ev.daysToEvaluation} giorni alla valutazione.`,
        source: SRC.ehfProf
      });
    } else if (ev.change !== null) {
      const ok = isChronic ? ev.responderChronic : ev.responder;
      const why = `Giorni di emicrania al mese: ${r(ev.baseline)} prima, ${ev.current} negli ultimi 30 giorni (${ev.change > 0 ? '+' : ''}${r(ev.change * 100)}%).`;
      if (ok)
        add({
          id: 'efficace_' + p.id,
          category: 'prevenzione',
          priority: 3,
          title: `${p.name} sembra funzionare`,
          text: 'I giorni di emicrania sono calati in modo importante. Al prossimo controllo il medico deciderà per quanto continuare.',
          why,
          source: SRC.ehfProf
        });
      else
        add({
          id: 'non_efficace_' + p.id,
          category: 'prevenzione',
          priority: 2,
          title: `${p.name}: risultato da rivedere`,
          text: `Dopo ${isBotox ? '6' : '3'} mesi la riduzione degli attacchi è minore di quella attesa. Parlane con il neurologo: si può cambiare o associare un’altra terapia.`,
          why,
          source: SRC.ehfProf
        });
    }
  }

  // Emicrania legata al ciclo
  const cc = cycleCorrelation(eps, ctx.days, now);
  if (cc?.pattern)
    add({
      id: 'mestruale',
      category: 'prevenzione',
      priority: 2,
      title: 'Attacchi legati al ciclo',
      text: 'Parlane con il neurologo o il ginecologo: esistono strategie mirate, come una breve prevenzione solo nei giorni intorno al ciclo.',
      why: `Attacchi nei giorni del ciclo in ${cc.cyclesWithAttack} degli ultimi ${cc.cycles} cicli.`,
      source: SRC.ichd + '; ' + SRC.sisc
    });

  // Grappolo
  if (dx.id === 'grappolo')
    add({
      id: 'grappolo',
      category: 'visita',
      priority: 1,
      title: 'Cefalea a grappolo: serve il neurologo',
      text: 'Il grappolo ha terapie specifiche, diverse da quelle dell’emicrania, per l’attacco e per il periodo dei grappoli (per esempio l’ossigeno). Chiedi una visita in un centro cefalee.',
      why: dx.reasons[0] ?? 'Attacchi compatibili con cefalea a grappolo.',
      source: SRC.ichd + '; ' + SRC.ehfAcute
    });

  // Emicrania con aura: estrogeni e fumo
  if (dx.id === 'emicrania_con_aura') {
    const nAura = eps.filter((e) => e.aura.length).length;
    add({
      id: 'aura_estrogeni',
      category: 'visita',
      priority: 2,
      title: 'Aura, pillola e fumo',
      text: 'Con l’emicrania con aura, la pillola con estrogeni e il fumo aumentano il rischio di ictus. Se usi contraccettivi ormonali o fumi, parlane con il medico.',
      why: `Hai registrato ${plural(nAura, 'attacco con aura', 'attacchi con aura')}.`,
      source: 'Consensus EHF / ESC 2017 (contraccettivi ed emicrania)'
    });
  }

  // Peggioramento recente
  const first = eps.length ? eps.map((e) => dayKey(e.start)).sort()[0] : today;
  if (daysBetween(first, today) >= 89) {
    const last30 = computeStats(eps, addDays(today, -29), today, now);
    const prev = computeStats(eps, addDays(today, -89), addDays(today, -30), now);
    const before = prev.per30(prev.headacheDays);
    if (last30.headacheDays - before >= 4 && last30.headacheDays >= before * 1.5)
      add({
        id: 'peggioramento',
        category: 'visita',
        priority: 2,
        title: 'Il mal di testa sta aumentando',
        text: 'Negli ultimi 30 giorni i giorni di dolore sono cresciuti molto. Parlane con il medico, soprattutto se il dolore è diverso dal solito.',
        why: `${last30.headacheDays} giorni di mal di testa negli ultimi 30, contro una media di ${r(before)} nei 2 mesi prima.`,
        source: SRC.snoop
      });
  }

  // Questionari
  const midasDue = questionnaireDue(ctx.questionnaires, 'midas', now);
  const hitDue = questionnaireDue(ctx.questionnaires, 'hit6', now);
  if ((midasDue || hitDue) && eps.length >= 3)
    add({
      id: 'questionari',
      category: 'visita',
      priority: 3,
      title: !midas && !hit6 ? 'Compila i questionari MIDAS e HIT-6' : `È ora di aggiornare ${midasDue && hitDue ? 'MIDAS e HIT-6' : midasDue ? 'il MIDAS' : "l'HIT-6"}`,
      text: 'Misurano quanto il mal di testa pesa sulla tua vita. Portali alla visita: aiutano il medico a scegliere la terapia e a valutarne l’effetto.',
      why: !midas && !hit6
        ? 'Non hai ancora compilato nessun questionario.'
        : [
            midas ? `ultimo MIDAS ${daysBetween(midas.date, today)} giorni fa` : 'MIDAS mai compilato',
            hit6 ? `ultimo HIT-6 ${daysBetween(hit6.date, today)} giorni fa` : 'HIT-6 mai compilato'
          ].join(', ') + '.',
      source: SRC.sisc
    });

  // ================= TERAPIA ACUTA (sempre da discutere con il medico) =================
  const eff = year.efficacy;
  const usesTriptan = eff.some((e) => e.cls === 'triptano') || ctx.medications.some((m) => m.cls === 'triptano' && !m.archived);
  const simple = eff.filter((e) => e.cls === 'fans' || e.cls === 'paracetamolo');
  const sN = simple.reduce((s, e) => s + e.n, 0);
  const sComplete = simple.reduce((s, e) => s + e.complete, 0);
  if ((isMig || dx.id === 'probabile_emicrania') && !usesTriptan && sN >= 3 && sComplete / sN < 0.5)
    add({
      id: 'chiedi_triptano',
      category: 'terapia_acuta',
      priority: 2,
      title: 'Chiedi al medico se un triptano può essere adatto',
      text: 'Gli antidolorifici comuni spesso non ti fanno passare il dolore. I triptani sono farmaci specifici per l’emicrania: chiedi al medico se sono adatti a te. In alcune malattie del cuore e dei vasi non si usano, e sarà il medico a valutarlo.',
      why: `Antidolorifici: dolore passato a 2 ore in ${sComplete} assunzioni su ${sN}.`,
      source: SRC.ehfAcute
    });

  const badTriptan = eff.find((e) => e.cls === 'triptano' && e.n >= 3 && (e.n - e.complete) / e.n >= 2 / 3);
  if (badTriptan)
    add({
      id: 'alternative_triptano',
      category: 'terapia_acuta',
      priority: 2,
      title: 'Se il triptano non basta, ci sono alternative',
      text: 'Se un triptano non funziona, un altro triptano o un’altra formulazione possono andare meglio. Esistono anche altre classi di farmaci (gepanti, ditani). Parlane con il medico.',
      why: `${badTriptan.name}: dolore passato a 2 ore solo in ${badTriptan.complete} assunzioni su ${badTriptan.n}.`,
      source: SRC.ehfAcute
    });

  // Assunzione tardiva
  const treated = half.episodes.filter((e) => e.meds.some((m) => m.cls !== 'antiemetico'));
  const late = treated.filter((e) => {
    const t = Math.min(...e.meds.filter((m) => m.cls !== 'antiemetico').map((m) => new Date(m.time).getTime()));
    return (t - new Date(e.start).getTime()) / 60000 > 60;
  }).length;
  if (dx.id !== 'grappolo' && treated.length >= 3 && late / treated.length > 0.5)
    add({
      id: 'presto',
      category: 'terapia_acuta',
      priority: 2,
      title: 'Prendi il farmaco all’inizio del dolore',
      text: 'I sintomatici funzionano meglio se presi presto, quando il dolore è ancora lieve. Aspettare spesso li rende meno efficaci. Resta comunque entro i giorni al mese concordati con il medico.',
      why: `In ${late} attacchi su ${treated.length} hai preso il farmaco più di un’ora dopo l’inizio del dolore.`,
      source: SRC.ehfAcute
    });

  // Recidive entro 24 h
  const evN = eff.reduce((s, e) => s + e.n, 0);
  const rec = eff.reduce((s, e) => s + e.recurrence, 0);
  if (rec >= 2 && evN && rec / evN >= 0.3)
    add({
      id: 'recidive',
      category: 'terapia_acuta',
      priority: 3,
      title: 'Il dolore ritorna entro 24 ore',
      text: 'Parlane con il medico: a volte si valuta un triptano a durata d’azione più lunga o l’associazione con un antinfiammatorio. Decide il medico cosa è adatto a te.',
      why: `Il dolore è tornato entro 24 ore in ${rec} assunzioni su ${evN}.`,
      source: SRC.ehfAcute
    });

  // Nausea frequente
  const nausea = half.episodes.filter((e) => e.symptoms.includes('nausea') || e.symptoms.includes('vomito')).length;
  const usesAntiemetic = half.episodes.some((e) => e.meds.some((m) => m.cls === 'antiemetico')) || ctx.medications.some((m) => m.cls === 'antiemetico' && !m.archived);
  if (nausea >= 3 && nausea / half.episodes.length >= 0.5 && !usesAntiemetic)
    add({
      id: 'nausea',
      category: 'terapia_acuta',
      priority: 3,
      title: 'Nausea durante gli attacchi',
      text: 'Chiedi al medico se un farmaco contro la nausea può aiutarti. La nausea rallenta anche l’assorbimento delle compresse: esistono formulazioni diverse (spray nasale, supposte, iniezioni) da discutere con lui.',
      why: `Nausea o vomito in ${nausea} attacchi su ${half.episodes.length} negli ultimi 6 mesi.`,
      source: SRC.ehfAcute
    });

  // ================= STILE DI VITA =================
  const trig = half.triggers.filter((t) => t.count >= 2 && t.pct >= 0.15);
  let lifeCount = 0;
  for (const t of trig) {
    if (lifeCount >= 3) break;
    const rule = LIFESTYLE.find((l) => l.triggers.includes(t.id));
    if (!rule || out.some((a) => a.id === 'vita_' + rule.id)) continue;
    add({
      id: 'vita_' + rule.id,
      category: 'stile_di_vita',
      priority: t.pct >= 0.3 ? 2 : 3,
      title: rule.title,
      text: rule.text,
      why: `"${labelOf(TRIGGERS, t.id)}" segnato in ${t.count} episodi su ${half.episodes.length} negli ultimi 6 mesi.`,
      source: SRC.ehfLife
    });
    lifeCount++;
  }
  if (isMig && migMonth >= 2) {
    add({
      id: 'vita_aerobica',
      category: 'stile_di_vita',
      priority: 3,
      title: 'Attività aerobica regolare',
      text: 'Camminata veloce, bici o nuoto per 30-40 minuti, 3 volte a settimana: è una delle misure con più prove nel ridurre gli attacchi. Inizia piano e aumenta gradualmente.',
      why: `In media ${r(migMonth)} giorni di emicrania al mese.`,
      source: SRC.ehfLife
    });
    add({
      id: 'vita_integratori',
      category: 'stile_di_vita',
      priority: 3,
      title: 'Integratori: chiedi al medico',
      text: 'Magnesio, riboflavina (vitamina B2) e coenzima Q10 hanno qualche prova di efficacia nel prevenire l’emicrania. Chiedi al medico se sono adatti a te.',
      why: `In media ${r(migMonth)} giorni di emicrania al mese.`,
      source: 'AAN/AHS; EHF (nutraceutici)'
    });
  }

  // ================= DIARIO =================
  if (dx.missing.length)
    add({
      id: 'diario_dati',
      category: 'diario',
      priority: dx.id === 'insufficiente' ? 2 : 3,
      title: 'Rendi il diario più utile',
      text: dx.missing.slice(0, 3).join('. ') + '.',
      why: `L’inquadramento ha oggi un’affidabilità ${dx.confidence}: più dettagli lo rendono più preciso.`
    });
  const cycleTrig = half.triggers.find((t) => t.id === 'ciclo_mestruale');
  const hasPeriods = ctx.days.some((d) => d.period || d.periodStart);
  if (cycleTrig && cycleTrig.count >= 2 && !hasPeriods)
    add({
      id: 'diario_ciclo',
      category: 'diario',
      priority: 3,
      title: 'Segna i giorni del ciclo',
      text: 'Registra nel calendario i giorni del ciclo: dopo 3 cicli l’app potrà verificare se gli attacchi sono legati al ciclo, un dato utile al medico.',
      why: `Hai indicato il ciclo come fattore scatenante in ${cycleTrig.count} episodi.`
    });
  if (eps.length && hdMonth === 0 && !recent(90).length)
    add({
      id: 'diario_attivo',
      category: 'diario',
      priority: 3,
      title: 'Nessun episodio negli ultimi 3 mesi',
      text: 'Se hai avuto mal di testa, registrali anche in modo rapido: bastano inizio, fine e intensità.',
      why: 'L’ultimo episodio registrato risale a più di 90 giorni fa.'
    });

  return sortAdvice(out).slice(0, MAX_ADVICE);
}

function sortAdvice(list: Advice[]): Advice[] {
  return list
    .map((a, i) => ({ a, i }))
    .sort((x, y) => x.a.priority - y.a.priority || CATEGORY_ORDER.indexOf(x.a.category) - CATEGORY_ORDER.indexOf(y.a.category) || x.i - y.i)
    .map((x) => x.a);
}

