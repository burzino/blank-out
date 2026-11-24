// Cataloghi clinici e soglie. Le soglie sono qui, in un unico posto, così sono facili da aggiornare.
import type { Activity, CheckIn } from './types';

export type Opt = { id: string; label: string };

export const THRESHOLDS = {
  mohSimple: 15, // FANS, paracetamolo, ASA: giorni / 30 gg
  mohSimpleWarn: 12,
  mohComplex: 10, // triptani, ergotamina, oppioidi, combinati, ditani
  mohComplexWarn: 8,
  chronicDays: 15, // giorni di cefalea / 30 gg
  chronicMigraineDays: 8,
  efficacyMinIntakes: 3,
  responder: 0.5,
  responderChronic: 0.3,
  stuckEpisodeHours: 72,
  efficacyAskAfterMin: 120
};

export const QUICK_INTENSITY = [
  { level: 1, value: 2, label: 'Lieve', hint: 'Riesco a fare le mie cose' },
  { level: 2, value: 5, label: 'Moderato', hint: 'Mi rallenta' },
  { level: 3, value: 8, label: 'Forte', hint: 'Devo fermarmi' }
] as const;

export function intensityLevel(v: number): 0 | 1 | 2 | 3 {
  if (v <= 0) return 0;
  if (v <= 3) return 1;
  if (v <= 6) return 2;
  return 3;
}
export const LEVEL_LABEL = ['Nessuno', 'Lieve', 'Moderato', 'Forte'];

export const LOCATIONS: Opt[] = [
  { id: 'frontale', label: 'Fronte' },
  { id: 'temporale', label: 'Tempia' },
  { id: 'orbitale', label: "Dietro l'occhio" },
  { id: 'vertice', label: 'Sommità' },
  { id: 'occipitale', label: 'Dietro la testa' },
  { id: 'nucale', label: 'Nuca / collo' },
  { id: 'tutta', label: 'Tutta la testa' }
];

export const SIDES: Opt[] = [
  { id: 'sinistro', label: 'Sinistra' },
  { id: 'destro', label: 'Destra' },
  { id: 'bilaterale', label: 'Entrambi' },
  { id: 'alternante', label: 'Cambia lato' }
];

export const QUALITIES: Opt[] = [
  { id: 'pulsante', label: 'Pulsante' },
  { id: 'gravativo', label: 'Peso / fascia' },
  { id: 'trafittivo', label: 'Coltellata' },
  { id: 'urente', label: 'Bruciore' },
  { id: 'scossa', label: 'Scossa' }
];

export const SYMPTOMS: Opt[] = [
  { id: 'nausea', label: 'Nausea' },
  { id: 'vomito', label: 'Vomito' },
  { id: 'fotofobia', label: 'Fastidio luce' },
  { id: 'fonofobia', label: 'Fastidio rumori' },
  { id: 'osmofobia', label: 'Fastidio odori' },
  { id: 'peggiora_attivita', label: 'Peggiora muovendomi' },
  { id: 'vertigini', label: 'Vertigini' },
  { id: 'cervicalgia', label: 'Dolore al collo' }
];

export const AUTONOMIC: Opt[] = [
  { id: 'lacrimazione', label: 'Lacrimazione' },
  { id: 'occhio_rosso', label: 'Occhio rosso' },
  { id: 'congestione_nasale', label: 'Naso chiuso' },
  { id: 'rinorrea', label: 'Naso che cola' },
  { id: 'edema_palpebrale', label: 'Palpebra gonfia' },
  { id: 'sudorazione_fronte', label: 'Sudore sulla fronte' },
  { id: 'ptosi_miosi', label: 'Palpebra cadente / pupilla piccola' },
  { id: 'agitazione', label: 'Agitazione, non sto fermo' }
];

export const AURAS: Opt[] = [
  { id: 'visiva', label: 'Visiva (luci, zig-zag)' },
  { id: 'sensitiva', label: 'Formicolii' },
  { id: 'linguaggio', label: 'Difficoltà a parlare' },
  { id: 'motoria', label: 'Debolezza di un lato' },
  { id: 'troncoencefalica', label: 'Visione doppia / vertigine forte' },
  { id: 'retinica', label: 'Vista persa da un occhio' }
];
export const TYPICAL_AURAS = ['visiva', 'sensitiva', 'linguaggio'];

