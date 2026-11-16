// Azioni sugli episodi condivise tra le schermate (con toast "Annulla").
import { addDays, autoRedFlag, dayKey, rankRecent } from './clinic';
import { KNOWN_ACUTE, TRIGGERS, type MedClass, type Opt } from './catalog';
import { activeEpisode, data, deleteEpisode, newEpisode, saveEpisode, saveMedication, uid } from './db.svelte';
import type { Episode, MedIntake, Medication } from './types';
import { haptic, toast } from './ui.svelte';

// Orologio condiviso per durate "in corso"
export const clock = $state({ now: new Date() });
setInterval(() => (clock.now = new Date()), 30000);

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

export async function startEpisode(start: string, intensity: number, copyFrom?: Episode) {
  const e = newEpisode({ start, intensity });
  if (copyFrom) {
    e.locations = [...copyFrom.locations];
    e.side = copyFrom.side;
    e.quality = [...copyFrom.quality];
    e.symptoms = [...copyFrom.symptoms];
    e.autonomic = [...copyFrom.autonomic];
    e.triggers = [...copyFrom.triggers];
  }
  await saveEpisode(e);
  haptic();
  toast('Episodio salvato', { label: 'Annulla', run: () => deleteEpisode(e.id) });
  return e;
}

export async function endEpisode(e: Episode, onChangeTime?: () => void) {
  const before = clone(e);
  const copy = clone(e);
  copy.end = new Date().toISOString();
  await saveEpisode(copy);
  haptic(20);
  toast(`Episodio chiuso alle ${hhmm(copy.end)}`, {
    label: onChangeTime ? 'Cambia ora' : 'Annulla',
    run: () => (onChangeTime ? onChangeTime() : saveEpisode(before))
  });
}

export async function removeEpisode(e: Episode) {
  const before = clone(e);
  await deleteEpisode(e.id);
  toast('Eliminato', { label: 'Annulla', run: () => saveEpisode(before) });
}

/** Farmaci personali ordinati per uso recente, poi quelli in elenco. */
export function rankedMeds(): Medication[] {
  const ranking = rankRecent(data.episodes, (e) => e.meds.map((m) => m.name.toLowerCase()));
  const pos = (m: Medication) => {
    const i = ranking.indexOf(m.name.toLowerCase());
    return i < 0 ? 999 : i;
  };
  return data.medications.filter((m) => !m.archived).sort((a, b) => pos(a) - pos(b));
}

export function intakeFrom(m: { name: string; cls: MedClass; dose?: string }, time = new Date().toISOString()): MedIntake {
  return { id: uid(), name: m.name, cls: m.cls, dose: m.dose, time };
}

/** Registra un farmaco: sull'episodio in corso, oppure ne apre uno nuovo. */
export async function takeMed(m: { name: string; cls: MedClass; dose?: string }, target?: Episode, time?: string) {
  let e = target ?? activeEpisode();
  let created = false;
  if (!e) {
    e = newEpisode({ intensity: 5, start: time ?? new Date().toISOString() });
    created = true;
  }
  const copy = clone(e);
  const intake = intakeFrom(m, time);
  copy.meds.push(intake);
  await saveEpisode(copy);
  await rememberMed(m);
  haptic();
  toast(created ? `${m.name} registrato, episodio aperto` : `${m.name} registrato`, {
    label: 'Annulla',
    run: async () => {
      if (created) await deleteEpisode(copy.id);
      else {
        const cur = data.episodes.find((x) => x.id === copy.id);
        if (cur) await saveEpisode({ ...clone(cur), meds: cur.meds.filter((x) => x.id !== intake.id) });
      }
    }
  });
  return copy;
}

/** Aggiunge il farmaco alla lista personale se non c'è già. */
export async function rememberMed(m: { name: string; cls: MedClass; dose?: string }) {
  if (data.medications.some((x) => x.name.toLowerCase() === m.name.toLowerCase())) return;
  await saveMedication({ id: uid(), name: m.name, cls: m.cls, dose: m.dose });
}

export function knownMedClass(name: string): MedClass | undefined {
  return KNOWN_ACUTE.find((k) => k.name.toLowerCase() === name.trim().toLowerCase())?.cls;
}

/** Trigger: catalogo + personalizzati, ordinati per frequenza recente. */
export function rankedTriggers(): Opt[] {
  const all: Opt[] = [...TRIGGERS];
  // Niente id duplicati (chiavi degli #each): un trigger personalizzato può coincidere con un id del catalogo
  for (const t of data.customTriggers) if (!all.some((o) => o.id === t)) all.push({ id: t, label: t });
  const ranking = rankRecent(data.episodes, (e) => e.triggers);
  const pos = (o: Opt) => {
    const i = ranking.indexOf(o.id);
    return i < 0 ? 999 : i;
  };
  return all.sort((a, b) => pos(a) - pos(b));
}

export function daysSinceLast(): number | null {
  const last = data.episodes.find((e) => e.end);
  if (!last?.end) return null;
  const k = dayKey(last.end);
  let n = 0;
  for (let d = dayKey(clock.now); d > k; d = addDays(d, -1)) n++;
  return n;
}

export const redFlagFor = (e: Episode) => autoRedFlag(e, data.episodes);
