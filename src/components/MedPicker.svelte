<script lang="ts">
  import { KNOWN_ACUTE, MED_CLASSES, type MedClass } from '../lib/catalog';
  import { knownMedClass, rankedMeds } from '../lib/episodes.svelte';

  // Un tap su un farmaco personale = registrato. "Altro…" per sceglierne uno nuovo.
  let { onpick, limit = 4 }: { onpick: (m: { name: string; cls: MedClass; dose?: string }) => void; limit?: number } = $props();

  const mine = $derived(rankedMeds());
  let showAll = $state(false);
  let other = $state(false);
  let name = $state('');
  let cls = $state<MedClass>('fans');
  let dose = $state('');

  function onName() {
    const k = KNOWN_ACUTE.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (k) {
      cls = k.cls;
      if (!dose) dose = k.dose;
    }
  }
  function addOther() {
    if (!name.trim()) return;
    onpick({ name: name.trim(), cls: knownMedClass(name) ?? cls, dose: dose.trim() || undefined });
    name = '';
    dose = '';
    other = false;
  }
</script>

<div class="chips">
  {#each showAll ? mine : mine.slice(0, limit) as m (m.id)}
    <button type="button" class="chip" onclick={() => onpick(m)}>{m.name}{m.dose ? ` · ${m.dose}` : ''}</button>
  {/each}
  {#if mine.length > limit && !showAll}
    <button type="button" class="chip" onclick={() => (showAll = true)}>Tutti ({mine.length})</button>
  {/if}
  <button type="button" class="chip" aria-pressed={other} onclick={() => (other = !other)}>+ Altro…</button>
</div>

{#if other}
  <div class="card fade" style="margin-top:12px">
    <div class="field">
      <label for="mp-name">Farmaco</label>
      <input id="mp-name" type="text" list="mp-known" bind:value={name} oninput={onName} placeholder="es. Ibuprofene" autocomplete="off" />
      <datalist id="mp-known">
        {#each KNOWN_ACUTE as k (k.name)}<option value={k.name}></option>{/each}
      </datalist>
    </div>
    <div class="row">
      <div class="field grow">
        <label for="mp-cls">Tipo</label>
        <select id="mp-cls" bind:value={cls}>
          {#each MED_CLASSES as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
        </select>
      </div>
      <div class="field" style="width:40%">
        <label for="mp-dose">Dose</label>
        <input id="mp-dose" type="text" bind:value={dose} placeholder="400 mg" />
      </div>
    </div>
    <button class="btn primary block" onclick={addOther} disabled={!name.trim()}>Registra</button>
  </div>
{/if}
