<script lang="ts">
  import { KNOWN_ACUTE, MED_CLASSES, type MedClass } from '../lib/catalog';
  import { knownMedClass, rankedMeds } from '../lib/episodes.svelte';
  import { COMMON_ACUTE } from '../lib/meds';

  type Med = { name: string; cls: MedClass; dose?: string };

  // Un tap su un farmaco = registrato all'orario scelto (default: adesso).
  // Prima i farmaci personali, poi i suggeriti; la ricerca copre nome commerciale e principio attivo.
  let { onpick, limit = 6, showTime = true }: { onpick: (m: Med, time: string) => void; limit?: number; showTime?: boolean } = $props();

  const AGO = [
    { min: 0, label: 'Adesso' },
    { min: 30, label: '−30 min' },
    { min: 60, label: '−1 h' },
    { min: 120, label: '−2 h' }
  ];
  let ago = $state(0);
  let custom = $state('');
  let query = $state('');
  let adding = $state(false);
  let cls = $state<MedClass>('fans');
  let dose = $state('');

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const mine = $derived(rankedMeds());
  const has = (name: string) => mine.some((m) => norm(m.name) === norm(name));
  const suggested = $derived(COMMON_ACUTE.filter((k) => !has(k.name)).slice(0, Math.max(0, limit + 2 - mine.length)));
  const results = $derived.by(() => {
    const q = norm(query.trim());
    if (!q) return [];
    const pool: Med[] = [...mine, ...KNOWN_ACUTE.filter((k) => !has(k.name))];
    return pool.filter((m) => norm(m.name).includes(q)).slice(0, 8);
  });
  const exact = $derived(results.some((m) => norm(m.name) === norm(query.trim())));
  const QUICK_CLASSES = MED_CLASSES.filter((c) => ['fans', 'paracetamolo', 'triptano', 'combinato', 'altro'].includes(c.id));

  function time() {
    if (ago === -1 && custom) return new Date(custom).toISOString();
    return new Date(Date.now() - Math.max(0, ago) * 60000).toISOString();
  }
  function pick(m: Med) {
    onpick({ name: m.name, cls: m.cls, dose: m.dose }, time());
    query = '';
    adding = false;
  }
  function addNew() {
    const name = query.trim();
    if (!name) return;
    pick({ name, cls: knownMedClass(name) ?? cls, dose: dose.trim() || undefined });
    dose = '';
  }
  const label = (m: Med) => (m.dose ? `${m.name} · ${m.dose}` : m.name);
</script>

{#if showTime}
  <div class="chips when" role="group" aria-label="Quando l'hai preso?">
    {#each AGO as a (a.min)}
      <button type="button" class="chip" aria-pressed={ago === a.min} onclick={() => (ago = a.min)}>{a.label}</button>
    {/each}
    <button type="button" class="chip" aria-pressed={ago === -1} onclick={() => (ago = -1)}>Altro…</button>
  </div>
  {#if ago === -1}
    <input type="datetime-local" bind:value={custom} aria-label="Ora di assunzione" style="margin-bottom:12px" />
  {/if}
{/if}

<input type="search" class="search" placeholder="Cerca: Oki, Moment, Tachipirina…" bind:value={query} autocomplete="off" aria-label="Cerca un farmaco" />

<div class="chips">
  {#if query.trim()}
    {#each results as m (m.name)}
      <button type="button" class="chip med" onclick={() => pick(m)}>{label(m)}</button>
    {/each}
    {#if !exact}
      <button type="button" class="chip" aria-pressed={adding} onclick={() => (adding = !adding)}>+ Aggiungi «{query.trim()}»</button>
    {/if}
  {:else}
    {#each mine.slice(0, limit) as m (m.id)}
      <button type="button" class="chip med" onclick={() => pick(m)}>{label(m)}</button>
    {/each}
    {#each suggested as m (m.name)}
      <button type="button" class="chip med sugg" onclick={() => pick(m)}>{label(m)}</button>
    {/each}
  {/if}
</div>

{#if adding && query.trim()}
  <div class="card fade" style="margin-top:12px">
    <span class="label">Che tipo di farmaco è?</span>
    <div class="chips" style="margin:8px 0 12px">
      {#each QUICK_CLASSES as c (c.id)}
        <button type="button" class="chip" aria-pressed={cls === c.id} onclick={() => (cls = c.id)}>{c.label}</button>
      {/each}
    </div>
    <div class="row">
      <input type="text" bind:value={dose} placeholder="Dose (facoltativa)" aria-label="Dose" />
      <button class="btn primary" onclick={addNew}>Registra</button>
    </div>
  </div>
{/if}

<style>
  .when { margin-bottom: 12px; }
  .search { margin-bottom: 12px; }
  .med { font-weight: 600; }
  .sugg { font-weight: 400; border-style: dashed; }
</style>