export const TRIGGERS: Opt[] = [
  { id: 'ciclo_mestruale', label: 'Ciclo' },
  { id: 'stress', label: 'Stress' },
  { id: 'post_stress', label: 'Dopo lo stress / weekend' },
  { id: 'sonno_scarso', label: 'Dormito poco' },
  { id: 'sonno_eccessivo', label: 'Dormito troppo' },
  { id: 'digiuno', label: 'Saltato un pasto' },
  { id: 'alcol', label: 'Alcol' },
  { id: 'caffeina_eccesso', label: 'Troppo caffè' },
  { id: 'astinenza_caffeina', label: 'Niente caffè' },
  { id: 'disidratazione', label: 'Bevuto poco' },
  { id: 'meteo', label: 'Cambio meteo' },
  { id: 'schermi', label: 'Luce / schermi' },
  { id: 'rumore', label: 'Rumore' },
  { id: 'odori', label: 'Odori forti' },
  { id: 'sforzo', label: 'Sforzo fisico' },
  { id: 'viaggio', label: 'Viaggio / jet lag' },
  { id: 'cibo', label: 'Cibo specifico' }
];

export const DISABILITY: Opt[] = [
  { id: 'nessuna', label: 'Nessuna' },
  { id: 'ridotta', label: 'Ridotta' },
  { id: 'a_letto', label: 'A letto' }
];

export const EFFICACY: Opt[] = [
  { id: 'nessuna', label: 'Nessun effetto' },
  { id: 'parziale', label: 'Parziale' },
  { id: 'completa', label: 'Passato' }
];

export type MedClass =
  | 'fans'
  | 'paracetamolo'
  | 'triptano'
  | 'gepante'
  | 'ditano'
  | 'combinato'
  | 'oppioide'
  | 'ergotamina'
  | 'antiemetico'
  | 'ossigeno'
  | 'altro';

export const MED_CLASSES: { id: MedClass; label: string; moh: 'simple' | 'complex' | null }[] = [
  { id: 'fans', label: 'FANS / antinfiammatori', moh: 'simple' },
  { id: 'paracetamolo', label: 'Paracetamolo', moh: 'simple' },
  { id: 'triptano', label: 'Triptani', moh: 'complex' },
  { id: 'gepante', label: 'Gepanti', moh: null },
  { id: 'ditano', label: 'Ditani', moh: 'complex' },
  { id: 'combinato', label: 'Combinati', moh: 'complex' },
  { id: 'oppioide', label: 'Oppioidi', moh: 'complex' },
  { id: 'ergotamina', label: 'Ergotamina', moh: 'complex' },
  { id: 'antiemetico', label: 'Antinausea', moh: null },
  { id: 'ossigeno', label: 'Ossigeno', moh: null },
  { id: 'altro', label: 'Altro', moh: null }
];

export const classLabel = (c: string) => MED_CLASSES.find((m) => m.id === c)?.label ?? c;
export const mohGroup = (c: string) => MED_CLASSES.find((m) => m.id === c)?.moh ?? null;

// Farmaci sintomatici comuni in Italia (nome generico → classe, dose tipica)
export const KNOWN_ACUTE: { name: string; cls: MedClass; dose: string }[] = [
  // Nomi commerciali più usati in Italia (principio attivo tra parentesi)
  { name: 'Oki (ketoprofene)', cls: 'fans', dose: '80 mg' },
  { name: 'Oki Task (ketoprofene)', cls: 'fans', dose: '40 mg' },
  { name: 'Ketodol (ketoprofene)', cls: 'fans', dose: '1 bustina' },
  { name: 'Moment (ibuprofene)', cls: 'fans', dose: '200 mg' },
  { name: 'Moment Act (ibuprofene)', cls: 'fans', dose: '400 mg' },
  { name: 'Tachipirina 500 (paracetamolo)', cls: 'paracetamolo', dose: '500 mg' },
  { name: 'Tachipirina 1000 (paracetamolo)', cls: 'paracetamolo', dose: '1000 mg' },
  { name: 'Voltaren (diclofenac)', cls: 'fans', dose: '50 mg' },
  { name: 'Ibuprofene', cls: 'fans', dose: '400 mg' },
  { name: 'Ketoprofene', cls: 'fans', dose: '50 mg' },
  { name: 'Naprossene', cls: 'fans', dose: '550 mg' },
  { name: 'Diclofenac', cls: 'fans', dose: '50 mg' },
  { name: 'Acido acetilsalicilico', cls: 'fans', dose: '1000 mg' },
  { name: 'Indometacina', cls: 'fans', dose: '50 mg' },
  { name: 'Paracetamolo', cls: 'paracetamolo', dose: '1000 mg' },
  { name: 'Sumatriptan', cls: 'triptano', dose: '50 mg' },
  { name: 'Rizatriptan', cls: 'triptano', dose: '10 mg' },
  { name: 'Zolmitriptan', cls: 'triptano', dose: '2,5 mg' },
  { name: 'Almotriptan', cls: 'triptano', dose: '12,5 mg' },
  { name: 'Eletriptan', cls: 'triptano', dose: '40 mg' },
  { name: 'Frovatriptan', cls: 'triptano', dose: '2,5 mg' },
  { name: 'Naratriptan', cls: 'triptano', dose: '2,5 mg' },
  { name: 'Rimegepant', cls: 'gepante', dose: '75 mg' },
  { name: 'Lasmiditan', cls: 'ditano', dose: '100 mg' },
  { name: 'Indometacina + proclorperazina + caffeina', cls: 'combinato', dose: '1 cp' },
  { name: 'Paracetamolo + codeina', cls: 'combinato', dose: '1 cp' },
  { name: 'Tramadolo', cls: 'oppioide', dose: '50 mg' },
  { name: 'Ergotamina + caffeina', cls: 'ergotamina', dose: '1 cp' },
  { name: 'Metoclopramide', cls: 'antiemetico', dose: '10 mg' },
  { name: 'Domperidone', cls: 'antiemetico', dose: '10 mg' },
  { name: 'Ossigeno', cls: 'ossigeno', dose: '12 L/min' }
];

