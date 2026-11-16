<script lang="ts">
  import type { Opt } from '../lib/catalog';
  import { haptic } from '../lib/ui.svelte';

  // Chip toggle: multi (array) o singola scelta (string, ri-tap per deselezionare)
  let {
    options,
    value = $bindable(),
    multi = true,
    seg = false,
    onchange
  }: { options: Opt[]; value: string[] | string | undefined; multi?: boolean; seg?: boolean; onchange?: () => void } = $props();

  const selected = (id: string) => (multi ? (value as string[] | undefined)?.includes(id) : value === id);

  function toggle(id: string) {
    haptic();
    if (multi) {
      const arr = (value as string[] | undefined) ?? [];
      value = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    } else value = value === id ? undefined : id;
    onchange?.();
  }
</script>

<div class={seg ? 'seg' : 'chips'}>
  {#each options as o (o.id)}
    <button type="button" class="chip" aria-pressed={selected(o.id)} onclick={() => toggle(o.id)}>{o.label}</button>
  {/each}
</div>
