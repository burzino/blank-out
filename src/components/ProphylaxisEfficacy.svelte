<script lang="ts">
  import { prophylaxisEfficacy } from '../lib/clinic';
  import { data } from '../lib/db.svelte';
  import { clock } from '../lib/episodes.svelte';
  import type { Prophylaxis } from '../lib/types';

  // Valutazione efficacia: giorni di emicrania al mese prima vs ultimi 30 giorni
  let { p, compact = false }: { p: Prophylaxis; compact?: boolean } = $props();
  const ev = $derived(prophylaxisEfficacy(p, data.episodes, clock.now));
  const fmt = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });
  const isBotox = $derived(/botulin/i.test(p.name));
  const pct = $derived(ev.change === null ? null : Math.round(ev.change * 100));
</script>

{#if compact}
  <span class="small muted">
    {#if !ev.evaluable}Valutabile tra {ev.daysToEvaluation} giorni{:else if ev.responder}Responder (≥50% di riduzione){:else if pct !== null}{pct > 0 ? '+' : ''}{pct}% giorni di emicrania{/if}
  </span>
{:else}
  <div class="eff">
    {#if ev.baseline > 0}
      <p class="big num">{fmt(ev.baseline)} → {fmt(ev.current)} <span class="small muted">giorni di emicrania al mese</span></p>
      {#if pct !== null}
        <p>Variazione: <strong class="num">{pct > 0 ? '+' : ''}{pct}%</strong></p>
      {/if}
    {:else}
      <p class="small muted">Non ci sono abbastanza dati prima dell'inizio per un confronto. Ultimi 30 giorni: <strong class="num">{ev.current}</strong> giorni di emicrania.</p>
    {/if}
    {#if !ev.evaluable}
      <p class="tag">Valutabile tra {ev.daysToEvaluation} {ev.daysToEvaluation === 1 ? 'giorno' : 'giorni'}</p>
      <p class="small muted">Una profilassi va valutata dopo almeno {isBotox ? '6 mesi' : '3 mesi'}.</p>
    {:else if ev.responder}
      <p class="tag ok">Responder (≥50% di riduzione)</p>
    {:else if ev.baseline > 0}
      <p class="tag">Riduzione inferiore al 50%{ev.responderChronic ? ' (≥30%: risposta utile nelle forme croniche)' : ''}</p>
    {/if}
  </div>
{/if}

<style>
  .big { font-size: 1.3rem; font-weight: 700; margin-bottom: 4px; }
  .tag { display: inline-block; padding: 4px 12px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); font-weight: 600; }
  .tag.ok { background: var(--i1); color: var(--on-i); border-color: var(--i1); }
</style>
