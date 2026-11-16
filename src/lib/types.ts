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
export interface CheckIn {
  at: string; // ISO della compilazione
  sleep?: 'poco' | 'ok' | 'troppo';
  stress?: 'basso' | 'medio' | 'alto';
  meals?: 'regolari' | 'saltato';
  water?: 'poca' | 'ok';
  caffeine?: 'meno' | 'solito' | 'piu';
  alcohol?: boolean;
  exercise?: boolean;
  prodromes?: string[]; // id da PRODROMES in catalog.ts
}

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
  profile?: { name?: string; birthYear?: number };
}
