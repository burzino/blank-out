<script lang="ts">
  import { KNOWN_ACUTE, MED_CLASSES, classLabel, type MedClass } from '../lib/catalog';
  import { data, deleteMedication, saveMedication, uid } from '../lib/db.svelte';
  import { clock, rememberMed } from '../lib/episodes.svelte';
  import { COMMON_ACUTE, findKnownAcute, medUseDays } from '../lib/meds';
  import type { Medication } from '../lib/types';
  import { haptic, toast } from '../lib/ui.svelte';
  import PageHeader from '../components/PageHeader.svelte';

  const active = $derived(data.medications.filter((m) => !m.archived));
  const archived = $derived(data.medications.filter((m) => m.archived));
  const has = (name: string) => data.medications.some((m) => m.name.toLowerCase() === name.toLowerCase());
  const suggestions = $derived(COMMON_ACUTE.filter((k) => !has(k.name)));

  let showArchived = $state(false);
  let editing = $state<string | null>(null);

  // Aggiunta personalizzata
  let name = $state('');
  let cls = $state<MedClass>('fans');
  let dose = $state('');

  function onName() {
    const k = findKnownAcute(name);
    if (k) {
      cls = k.cls;
      if (!dose) dose = k.dose;
    }
  }

  async function addKnown(k: { name: string; cls: MedClass; dose: string }) {
    await rememberMed(k);
    haptic();
    const added = data.medications.find((m) => m.name === k.name);
    toast(`${k.name} aggiunto`, added ? { label: 'Annulla', run: () => deleteMedication(added.id) } : undefined);
  }

  async function addCustom() {
    const n = name.trim();
    if (!n) return;
    if (has(n)) {
      toast(`${n} è già nei tuoi farmaci`);
      return;
    }
    const k = findKnownAcute(n);
    const m: Medication = { id: uid(), name: k?.name ?? n, cls: k?.cls ?? cls, dose: dose.trim() || undefined };
    await saveMedication(m);
    haptic();
    toast(`${m.name} aggiunto`, { label: 'Annulla', run: () => deleteMedication(m.id) });
    name = '';
    dose = '';
  }

  // Modifica inline: ogni cambio viene salvato subito
  function update(m: Medication, patch: Partial<Medication>) {
    const next = { ...$state.snapshot(m), ...patch };
    if (patch.name !== undefined && !patch.name.trim()) return;
    saveMedication(next);
  }

  async function setArchived(m: Medication, value: boolean) {
    const before = $state.snapshot(m);
    await saveMedication({ ...before, archived: value });
    haptic();
    toast(value ? `${m.name} archiviato` : `${m.name} ripristinato`, { label: 'Annulla', run: () => saveMedication(before) });
    if (editing === m.id) editing = null;
  }

  async function remove(m: Medication) {
    const before = $state.snapshot(m);
    await deleteMedication(m.id);
    haptic();
    toast(`${m.name} eliminato`, { label: 'Annulla', run: () => saveMedication(before) });
    if (editing === m.id) editing = null;
  }
</script>

<div class="page fade">
  <PageHeader title="I miei farmaci" />
  <p class="muted small">I farmaci che prendi quando hai mal di testa. Li ritrovi pronti, con un tocco.</p>

  {#if active.length === 0}
    <div class="card empty">
      <p>Aggiungi i farmaci che usi: li troverai pronti quando servono.</p>
    </div>
  {:else}
    <section class="card list">
      {#each active as m (m.id)}
        {@const days = medUseDays(data.episodes, m.name, clock.now)}
        <div class="med">
          <button class="head" aria-expanded={editing === m.id} onclick={() => (editing = editing === m.id ? null : m.id)}>
            <span class="grow">
              <strong>{m.name}</strong>{#if m.dose}<span class="muted"> · {m.dose}</span>{/if}
              <span class="small muted sub">{classLabel(m.cls)} · {days === 0 ? 'mai negli ultimi 30 giorni' : `${days} ${days === 1 ? 'giorno' : 'giorni'} su 30`}</span>
            </span>
            <span class="muted small">{editing === m.id ? 'Chiudi' : 'Modifica'}</span>
          </button>
          {#if editing === m.id}
            <div class="edit fade">
              <div class="field">
                <label for="n-{m.id}">Nome</label>
                <input id="n-{m.id}" type="text" value={m.name} onchange={(e) => update(m, { name: e.currentTarget.value.trim() })} />
              </div>
              <div class="row">
                <div class="field grow">
                  <label for="c-{m.id}">Tipo</label>
                  <select id="c-{m.id}" value={m.cls} onchange={(e) => update(m, { cls: e.currentTarget.value as MedClass })}>
                    {#each MED_CLASSES as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
                  </select>
                </div>
                <div class="field" style="width:40%">
                  <label for="d-{m.id}">Dose</label>
                  <input id="d-{m.id}" type="text" value={m.dose ?? ''} placeholder="400 mg" onchange={(e) => update(m, { dose: e.currentTarget.value.trim() || undefined })} />
                </div>
              </div>
              <p class="small muted">Le modifiche si salvano da sole.</p>
              <div class="row">
                <button class="btn grow" onclick={() => setArchived(m, true)}>Archivia</button>
                <button class="btn grow ghost danger" onclick={() => remove(m)}>Elimina</button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </section>
  {/if}

  {#if suggestions.length}
    <h2>Aggiungi con un tocco</h2>
    <div class="chips">
      {#each suggestions as k (k.name)}
        <button class="chip" onclick={() => addKnown(k)}>+ {k.name} <span class="muted small">{k.dose}</span></button>
      {/each}
    </div>
  {/if}

  <h2>Altro farmaco</h2>
  <section class="card">
    <div class="field">
      <label for="new-name">Nome</label>
      <input id="new-name" type="text" list="meds-known" bind:value={name} oninput={onName} placeholder="Cerca o scrivi, es. Diclofenac" autocomplete="off" />
      <datalist id="meds-known">
        {#each KNOWN_ACUTE as k (k.name)}<option value={k.name}></option>{/each}
      </datalist>
    </div>
    <div class="row">
      <div class="field grow">
        <label for="new-cls">Tipo</label>
        <select id="new-cls" bind:value={cls}>
          {#each MED_CLASSES as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
        </select>
      </div>
      <div class="field" style="width:40%">
        <label for="new-dose">Dose</label>
        <input id="new-dose" type="text" bind:value={dose} placeholder="400 mg" />
      </div>
    </div>
    <button class="btn primary block" onclick={addCustom} disabled={!name.trim()}>Aggiungi</button>
  </section>

  {#if archived.length}
    <button class="btn link" onclick={() => (showArchived = !showArchived)}>{showArchived ? '▾' : '▸'} Archiviati ({archived.length})</button>
    {#if showArchived}
      <section class="card list">
        {#each archived as m (m.id)}
          <div class="list-item">
            <span class="grow muted">{m.name}{m.dose ? ` · ${m.dose}` : ''}</span>
            <button class="btn" onclick={() => setArchived(m, false)}>Ripristina</button>
            <button class="btn ghost" aria-label="Elimina {m.name}" onclick={() => remove(m)}>✕</button>
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</div>

<style>
  .empty p { margin: 0; }
  .list { padding-top: 4px; padding-bottom: 4px; }
  .med { border-bottom: 1px solid var(--border); }
  .med:last-child { border-bottom: none; }
  .head { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 64px; padding: 10px 0; background: none; border: none; text-align: left; cursor: pointer; }
  .sub { display: block; margin-top: 2px; }
  .edit { padding-bottom: 12px; }
  .danger { color: var(--i3); }
</style>
