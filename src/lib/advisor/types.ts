// Contratto comune del modulo "Assistente": inquadramento, consigli, pattern e previsione.
// Tutto gira sul dispositivo; nessun dato sanitario lascia il telefono.
import type { DayInfo, Episode, Medication, Prophylaxis, Questionnaire } from '../types';

export interface AdvisorContext {
  episodes: Episode[]; // ordinati dal più recente
  days: DayInfo[];
  questionnaires: Questionnaire[]; // dal più recente
  prophylaxis: Prophylaxis[];
  medications: Medication[];
  now: Date;
  weather?: WeatherDay[]; // opzionale, se l'utente ha attivato il meteo
}

export type Confidence = 'bassa' | 'media' | 'alta';

/** Inquadramento probabile sull'intero storico (non è una diagnosi). */
export interface Diagnosis {
  id: string; // es. 'emicrania_senza_aura', 'emicrania_con_aura', 'emicrania_cronica', 'tensiva_episodica', 'grappolo', 'moh', 'insufficiente'
  label: string; // es. "Compatibile con emicrania episodica senza aura ad alta frequenza"
  confidence: Confidence;
  reasons: string[]; // frasi brevi basate sui dati dell'utente
  missing: string[]; // cosa manca per un inquadramento più affidabile
  secondary: { label: string; reason: string }[]; // altri quadri coesistenti (es. tensiva, MOH, correlazione col ciclo)
  frequency: 'bassa' | 'alta' | 'cronica' | null; // episodica a bassa (<8 gg/mese) o alta (8-14) frequenza, cronica (≥15)
}

export type AdviceCategory = 'urgente' | 'visita' | 'terapia_acuta' | 'prevenzione' | 'stile_di_vita' | 'diario';

export interface Advice {
  id: string;
  category: AdviceCategory;
  priority: 1 | 2 | 3; // 1 = più importante
  title: string;
  text: string; // consiglio in italiano semplice
  why: string; // il dato personale che lo giustifica
  source?: string; // es. "Linee guida EHF 2022", "SISC"
}

export interface Pattern {
  id: string;
  title: string; // es. "Gli attacchi arrivano soprattutto al mattino"
  detail: string;
  strength: Confidence;
  chart?: { label: string; value: number }[]; // dati per un piccolo grafico a barre
}

export interface WeatherDay {
  date: string; // YYYY-MM-DD
  pressureMean: number; // hPa
  pressureChange: number; // variazione rispetto al giorno prima (hPa)
  tempMax: number;
  tempMin: number;
  humidity: number;
}

export interface Forecast {
  available: boolean;
  basis?: 'generale' | 'misto' | 'personale'; // quanto la stima si basa sui dati dell'utente vs letteratura
  brier?: number; // errore di calibrazione sui dati dell'utente (più basso = meglio)
  reason?: string; // perché non disponibile (es. "servono almeno 60 giorni e 8 attacchi")
  today?: number; // probabilità 0-1
  tomorrow?: number;
  level?: 'basso' | 'medio' | 'alto';
  drivers: { label: string; effect: 'aumenta' | 'riduce' }[]; // fattori principali della stima di oggi
  quality?: { auc: number; samples: number }; // qualità del modello sui dati dell'utente
}

/** Rischio personale associato a un fattore, stimato con i giorni di check-in come confronto. */
export interface TriggerRisk {
  id: string; // es. 'sleep_poco', 'stress_alto', 'meals_saltato', 'alcohol', 'prodrome', 'pressure_drop', 'perimenstrual'
  label: string; // es. "Dormire poco"
  rr: number; // rischio relativo stimato (1 = nessun effetto)
  low: number; // intervallo di credibilità/confidenza 90%
  high: number;
  exposedDays: number; // giorni osservati con il fattore presente
  basis: 'generale' | 'misto' | 'personale';
}

/** Piano di oggi: poche azioni pratiche, non mediche. */
export interface DailyPlan {
  level: 'basso' | 'medio' | 'alto';
  headline: string;
  actions: { id: string; text: string; why: string }[]; // 2-4 azioni
}

/** Obiettivo settimanale su un trigger personale, con progresso dai check-in. */
export interface WeeklyGoal {
  id: string;
  title: string;
  why: string;
  target: number;
  done: number;
  unit: string; // es. "giorni"
}
