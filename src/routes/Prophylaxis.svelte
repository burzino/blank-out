<script lang="ts">
  import { FREQUENCIES, KNOWN_PROPHYLAXIS, labelOf } from '../lib/catalog';
  import { dayKey } from '../lib/clinic';
  import { data, deleteProphylaxis, saveProphylaxis, uid } from '../lib/db.svelte';
  import { route } from '../lib/router.svelte';
  import type { Prophylaxis } from '../lib/types';
  import { haptic, toast } from '../lib/ui.svelte';
  import Chips from '../components/Chips.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import ProphylaxisDetail from '../components/ProphylaxisDetail.svelte';
  import ProphylaxisEfficacy from '../components/ProphylaxisEfficacy.svelte';

  const id = $derived(route.params.get('id'));
  const today = dayKey(new Date());
  const isActive = (p: Prophylaxis) => !p.endDate || p.endDate > today;
  const byStart = (a: Prophylaxis, b: Prophylaxis) => b.startDate.localeCompare(a.startDate);
  const active = $derived(data.prophylaxis.filter(isActive).sort(byStart));
  const past = $derived(data.prophylaxis.filter((p) => !isActive(p)).sort(byStart));

  let adding = $state(false);
  let name = $state('');
  let dose = $state('');
  let frequency = $state<string | undefined>('giornaliera');
  let startDate = $state(today);

  function onName() {
    const k = KNOWN_PROPHYLAXIS.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (k) frequency = k.freq;
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    const k = KNOWN_PROPHYLAXIS.find((x) => x.name.toLowerCase() === n.toLowerCase());
    const p: Prophylaxis = { id: uid(), name: k?.name ?? n, dose: dose.trim(), frequency: frequency ?? '', startDate: startDate || today, sideEffects: [], notes: '' };
    await saveProphylaxis(p);
    haptic();
    toast(`${p.name} aggiunta`, { label: 'Annulla', run: () => deleteProphylaxis(p.id) });
    name = '';
    dose = '';
    frequency = 'giornaliera';
    startDate = today;
    adding = false;
  }

  const fmtDate = (k: string) => new Date(k + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<div class="page fade">
  {#if id}
    {@const p = data.prophylaxis.find((x) => x.id === id)}
    <PageHeader title={p?.name || 'Terapia'} fallback="/prophylaxis" />
    {#key id}
      <ProphylaxisDetail {id} />
    {/key}
  {:else}
    <PageHeader title="Profilassi" />
    <p class="muted small">Le terapie di prevenzione prescritte dal medico. Qui vedi se stanno funzionando.</p>

    {#if !data.prophylaxis.length && !adding}
      <div class="card"><p style="margin:0">Nessuna terapia di prevenzione registrata.</p></div>
    {/if}

    {#if active.length}
      <h2>In corso</h2>
      <section class="card list">
        {#each active as p (p.id)}
          <a class="list-item" href={'#/prophylaxis?id=' + p.id}>
            <span class="grow">
              <strong>{p.name}</strong>{#if p.dose}<span class="muted"> · {p.dose}</span>{/if}
              <span class="small muted sub">dal {fmtDate(p.startDate)}{p.frequency ? ` · ${labelOf(FREQUENCIES, p.frequency).toLowerCase()}` : ''}</span>
              <span class="sub"><ProphylaxisEfficacy {p} compact /></span>
            </span>
            <span class="muted" aria-hidden="true">›</span>
          </a>
        {/each}
      </section>
    {/if}

    {#if adding}
      <section class="card fade">
        <h3 style="margin-top:0">Nuova terapia</h3>
        <div class="field">
          <label for="np-name">Farmaco</label>
          <input id="np-name" type="text" list="np-known" bind:value={name} oninput={onName} placeholder="es. Propranololo" autocomplete="off" />
          <datalist id="np-known">
            {#each KNOWN_PROPHYLAXIS as k (k.name)}<option value={k.name}>{k.group}</option>{/each}
          </datalist>
        </div>
        <div class="field">
          <label for="np-dose">Dose</label>
          <input id="np-dose" type="text" bind:value={dose} placeholder="es. 40 mg" />
        </div>
        <div class="field">
          <span class="label">Frequenza</span>
          <Chips options={FREQUENCIES} bind:value={frequency} multi={false} seg />
        </div>
        <div class="field">
          <label for="np-start">Iniziata il</label>
          <input id="np-start" type="date" max={today} bind:value={startDate} />
        </div>
        <div class="row">
          <button class="btn grow" onclick={() => (adding = false)}>Lascia stare</button>
          <button class="btn primary grow" onclick={add} disabled={!name.trim()}>Aggiungi</button>
        </div>
      </section>
    {:else}
      <button class="btn primary block" onclick={() => (adding = true)}>+ Aggiungi una terapia</button>
    {/if}

    {#if past.length}
      <h2>Terapie passate</h2>
      <section class="card list">
        {#each past as p (p.id)}
          <a class="list-item" href={'#/prophylaxis?id=' + p.id}>
            <span class="grow">
              <strong>{p.name}</strong>{#if p.dose}<span class="muted"> · {p.dose}</span>{/if}
              <span class="small muted sub">{fmtDate(p.startDate)} → {p.endDate ? fmtDate(p.endDate) : ''}</span>
            </span>
            <span class="muted" aria-hidden="true">›</span>
          </a>
        {/each}
      </section>
    {/if}

    <p class="alert small" style="margin-top:16px">Non iniziare, modificare o sospendere una terapia senza il tuo medico.</p>
  {/if}
</div>

<style>
  .list { padding-top: 4px; padding-bottom: 4px; }
  .sub { display: block; margin-top: 2px; }
</style>
