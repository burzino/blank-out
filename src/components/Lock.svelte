<script lang="ts">
  import { tryUnlock } from '../lib/lock.svelte';
  import { haptic } from '../lib/ui.svelte';

  let pw = $state('');
  let error = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = !(await tryUnlock(pw));
    if (error) haptic(40);
  }
</script>

<form class="page lock fade" onsubmit={submit}>
  <img src="favicon.svg" alt="" width="88" height="88" />
  <h1>Blank Out</h1>
  <p class="muted">Inserisci la password per entrare.</p>
  <input type="password" bind:value={pw} autocomplete="current-password" aria-label="Password" aria-invalid={error} />
  {#if error}<p class="small err" role="alert">Password non corretta.</p>{/if}
  <button class="btn primary big block" disabled={!pw}>Entra</button>
</form>

<style>
  .lock { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 100dvh; text-align: center; max-width: 360px; }
  img { border-radius: 22px; margin-bottom: 8px; }
  h1 { margin: 0; }
  .err { color: var(--i3); margin: 0; }
</style>
