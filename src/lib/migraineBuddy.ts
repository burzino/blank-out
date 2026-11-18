// Importazione dell'esportazione CSV di Migraine Buddy (versione italiana, con alias inglesi dove noti).
// Il file contiene più tabelle separate da righe vuote: si usa solo quella degli attacchi (intestazione "#", "Iniziato", ...).
import { KNOWN_ACUTE, type MedClass } from './catalog';
import type { Episode, MedIntake } from './types';

/** Parser CSV RFC 4180 (virgole, campi tra virgolette, "" come escape, a capo dentro i campi). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
const list = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

// Colonne: chiave interna → intestazioni possibili
const COLUMNS = {
  start: ['iniziato', 'started'],
  duration: ['durato', 'lasted'],
  offset: ['offset utc di inizio (min)', 'start utc offset (min)'],
  type: ['tipi di attacco', 'attack types'],
  pain: ['livello di dolore', 'pain level'],
  activities: ['attività affette', 'affected activities'],
  triggers: ['potenziali cause scatenanti', 'potential triggers'],
  symptoms: ['sintomi', 'symptoms'],
  prodromes: ['sintomi premonitori', 'warning signs'],
  positions: ['localizzazioni del dolore', 'pain positions'],
  medHelpful: ['farmaco efficace', 'helpful medication'],
  medSomewhat: ['farmaco di una certa efficacia', 'somewhat helpful medication'],
  medUnhelpful: ['farmaco inefficace', 'unhelpful medication'],
  medUnsafe: ['farmaco non sicuro', 'unsure medication'],
  reliefHelpful: ['metodi di sollievo efficaci non basati su farmaci', 'helpful non-medication relief methods'],
  reliefSomewhat: ['metodi di sollievo di una certa efficacia non basati su farmaci', 'somewhat helpful non-medication relief methods'],
  notes: ['annotazioni', 'notes']
} as const;
type Col = keyof typeof COLUMNS;

/** "03/11/26 10:24" (ora locale del momento) + offset UTC in minuti → ISO. */
function parseStart(s: string, offsetMin: number | null): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ ,T]+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, d, mo, y, h, mi] = m.map(Number) as number[];
  const year = y < 100 ? 2000 + y : y;
  if (offsetMin == null) return new Date(year, mo - 1, d, h, mi).toISOString();
  return new Date(Date.UTC(year, mo - 1, d, h, mi) - offsetMin * 60000).toISOString();
}

/** "10h 26m", "1d 02h 05m", "45m" → minuti. */
function parseDuration(s: string): number | null {
  let total = 0;
  let found = false;
  for (const [, n, u] of s.matchAll(/(\d+)\s*([dhm])/gi)) {
    found = true;
    total += Number(n) * ({ d: 1440, h: 60, m: 1 } as Record<string, number>)[u.toLowerCase()];
  }
  return found ? total : null;
}

// Zone del dolore: parole chiave → id di LOCATIONS
const POSITION_RULES: [RegExp, string][] = [
  [/collo|neck/, 'nucale'],
  [/tempia|temple/, 'temporale'],
  [/occhio|eye/, 'orbitale'],
  [/frontale|fronte|front|forehead/, 'frontale'],
  [/posteriore|nuca|back of/, 'occipitale'],
  [/sommità|vertice|superiore|top/, 'vertice']
];

function mapPositions(raw: string[]) {
  const locations = new Set<string>();
  let left = false;
  let right = false;
  for (const p of raw) {
    const n = norm(p);
    const rule = POSITION_RULES.find(([re]) => re.test(n));
    if (rule) locations.add(rule[1]);
    if (/sinistr|left/.test(n)) left = true;
    if (/destr|right/.test(n)) right = true;
    if (/tutta|intera|whole|entire/.test(n)) locations.add('tutta');
  }
  const side = left && right ? 'bilaterale' : left ? 'sinistro' : right ? 'destro' : undefined;
  return { locations: [...locations], side };
}

// Sintomi: parole chiave → [campo, id]
const SYMPTOM_RULES: [RegExp, 'quality' | 'symptoms' | 'aura', string][] = [
  [/pulsant|throbbing|pulsating/, 'quality', 'pulsante'],
  [/sordo|pressione|oppressiv|dull|pressing/, 'quality', 'gravativo'],
  [/acuto|lancinante|pugnalata|stabbing|sharp/, 'quality', 'trafittivo'],
  [/bruciore|burning/, 'quality', 'urente'],
  [/nausea/, 'symptoms', 'nausea'],
  [/vomit/, 'symptoms', 'vomito'],
  [/luce|fotofobia|light/, 'symptoms', 'fotofobia'],
  [/rumor|suon|fonofobia|sound|noise/, 'symptoms', 'fonofobia'],
  [/odor|osmofobia|smell/, 'symptoms', 'osmofobia'],
  [/movimento|attività fisica|movement|physical activity/, 'symptoms', 'peggiora_attivita'],
  [/vertigin|capogir|dizz/, 'symptoms', 'vertigini'],
  [/collo|neck/, 'symptoms', 'cervicalgia'],
  [/aura/, 'aura', 'visiva']
];