export const KNOWN_PROPHYLAXIS: { name: string; group: string; freq: string }[] = [
  { name: 'Propranololo', group: 'Beta-bloccante', freq: 'giornaliera' },
  { name: 'Metoprololo', group: 'Beta-bloccante', freq: 'giornaliera' },
  { name: 'Flunarizina', group: 'Calcio-antagonista', freq: 'giornaliera' },
  { name: 'Amitriptilina', group: 'Antidepressivo', freq: 'giornaliera' },
  { name: 'Topiramato', group: 'Antiepilettico', freq: 'giornaliera' },
  { name: 'Valproato', group: 'Antiepilettico', freq: 'giornaliera' },
  { name: 'Candesartan', group: 'Sartano', freq: 'giornaliera' },
  { name: 'Erenumab', group: 'Anti-CGRP', freq: 'mensile' },
  { name: 'Fremanezumab', group: 'Anti-CGRP', freq: 'mensile' },
  { name: 'Galcanezumab', group: 'Anti-CGRP', freq: 'mensile' },
  { name: 'Eptinezumab', group: 'Anti-CGRP', freq: 'trimestrale' },
  { name: 'Tossina botulinica A', group: 'Tossina botulinica', freq: 'trimestrale' }
];

export const FREQUENCIES: Opt[] = [
  { id: 'giornaliera', label: 'Ogni giorno' },
  { id: 'settimanale', label: 'Ogni settimana' },
  { id: 'mensile', label: 'Ogni mese' },
  { id: 'trimestrale', label: 'Ogni 3 mesi' }
];

export const STOP_REASONS: Opt[] = [
  { id: 'inefficacia', label: 'Non funzionava' },
  { id: 'effetti_collaterali', label: 'Effetti collaterali' },
  { id: 'ciclo_completato', label: 'Ciclo completato' },
  { id: 'altro', label: 'Altro' }
];

export const SIDE_EFFECTS: Opt[] = [
  { id: 'sonnolenza', label: 'Sonnolenza' },
  { id: 'peso', label: 'Aumento di peso' },
  { id: 'parestesie', label: 'Formicolii' },
  { id: 'memoria', label: 'Memoria / concentrazione' },
  { id: 'stipsi', label: 'Stitichezza' },
  { id: 'stanchezza', label: 'Stanchezza / pressione bassa' },
  { id: 'umore', label: 'Umore basso' },
  { id: 'iniezione', label: 'Reazione nel sito di iniezione' },
  { id: 'altro', label: 'Altro' }
];

// Red flags (SNOOP4)
export const RED_FLAGS_URGENT: Opt[] = [
  { id: 'thunderclap', label: 'Dolore esploso all’improvviso, al massimo in meno di 1 minuto ("il peggiore della mia vita")' },
  { id: 'neuro', label: 'Debolezza o perdita di sensibilità a un lato, difficoltà a parlare, perdita della vista, visione doppia o confusione, NON tipiche della tua solita aura' },
  { id: 'fever_neck', label: 'Febbre con rigidità del collo o macchie sulla pelle' },
  { id: 'trauma', label: 'Mal di testa dopo un trauma alla testa' },
  { id: 'seizure', label: 'Convulsioni o perdita di coscienza' }
];

export const RED_FLAGS_SOON: Opt[] = [
  { id: 'over50', label: 'Primo mal di testa di questo tipo dopo i 50 anni' },
  { id: 'new_pattern', label: 'Mal di testa nuovo, molto diverso dal solito o in peggioramento continuo da settimane' },
  { id: 'valsalva', label: 'Scatenato da tosse, starnuto o sforzo' },
  { id: 'postural', label: 'Peggiora molto da sdraiato o in piedi' },
  { id: 'risk', label: 'Gravidanza o parto recente, tumore, immunodepressione' },
  { id: 'systemic', label: 'Febbre o calo di peso inspiegato' }
];

