<script lang="ts">
  import { LEVEL_LABEL } from '../lib/catalog';
  import { keyToDate } from '../lib/clinic';
  import { monthCells, type DayMark } from '../lib/analytics';
  import type { DayInfo } from '../lib/types';
  import Icon from './Icon.svelte';

  // Griglia mensile riusabile: grande e toccabile (Calendario) o compatta per la stampa (Report).
  let {
    year,
    month,
    marks,
    days,
    showPeriod = false,
    compact = false,
    today,
    selected,
    from,
    to,
    onpick
  }: {
    year: number;
    month: number;
    marks: Map<string, DayMark>;
    days: Map<string, DayInfo>;
    showPeriod?: boolean;
    compact?: boolean;
    today?: string;
    selected?: string;
    from?: string;
    to?: string;
    onpick?: (k: string) => void;
  } = $props();

  const WEEK = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  const WEEK_FULL = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  const cells = $derived(monthCells(year, month));
  const out = (k: string) => (from && k < from) || (to && k > to);

  function describe(k: string) {
    const m = marks.get(k);
    const d = days.get(k);
    const parts = [keyToDate(k).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })];
    if (m?.level) parts.push(`mal di testa ${LEVEL_LABEL[m.level].toLowerCase()}, intensità massima ${m.maxPain}`);
    if (m?.med) parts.push('farmaco');
    if (m?.aura) parts.push('aura');
    if (showPeriod && d?.period) parts.push(d.periodStart ? 'primo giorno del ciclo' : 'ciclo');
    if (d?.headacheFree && !m?.level) parts.push('nessun mal di testa');
    return parts.join(', ');
  }
</script>

<div class="grid" class:compact role="grid" aria-label={new Date(year, month, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}>
  {#each WEEK as w, i (i)}
    <span class="wd" role="columnheader" aria-label={WEEK_FULL[i]}>{w}</span>
  {/each}
  {#each cells as k, i (k ?? 'x' + i)}
    {#if !k}
      <span class="cell empty"></span>
    {:else}
      {@const m = marks.get(k)}
      {@const d = days.get(k)}
      {@const lvl = m?.level ?? 0}
      {#snippet body()}
        <span class="circle" class:i1={lvl === 1} class:i2={lvl === 2} class:i3={lvl === 3} class:today={k === today}>{Number(k.slice(8))}</span>
        <span class="marks" aria-hidden="true">
          {#if lvl}<b class="num">{m?.maxPain}</b>{/if}
          {#if m?.med}
            {#if compact}<i class="pdot"></i>{:else}<span class="pill"><Icon name="pill" size={11} /></span>{/if}
          {/if}
          {#if m?.aura}<b class="aura">A</b>{/if}
          {#if showPeriod && d?.period}
            {#if compact}<b class="flow">M</b>{:else}<span class="flow"><Icon name="drop" size={11} /></span>{/if}
          {/if}
          {#if d?.headacheFree && !lvl && !compact}<span class="free">✓</span>{/if}
        </span>
      {/snippet}
      {#if onpick}
        <button type="button" class="cell" class:sel={k === selected} class:out={out(k)} aria-label={describe(k)} aria-pressed={k === selected} onclick={() => onpick(k)}>
          {@render body()}
        </button>
      {:else}
        <span class="cell" class:out={out(k)} role="gridcell" aria-label={describe(k)}>{@render body()}</span>
      {/if}
    {/if}
  {/each}
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .wd { text-align: center; font-size: 0.75rem; color: var(--muted); padding: 4px 0; }
  .cell {
    min-height: 56px; min-width: 0; padding: 4px 0 2px;
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: none; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer;
  }
  span.cell { cursor: default; }
  .cell.empty { min-height: 0; }
  .cell.sel { border-color: var(--accent); background: var(--surface-2); }
  .cell.out { opacity: 0.35; }
  .circle {
    width: 30px; height: 30px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.85rem; font-variant-numeric: tabular-nums;
    border: 1px solid var(--border);
  }
  .circle.i1, .circle.i2, .circle.i3 { border-color: transparent; font-weight: 700; }
  .circle.today { outline: 2px solid var(--accent); outline-offset: 1px; }
  .marks { display: flex; gap: 2px; align-items: center; justify-content: center; min-height: 13px; font-size: 0.65rem; line-height: 1; color: var(--muted); }
  .marks b { font-weight: 700; }
  .pill { color: var(--accent); display: inline-flex; }
  .aura { color: var(--text); }
  .flow { color: var(--i3); display: inline-flex; }
  .free { color: var(--i1); }

  .compact { gap: 1px; }
  .compact .wd { font-size: 0.6rem; padding: 0; }
  .compact .cell { min-height: 0; padding: 0; gap: 0; border: none; }
  .compact .circle { width: 100%; height: auto; aspect-ratio: auto; border-radius: 3px; font-size: 0.62rem; padding: 1px 0; }
  .compact .marks { font-size: 0.5rem; min-height: 8px; gap: 1px; color: var(--text); }
  .compact .pdot { width: 4px; height: 4px; border-radius: 50%; background: currentColor; display: inline-block; }
  .compact .flow { color: var(--text); }

  @media print {
    .compact .circle { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