// Cause scatenanti: parole chiave → id di TRIGGERS
const TRIGGER_RULES: [RegExp, string][] = [
  [/mestru|ciclo|period|menstru/, 'ciclo_mestruale'],
  [/troppo sonno|dormito troppo|too much sleep|oversleep/, 'sonno_eccessivo'],
  [/sonno|dormit|sleep/, 'sonno_scarso'],
  [/stress/, 'stress'],
  [/pasto|digiun|skipped meal|fasting|hunger/, 'digiuno'],
  [/alcol|vino|birra|alcohol|wine|beer/, 'alcol'],
  [/caff|caffein|coffee/, 'caffeina_eccesso'],
  [/disidrat|acqua|dehydrat|water/, 'disidratazione'],
  [/meteo|tempo atmosferico|pression|weather|barometric/, 'meteo'],
  [/schermo|luce|screen|light/, 'schermi'],
  [/rumor|noise/, 'rumore'],
  [/odor|profum|smell|perfume/, 'odori'],
  [/esercizio|sforzo|sport|exercise|exertion/, 'sforzo'],
  [/viaggi|jet lag|travel/, 'viaggio'],
  [/cibo|alimento|food|cheese|chocolate|cioccolat|formaggi/, 'cibo']
];

const NO_ANSWER = /^(no|nessun[oa]?|nessuna idea|none|no idea|non so ancora|nessun sollievo|no relief|not affected|non affetto)$/;

// Farmaci: principio attivo (italiano o inglese) → nome nel catalogo
const MED_RULES: [RegExp, string, MedClass][] = [
  [/ibuprof/, 'Ibuprofene', 'fans'],
  [/ketoprof/, 'Ketoprofene', 'fans'],
  [/naprox|naprosse/, 'Naprossene', 'fans'],
  [/diclofen/, 'Diclofenac', 'fans'],
  [/aspirin|acetilsalicil|acetylsalicyl/, 'Acido acetilsalicilico', 'fans'],
  [/indomet/, 'Indometacina', 'fans'],
  [/codein/, 'Paracetamolo + codeina', 'combinato'],
  [/paracetam|acetaminoph|tachipirin/, 'Paracetamolo', 'paracetamolo'],
  [/sumatript/, 'Sumatriptan', 'triptano'],
  [/rizatript/, 'Rizatriptan', 'triptano'],
  [/zolmitript/, 'Zolmitriptan', 'triptano'],
  [/almotript/, 'Almotriptan', 'triptano'],
  [/eletript/, 'Eletriptan', 'triptano'],
  [/frovatript/, 'Frovatriptan', 'triptano'],
  [/naratript/, 'Naratriptan', 'triptano'],
  [/triptan/, '', 'triptano'],
  [/rimegep/, 'Rimegepant', 'gepante'],
  [/gepant/, '', 'gepante'],
  [/lasmidit/, 'Lasmiditan', 'ditano'],
  [/tramad/, 'Tramadolo', 'oppioide'],
  [/ergotam/, 'Ergotamina + caffeina', 'ergotamina'],
  [/metoclopr/, 'Metoclopramide', 'antiemetico'],
  [/domperid/, 'Domperidone', 'antiemetico'],
  [/ossigeno|oxygen/, 'Ossigeno', 'ossigeno']
];
const FORMS = /\b(orale|oral|polvere|powder|compress[ae]|tablet|capsul[ae]|capsule|bustin[ae]|sachet|supposta|suppository|iniezione|injection|spray nasale|nasal spray|gocce|drops|liquid[oa]?|sciroppo)\b/gi;

