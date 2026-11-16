// Esportazione CSV pensata per Excel in italiano: separatore ";" e BOM UTF-8.
import { AURAS, AUTONOMIC, DISABILITY, EFFICACY, LOCATIONS, QUALITIES, SIDES, SYMPTOMS, TRIGGERS, classLabel, labelOf, type Opt } from './catalog';
import { durationMin } from './clinic';
import type { Episode } from './types';

const SEP = ';';
const BOM = '﻿';

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: unknown[][]): string {
  return BOM + rows.map((r) => r.map(cell).join(SEP)).join('\r\n') + '\r\n';
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Data e ora locali leggibili: 2026-11-16 14:05 */
export function localDateTime(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const timeOnly = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const labels = (list: Opt[], ids: string[]) => ids.map((id) => labelOf(list, id)).join(', ');
const num = (n: number | undefined | null) => (n == null ? '' : String(n).replace('.', ','));

export function episodesCsv(episodes: Episode[]): string {
  const head = [
    'inizio', 'fine', 'durata_min', 'intensità', 'picco', 'lato', 'zone', 'qualità', 'sintomi', 'autonomici',
    'aura', 'durata_aura', 'trigger', 'farmaci', 'disabilità', 'note'
  ];
  const sorted = [...episodes].sort((a, b) => a.start.localeCompare(b.start));
  const rows = sorted.map((e) => [
    localDateTime(e.start),
    localDateTime(e.end),
    e.end ? Math.round(durationMin(e)) : '',
    e.intensity,
    e.peak ?? '',
    e.side ? labelOf(SIDES, e.side) : '',
    labels(LOCATIONS, e.locations),
    labels(QUALITIES, e.quality),
    labels(SYMPTOMS, e.symptoms),
    labels(AUTONOMIC, e.autonomic),
    labels(AURAS, e.aura),
    num(e.auraDurationMin),
    labels(TRIGGERS, e.triggers),
    e.meds
      .map((m) => [m.name, m.dose ?? '', timeOnly(m.time), m.efficacy ? labelOf(EFFICACY, m.efficacy) : ''].filter(Boolean).join(' '))
      .join(' | '),
    e.disability ? labelOf(DISABILITY, e.disability) : '',
    e.notes ?? ''
  ]);
  return toCsv([head, ...rows]);
}

export function intakesCsv(episodes: Episode[]): string {
  const head = ['data_ora', 'farmaco', 'classe', 'dose', 'efficacia', 'ricomparsa_24h', 'inizio_episodio'];
  const rows = episodes
    .flatMap((e) => e.meds.map((m) => ({ e, m })))
    .sort((a, b) => a.m.time.localeCompare(b.m.time))
    .map(({ e, m }) => [
      localDateTime(m.time),
      m.name,
      classLabel(m.cls),
      m.dose ?? '',
      m.efficacy ? labelOf(EFFICACY, m.efficacy) : '',
      m.recurrence24h ? 'sì' : '',
      localDateTime(e.start)
    ]);
  return toCsv([head, ...rows]);
}

/** Scarica un file generato in memoria. */
export function downloadFile(name: string, content: string | Blob, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
