import type { MedClass } from './catalog';

export interface MedIntake {
  id: string;
  name: string;
  cls: MedClass;
  time: string; // ISO
  dose?: string;
  efficacy?: 'nessuna' | 'parziale' | 'completa';
  recurrence24h?: boolean;
}

export interface Episode {
  id: string;
  start: string; // ISO
  end: string | null; // null = in corso
  intensity: number; // NRS 0-10
  peak?: number;
  locations: string[];
  side?: string;
  quality: string[];
  symptoms: string[];
  autonomic: string[];
  aura: string[];
  auraDurationMin?: number;
  triggers: string[]; // id del catalogo o testo libero
  meds: MedIntake[];
  disability?: string;
  redFlags: string[];
  notes: string;
  forDoctor?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Farmaci sintomatici personali (quelli che l'utente usa davvero)
export interface Medication {
  id: string;
  name: string;
  cls: MedClass;
  dose?: string;
  archived?: boolean;
}

export interface SideEffect {
  id: string;
  date: string; // YYYY-MM-DD
}

export interface Prophylaxis {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  stopReason?: string;
  sideEffects: SideEffect[];
  notes: string;
}

export interface Questionnaire {
  id: string;
  type: 'midas' | 'hit6';
  date: string; // YYYY-MM-DD
  answers: number[];
  score: number;
  a?: number; // MIDAS A: giorni di cefalea in 3 mesi
  b?: number; // MIDAS B: intensità media 0-10
}

// Check-in giornaliero (facoltativo, 10 secondi): dà i "giorni di confronto" per stimare i trigger veri.
// Il sonno si riferisce alla notte precedente; il resto alla giornata.
// Movimento: nessuno · leggero (passeggiata, faccende) · moderato (camminata svelta, bici) · intenso (corsa, palestra, sport)
export type Activity = 'nessuna' | 'leggera' | 'moderata' | 'intensa';

export interface CheckIn {
  at: string; // ISO dell'ultima modifica (riscritto a ogni salvataggio)
  sleep?: 'poco' | 'ok' | 'troppo';
  sleepIrregular?: boolean; // notte precedente a orari diversi dal solito (letto tardi, sveglia tardi…)
  stress?: 'basso' | 'medio' | 'alto';
  meals?: 'regolari' | 'saltato';
  water?: 'poca' | 'ok';
  caffeine?: 'meno' | 'solito' | 'piu';
  alcohol?: boolean;
  screens?: boolean; // molte ore di schermo o luce forte
  activity?: Activity; // movimento della giornata
  /** @deprecated vecchio sì/no: usare activityOf() che lo converte */
  exercise?: boolean;
  prodromes?: string[]; // id da PRODROMES in catalog.ts
  /** ISO di quando ogni campo è stato impostato l'ultima volta (assente nei check-in vecchi: si usa `at`).
   *  Serve a capire se un fattore è stato registrato prima o dopo l'inizio di un attacco. */
  times?: Partial<Record<CheckInField, string>>;
}

export type CheckInField = 'sleep' | 'sleepIrregular' | 'stress' | 'meals' | 'water' | 'caffeine' | 'alcohol' | 'screens' | 'activity' | 'prodromes';

// Giorno di calendario con informazioni extra (ciclo, giornata senza mal di testa, check-in)
export interface DayInfo {
  date: string; // YYYY-MM-DD
  period?: boolean; // giorno di flusso
  periodStart?: boolean; // primo giorno del flusso
  headacheFree?: boolean;
  checkin?: CheckIn;
}

export interface BackupFile {
  app: 'blank-out';
  version: 1;
  exportedAt: string;
  episodes: Episode[];
  medications: Medication[];
  prophylaxis: Prophylaxis[];
  questionnaires: Questionnaire[];
  days: DayInfo[];
  customTriggers: string[];
  settings?: Record<string, unknown>;
  profile?: Profile;
}

// Profilo del paziente: tutto facoltativo, compare solo nel report per il medico (normalizeProfile in profile.ts)
export type HormonalTherapy = 'nessuna' | 'estroprogestinica' | 'progestinico' | 'sostitutiva' | 'altro';

export interface Profile {
  name?: string;
  birthYear?: number;
  sex?: 'femmina' | 'maschio' | 'altro'; // altro = altro / preferisco non dire
  hormonal?: HormonalTherapy;
  hormonalNote?: string; // testo libero (nome del farmaco o "altro")
  onsetAge?: number; // età all'esordio del mal di testa (anni)
  onsetYear?: number; // in alternativa: anno di esordio
  familyHistory?: 'si' | 'no' | 'non_so'; // familiarità per emicrania
  smoking?: 'si' | 'no' | 'ex';
}
