<script lang="ts">
  import { back } from '../lib/router.svelte';
  import Icon from './Icon.svelte';
  let { title, fallback = '/more' }: { title: string; fallback?: string } = $props();
</script>

<header class="row no-print">
  <button class="btn ghost" onclick={() => back(fallback)} aria-label="Indietro"><Icon name="back" /></button>
  <h1>{title}</h1>
</header>

<style>
  header { margin: -4px 0 12px -12px; }
  h1 { margin: 0; font-size: 1.4rem; }
  .btn { border: none; padding: 8px 12px; }
</style>
