<script lang="ts">
  import type { Snippet } from 'svelte';
  import { haptic } from '../lib/ui.svelte';

  // Interruttore grande (tutta la riga è toccabile). Salvataggio a carico di onchange.
  let {
    checked = $bindable(false),
    label,
    hint,
    danger = false,
    onchange,
    children
  }: { checked: boolean; label?: string; hint?: string; danger?: boolean; onchange?: (v: boolean) => void; children?: Snippet } = $props();

  function toggle() {
    haptic();
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button type="button" class="toggle" class:danger role="switch" aria-checked={checked} onclick={toggle}>
  <span class="text">
    {#if children}{@render children()}{:else}{label}{/if}
    {#if hint}<span class="small muted hint">{hint}</span>{/if}
  </span>
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
</button>

<style>
  .toggle {
    display: flex; align-items: center; gap: 12px; width: 100%;
    min-height: 56px; padding: 10px 0; background: none; border: none; border-bottom: 1px solid var(--border);
    text-align: left; cursor: pointer;
  }
  .toggle:last-child { border-bottom: none; }
  .text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .hint { font-weight: 400; }
  .track { flex: none; width: 52px; height: 32px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); position: relative; transition: background 120ms; }
  .knob { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: var(--muted); transition: transform 120ms; }
  [aria-checked='true'] .track { background: var(--accent); border-color: var(--accent); }
  [aria-checked='true'] .knob { transform: translateX(20px); background: var(--on-accent); }
  .danger[aria-checked='true'] .track { background: var(--i3); border-color: var(--i3); }
  @media (prefers-reduced-motion: reduce) { .track, .knob { transition: none; } }
</style>
