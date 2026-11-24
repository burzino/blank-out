// Profilo del paziente (facoltativo): compare solo nel report per il medico e resta sul dispositivo.
// Logica pura: opzioni, normalizzazione dei dati salvati/importati e testi per il report.
import type { Opt } from './catalog';
import type { HormonalTherapy, Profile } from './types';

export const SEX_OPTS: Opt[] = [
  { id: 'femmina', label: 'Femmina' },
  { id: 'maschio', label: 'Maschio' },
  { id: 'altro', label: 'Altro / preferisco non dire' }
];

export const HORMONAL_OPTS: Opt[] = [
  { id: 'nessuna', label: 'Nessuna' },
  { id: 'estroprogestinica', label: 'Pillola combinata (estroprogestinica)' },
  { id: 'progestinico', label: 'Solo progestinico' },
  { id: 'sostitutiva', label: 'Terapia ormonale sostitutiva' },
  { id: 'altro', label: 'Altro' }
];

export const FAMILY_OPTS: Opt[] = [
  { id: 'si', label: 'Sì' },
  { id: 'no', label: 'No' },
  { id: 'non_so', label: 'Non so' }
];

export const SMOKING_OPTS: Opt[] = [
  { id: 'si', label: 'Sì' },
  { id: 'no', label: 'No' },
  { id: 'ex', label: 'Ex fumatore' }
];

const ids = (o: Opt[]) => o.map((x) => x.id);
const pick = <T extends string>(v: unknown, list: Opt[]): T | undefined => (typeof v === 'string' && ids(list).includes(v) ? (v as T) : undefined);
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);

/** Profilo pulito da qualsiasi valore salvato o importato (backup vecchi senza i campi nuovi, valori sconosciuti). */
export function normalizeProfile(raw: unknown, thisYear = new Date().getFullYear()): Profile {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const p: Profile = {
    name: text(r.name),
    birthYear: int(r.birthYear, 1900, thisYear),
    sex: pick(r.sex, SEX_OPTS),
    hormonal: pick<HormonalTherapy>(r.hormonal, HORMONAL_OPTS),
    hormonalNote: text(r.hormonalNote),
    onsetAge: int(r.onsetAge, 0, 120),
    onsetYear: int(r.onsetYear, 1900, thisYear),
    familyHistory: pick(r.familyHistory, FAMILY_OPTS),
    smoking: pick(r.smoking, SMOKING_OPTS)
  };
  for (const k of Object.keys(p) as (keyof Profile)[]) if (p[k] === undefined) delete p[k];
  return p;
}

/** Interpreta il campo "esordio": un numero ≥ 1900 è un anno, altrimenti un'età in anni. */
export function parseOnset(v: string, thisYear = new Date().getFullYear()): Pick<Profile, 'onsetAge' | 'onsetYear'> {
  const n = Number(v.trim());
  if (!v.trim() || !Number.isInteger(n)) return {};
  if (n >= 1900 && n <= thisYear) return { onsetYear: n };
  if (n >= 0 && n <= 120) return { onsetAge: n };
  return {};
}

/** Età all'esordio (anni), se ricavabile. */
export function onsetAgeOf(p: Profile): number | null {
  if (p.onsetAge != null) return p.onsetAge;
  if (p.onsetYear != null && p.birthYear != null && p.onsetYear >= p.birthYear) return p.onsetYear - p.birthYear;
  return null;
}

/** Righe del profilo per l'intestazione del report: solo i campi compilati. */
export function profileLines(p: Profile, thisYear = new Date().getFullYear()): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const lab = (list: Opt[], id: string) => list.find((o) => o.id === id)?.label ?? id;
  if (p.birthYear != null) out.push({ label: 'Età', value: `${thisYear - p.birthYear} anni circa (nascita ${p.birthYear})` });
  if (p.sex) out.push({ label: 'Sesso', value: p.sex === 'altro' ? 'non indicato' : lab(SEX_OPTS, p.sex).toLowerCase() });
  if (p.hormonal) {
    const v = p.hormonal === 'altro' ? p.hormonalNote?.trim() || 'altro' : lab(HORMONAL_OPTS, p.hormonal).toLowerCase();
    const note = p.hormonal !== 'altro' && p.hormonal !== 'nessuna' ? p.hormonalNote?.trim() : '';
    out.push({ label: 'Terapia ormonale', value: note ? `${v} (${note})` : v });
  }
  if (p.onsetAge != null || p.onsetYear != null) {
    const age = onsetAgeOf(p);
    out.push({ label: 'Esordio', value: p.onsetYear != null ? `${p.onsetYear}${age != null ? ` (a ${age} anni)` : ''}` : `a ${age} anni` });
  }
  if (p.familyHistory) out.push({ label: 'Familiarità per emicrania', value: lab(FAMILY_OPTS, p.familyHistory).toLowerCase() });
  if (p.smoking) out.push({ label: 'Fumo', value: lab(SMOKING_OPTS, p.smoking).toLowerCase() });
  return out;
}

/** Aura nel periodo + pillola estroprogestinica: combinazione da segnalare al medico (nessun consiglio oltre a questo). */
export const auraWithCombinedPill = (p: Profile, auraEpisodes: number) => p.hormonal === 'estroprogestinica' && auraEpisodes > 0;
