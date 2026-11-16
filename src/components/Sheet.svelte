<script lang="ts">
  import type { Snippet } from 'svelte';
  // Bottom sheet: chiudere in qualunque modo = salvare (il contenuto salva in automatico)
  let { open = $bindable(false), title, onclose, children }: { open: boolean; title: string; onclose?: () => void; children: Snippet } = $props();

  function close() {
    open = false;
    onclose?.();
  }
</script>

{#if open}
  <div class="backdrop" onclick={close} role="presentation"></div>
  <div class="sheet fade" role="dialog" aria-modal="true" aria-label={title}>
    <div class="head">
      <h2>{title}</h2>
      <button class="btn ghost" onclick={close} aria-label="Chiudi">✕</button>
    </div>
    <div class="body">{@render children()}</div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.55); z-index: 40; }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 41;
    max-height: 92dvh; overflow-y: auto;
    background: var(--surface); border-top: 1px solid var(--border);
    border-radius: var(--radius) var(--radius) 0 0;
    padding: 8px 16px calc(24px + env(safe-area-inset-bottom));
    max-width: 640px; margin: 0 auto;
  }
  .head { display: flex; align-items: center; justify-content: space-between; position: sticky; top: -8px; background: var(--surface); padding-top: 8px; z-index: 1; }
  .head h2 { margin: 8px 0; }
</style>
