<script lang="ts">
  import { onDestroy } from 'svelte';
  import { RED_FLAGS_SOON, RED_FLAGS_URGENT, SOON_MSG, URGENT_MSG } from '../lib/catalog';
  import { activeEpisode, getEpisode, saveEpisode } from '../lib/db.svelte';
  import { route } from '../lib/router.svelte';
  import { haptic } from '../lib/ui.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import Toggle from '../components/Toggle.svelte';

  // Episodio a cui collegare le risposte (finiscono nel report)
  const paramId = route.params.get('id');
  const targetId = (paramId && getEpisode(paramId) ? paramId : activeEpisode()?.id) ?? null;
  const known = new Set([...RED_FLAGS_URGENT, ...RED_FLAGS_SOON].map((o) => o.id));
  const initial = targetId ? (getEpisode(targetId)?.redFlags ?? []).filter((x) => known.has(x)) : [];

  let checked = $state<Record<string, boolean>>(Object.fromEntries(initial.map((id) => [id, true])));
  const anyUrgent = $derived(RED_FLAGS_URGENT.some((o) => checked[o.id]));
  const anySoon = $derived(RED_FLAGS_SOON.some((o) => checked[o.id]));

  // Banner a schermo intero: non chiudibile per 5 secondi
  let overlay = $state(false);
  let countdown = $state(0);
  let interval: ReturnType<typeof setInterval> | undefined;

  function showOverlay() {
    overlay = true;
    countdown = 5;
    haptic(200);
    clearInterval(interval);
    interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) clearInterval(interval);
    }, 1000);
  }
  onDestroy(() => clearInterval(interval));

  async function onToggle(id: string, urgent: boolean, value: boolean) {
    checked[id] = value;
    if (urgent && value) showOverlay();
    if (!targetId) return;
    const ep = getEpisode(targetId);
    if (!ep) return;
    const copy = $state.snapshot(ep);
    const others = copy.redFlags.filter((x) => !known.has(x));
    copy.redFlags = [...others, ...Object.keys(checked).filter((k) => checked[k])];
    await saveEpisode(copy);
  }
</script>

<div class="page fade">
  <PageHeader title="Segnali d'allarme" fallback="/" />
  <p>Rispondi con calma. Se anche uno solo dei segnali qui sotto è presente, serve un medico.</p>
  {#if targetId}
    <p class="small muted">Le risposte vengono salvate nell'episodio e compariranno nel report.</p>
  {/if}

  {#if anyUrgent && !overlay}
    <div class="alert danger fade">
      <strong>{URGENT_MSG}</strong>
      <a class="btn block call" href="tel:112"><Icon name="phone" /> Chiama 112</a>
    </div>
  {/if}

  {#if anySoon && !anyUrgent}
    <div class="alert fade">
      <strong>Contatta il medico</strong>
      <span>{SOON_MSG}</span>
    </div>
  {/if}

  <section class="card">
    <h3 style="margin-top:0">Ora, all'improvviso</h3>
    {#each RED_FLAGS_URGENT as o (o.id)}
      <Toggle checked={!!checked[o.id]} label={o.label} danger onchange={(v) => onToggle(o.id, true, v)} />
    {/each}
  </section>

  <section class="card">
    <h3 style="margin-top:0">Caratteristiche diverse dal solito</h3>
    {#each RED_FLAGS_SOON as o (o.id)}
      <Toggle checked={!!checked[o.id]} label={o.label} danger onchange={(v) => onToggle(o.id, false, v)} />
    {/each}
  </section>

  {#if !anyUrgent && !anySoon}
    <p class="small muted">Nessun segnale d'allarme indicato. Se il dolore cambia o peggiora, ricontrolla questa pagina o senti il tuo medico.</p>
  {/if}
</div>

{#if overlay}
  <div class="overlay fade" role="alertdialog" aria-modal="true" aria-labelledby="urgent-title">
    <div class="inner">
      <Icon name="alert" size={56} />
      <p id="urgent-title" class="msg">{URGENT_MSG}</p>
      <a class="btn block call huge" href="tel:112"><Icon name="phone" size={28} /> Chiama 112</a>
      <button class="btn block ghost understood" disabled={countdown > 0} onclick={() => (overlay = false)}>
        {countdown > 0 ? `Ho capito (${countdown})` : 'Ho capito'}
      </button>
    </div>
  </div>
{/if}

<style>
  .call { background: var(--i3); color: var(--on-i); border-color: var(--i3); margin-top: 12px; font-size: 1.15rem; }
  .overlay {
    position: fixed; inset: 0; z-index: 100;
    background: var(--danger-bg); color: var(--text);
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
    overflow-y: auto;
  }
  .inner { max-width: 520px; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center; color: var(--i3); }
  .msg { font-size: 1.35rem; font-weight: 700; color: var(--text); margin: 0; }
  .huge { min-height: 88px; font-size: 1.5rem; }
  .understood { color: var(--text); border-color: var(--danger-border); }
</style>
