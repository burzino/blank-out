<script lang="ts">
  // Selettore rapido dell'orario: Adesso / −30 min / −1 h / −2 h / Altro…
  // unset: nessuna chip preselezionata (es. fine episodio non ancora scelta)
  let { value = $bindable(), label = 'Quando?', min, unset = false, onchange }: { value: string; label?: string; min?: string; unset?: boolean; onchange?: () => void } = $props();

  const presets = [
    { id: 0, label: 'Adesso' },
    { id: 30, label: '−30 min' },
    { id: 60, label: '−1 h' },
    { id: 120, label: '−2 h' }
  ];
  let picked = $state<number | 'custom' | null>(unset ? null : 0);
  let custom = $state(false);

  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  function pick(mins: number) {
    picked = mins;
    custom = false;
    value = new Date(Date.now() - mins * 60000).toISOString();
    onchange?.();
  }
  function onCustom(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (!v) return;
    value = new Date(v).toISOString();
    onchange?.();
  }
</script>

<div class="field">
  <span class="label">{label}</span>
  <div class="chips">
    {#each presets as p (p.id)}
      <button type="button" class="chip" aria-pressed={picked === p.id && !custom} onclick={() => pick(p.id)}>{p.label}</button>
    {/each}
    <button type="button" class="chip" aria-pressed={custom} onclick={() => { custom = true; picked = 'custom'; }}>Altro…</button>
  </div>
  {#if custom}
    <input type="datetime-local" value={toLocalInput(value)} min={min ? toLocalInput(min) : undefined} max={toLocalInput(new Date().toISOString())} onchange={onCustom} />
  {/if}
</div>
