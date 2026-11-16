<script lang="ts">
  import { dismiss, toasts } from '../lib/ui.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast fade">
      <span class="grow">{t.text}</span>
      {#if t.action}
        <button class="btn link" onclick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts { position: fixed; left: 16px; right: 16px; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 60; display: flex; flex-direction: column; gap: 8px; max-width: 608px; margin: 0 auto; pointer-events: none; }
  .toast { pointer-events: auto; display: flex; align-items: center; gap: 8px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 8px 8px 16px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.35); }
</style>
