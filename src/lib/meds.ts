// Utilità sui farmaci personali condivise tra "I miei farmaci" e l'onboarding.
import { KNOWN_ACUTE } from './catalog';
import { addDays, dayKey } from './clinic';
import type { Episode } from './types';

/** Farmaci sintomatici più comuni, proposti per primi. */
export const COMMON_ACUTE_NAMES = [
  'Oki (ketoprofene)',
  'Oki Task (ketoprofene)',
  'Ketodol (ketoprofene)',
  'Moment (ibuprofene)',
  'Moment Act (ibuprofene)',
  'Tachipirina 500 (paracetamolo)',
  'Tachipirina 1000 (paracetamolo)',
  'Diclofenac',
  'Sumatriptan',
  'Rizatriptan',
  'Almotriptan',
  'Eletriptan'
];

export const COMMON_ACUTE = COMMON_ACUTE_NAMES.map((n) => KNOWN_ACUTE.find((k) => k.name === n)!).filter(Boolean);

export const findKnownAcute = (name: string) => KNOWN_ACUTE.find((k) => k.name.toLowerCase() === name.trim().toLowerCase());

/** Giorni distinti in cui il farmaco (per nome) è stato assunto negli ultimi `days` giorni. */
export function medUseDays(episodes: Episode[], name: string, now = new Date(), days = 30) {
  const to = dayKey(now);
  const from = addDays(to, -(days - 1));
  const n = name.trim().toLowerCase();
  const set = new Set<string>();
  for (const e of episodes)
    for (const m of e.meds) {
      if (m.name.trim().toLowerCase() !== n) continue;
      const k = dayKey(m.time);
      if (k >= from && k <= to) set.add(k);
    }
  return set.size;
}