/** "1x Ibuprofen 600mg Polvere" → nome del catalogo, classe e dose. */
export function parseMed(raw: string): { name: string; cls: MedClass; dose?: string } {
  let s = raw.trim();
  const qty = s.match(/^(\d+(?:[.,]\d+)?)\s*x\s+/i);
  if (qty) s = s.slice(qty[0].length);
  const strength = s.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg|ml)\b/i);
  if (strength) s = s.replace(strength[0], ' ');
  s = s.replace(FORMS, ' ').replace(/\s+/g, ' ').trim();
  const n = norm(s);
  const rule = MED_RULES.find(([re]) => re.test(n));
  const known = KNOWN_ACUTE.find((k) => norm(k.name) === n);
  const name = (rule?.[1] || known?.name || s || raw.trim());
  const cls = rule?.[2] ?? known?.cls ?? 'altro';
  const parts = [];
  const count = qty ? Number(qty[1].replace(',', '.')) : 1;
  if (count !== 1) parts.push(`${qty![1]} ×`);
  if (strength) parts.push(`${strength[1]} ${strength[2].toLowerCase()}`);
  return { name, cls, dose: parts.length ? parts.join(' ') : undefined };
}

export interface MbImport {
  episodes: Episode[];
  skippedRows: number;
}

/** Converte il CSV di Migraine Buddy in episodi di Blank Out. Lancia un errore se il file non è riconosciuto. */
export function parseMigraineBuddy(text: string): MbImport {
  const rows = parseCsv(text);
  const headerIdx = rows.findIndex((r) => r[0]?.trim() === '#' && r.some((c) => COLUMNS.start.includes(norm(c) as never)));
  if (headerIdx < 0) throw new Error('not migraine buddy');
  const header = rows[headerIdx].map(norm);
  const idx = Object.fromEntries(
    (Object.keys(COLUMNS) as Col[]).map((k) => [k, header.findIndex((h) => (COLUMNS[k] as readonly string[]).includes(h))])
  ) as Record<Col, number>;

  const episodes: Episode[] = [];
  let skippedRows = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    if (!r.some((c) => c.trim())) break; // fine della tabella
    const get = (k: Col) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
    const useful = (k: Col) => list(get(k)).filter((x) => !NO_ANSWER.test(norm(x)));

    const offset = get('offset') === '' ? null : Number(get('offset'));
    const start = parseStart(get('start'), Number.isFinite(offset) ? offset : null);
    if (!start) {
      skippedRows++;
      continue;
    }
    const dur = parseDuration(get('duration'));
    const end = new Date(new Date(start).getTime() + (dur ?? 0) * 60000).toISOString();

    const pain = Number(get('pain').replace(',', '.'));
    const { locations, side } = mapPositions(list(get('positions')));

    const quality = new Set<string>();
    const symptoms = new Set<string>();
    const aura = new Set<string>();
    const otherSymptoms: string[] = [];
    for (const s of useful('symptoms')) {
      const rule = SYMPTOM_RULES.find(([re]) => re.test(norm(s)));
      if (!rule) otherSymptoms.push(s);
      else ({ quality, symptoms, aura })[rule[1]].add(rule[2]);
    }

    const triggers = new Set<string>();
    for (const t of useful('triggers')) triggers.add(TRIGGER_RULES.find(([re]) => re.test(norm(t)))?.[1] ?? t);

    const activities = useful('activities').map(norm);
    const disability = activities.some((a) => /letto|bed/.test(a))
      ? 'a_letto'
      : activities.length
        ? 'ridotta'
        : list(get('activities')).length
          ? 'nessuna'
          : undefined;

    const meds: MedIntake[] = [];
    const addMeds = (k: Col, efficacy?: MedIntake['efficacy']) => {
      for (const raw of list(get(k))) meds.push({ id: uid(), time: start, efficacy, ...parseMed(raw) });
    };
    addMeds('medHelpful', 'completa');
    addMeds('medSomewhat', 'parziale');
    addMeds('medUnhelpful', 'nessuna');
    addMeds('medUnsafe');

    const notes = [
      useful('type').length ? `Tipo (Migraine Buddy): ${useful('type').join(', ')}` : '',
      otherSymptoms.length ? `Altri sintomi: ${otherSymptoms.join(', ')}` : '',
      useful('prodromes').length ? `Segnali premonitori: ${useful('prodromes').join(', ')}` : '',
      useful('reliefHelpful').length ? `Sollievo senza farmaci: ${useful('reliefHelpful').join(', ')}` : '',
      useful('reliefSomewhat').length ? `Sollievo parziale senza farmaci: ${useful('reliefSomewhat').join(', ')}` : '',
      get('notes')
    ].filter(Boolean);

    episodes.push({
      id: uid(),
      start,
      end,
      intensity: Number.isFinite(pain) ? Math.max(0, Math.min(10, Math.round(pain))) : 5,
      locations,
      side,
      quality: [...quality],
      symptoms: [...symptoms],
      autonomic: [],
      aura: [...aura],
      triggers: [...triggers],
      meds,
      disability,
      redFlags: [],
      notes: notes.join('\n'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return { episodes, skippedRows };
}