export const URGENT_MSG = 'Questi sintomi possono indicare una condizione grave. Chiama subito il 112/118 o vai al Pronto Soccorso. Non guidare.';
export const SOON_MSG = 'Questo mal di testa ha caratteristiche che richiedono una valutazione medica. Contatta il tuo medico oggi stesso; se non è raggiungibile, la Guardia Medica o il Pronto Soccorso.';

export const DISCLAIMER =
  'Blank Out è un diario per registrare i tuoi mal di testa e condividerli con il medico. Non è un dispositivo medico, non fa diagnosi e non sostituisce il parere del medico. Le classificazioni e gli avvisi sono indicativi e basati su criteri semplificati. Non iniziare, modificare o sospendere alcuna terapia senza aver consultato il medico. In caso di mal di testa improvviso e violentissimo, disturbi della vista, della parola o della forza, febbre con rigidità del collo, confusione o dopo un trauma cranico, chiama subito il 112/118. I tuoi dati restano solo su questo dispositivo: se cancelli l’app o i dati del browser andranno persi, quindi esporta regolarmente un backup.';

export const CLASSIFY_NOTE = 'Classificazione indicativa basata sui criteri ICHD-3 applicati a un singolo episodio. Non è una diagnosi: la diagnosi spetta al medico.';

// Check-in giornaliero
export const CHECKIN = {
  sleep: [{ id: 'poco', label: 'Poco' }, { id: 'ok', label: 'Giusto' }, { id: 'troppo', label: 'Troppo' }],
  stress: [{ id: 'basso', label: 'Basso' }, { id: 'medio', label: 'Medio' }, { id: 'alto', label: 'Alto' }],
  meals: [{ id: 'regolari', label: 'Regolari' }, { id: 'saltato', label: 'Saltato un pasto' }],
  water: [{ id: 'poca', label: 'Poca' }, { id: 'ok', label: 'Abbastanza' }],
  caffeine: [{ id: 'meno', label: 'Meno del solito' }, { id: 'solito', label: 'Il solito' }, { id: 'piu', label: 'Di più' }],
  activity: [{ id: 'nessuna', label: 'Nessuno' }, { id: 'leggera', label: 'Leggero' }, { id: 'moderata', label: 'Moderato' }, { id: 'intensa', label: 'Intenso' }]
} satisfies Record<string, Opt[]>;

/** Movimento del check-in; converte il vecchio sì/no (sì → moderato: intensità ignota, non la si assume intensa). */
export function activityOf(c: CheckIn | undefined): Activity | undefined {
  if (!c) return undefined;
  if (c.activity) return c.activity;
  return c.exercise === undefined ? undefined : c.exercise ? 'moderata' : 'nessuna';
}

/** Check-in "fatto": sonno e stress compilati (lo stress si segna la sera, quindi la persona ha visto tutto il modulo). */
export const checkinDone = (c: CheckIn | undefined) => !!(c?.sleep && c?.stress);

/** Chip sì/no del check-in (alcol, orari del sonno, schermi): un chip non toccato è `undefined`.
 *  Regola: se il check-in è fatto, un chip non toccato vale "no" (non c'è altro modo di dire "no" e senza giorni "no"
 *  il fattore non si potrebbe mai stimare). Errori occasionali (chip dimenticato) attenuano la stima verso 1, non
 *  creano trigger falsi. I chip nuovi (orari, schermi) valgono "no" solo nei check-in salvati dalla versione che li
 *  mostra (riconoscibili da `times`): prima non c'erano, quindi restano ignoti. Altrimenti `undefined` = non noto. */
export function flagOf(c: CheckIn | undefined, key: 'alcohol' | 'sleepIrregular' | 'screens'): boolean | undefined {
  if (!c) return undefined;
  if (c[key] !== undefined) return c[key];
  if (!checkinDone(c)) return undefined;
  if (key !== 'alcohol' && !c.times) return undefined;
  return false;
}

// Segnali premonitori (prodromi): spesso 24-48 h prima dell'attacco
export const PRODROMES: Opt[] = [
  { id: 'sbadigli', label: 'Sbadigli frequenti' },
  { id: 'stanchezza', label: 'Stanchezza insolita' },
  { id: 'collo', label: 'Collo rigido' },
  { id: 'fame_dolci', label: 'Voglia di dolci / cibo' },
  { id: 'irritabilita', label: 'Irritabilità, umore giù' },
  { id: 'concentrazione', label: 'Fatica a concentrarmi' },
  { id: 'luce', label: 'Fastidio alla luce' },
  { id: 'sete_urina', label: 'Sete o urinare spesso' }
];

export const labelOf = (list: Opt[], id: string) => list.find((o) => o.id === id)?.label ?? id;
