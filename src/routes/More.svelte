<script lang="ts">
  import { questionnaireDue } from '../lib/clinic';
  import { data } from '../lib/db.svelte';
  import { APP_VERSION } from '../lib/version';
  import Icon from '../components/Icon.svelte';

  const qDue = $derived(questionnaireDue(data.questionnaires, 'midas') || questionnaireDue(data.questionnaires, 'hit6'));

  const items = $derived([
    { href: '#/meds', icon: 'pill', label: 'I miei farmaci', badge: '' },
    { href: '#/prophylaxis', icon: 'repeat', label: 'Profilassi', badge: '' },
    { href: '#/questionnaires', icon: 'clipboard', label: 'Questionari MIDAS / HIT-6', badge: qDue ? 'da fare' : '' },
    { href: '#/report', icon: 'doc', label: 'Report per il neurologo', badge: '' },
    { href: '#/redflags', icon: 'alert', label: "Segnali d'allarme", badge: '' },
    { href: '#/backup', icon: 'save', label: 'Backup ed esportazione', badge: '' },
    { href: '#/settings', icon: 'gear', label: 'Impostazioni', badge: '' },
    { href: '#/info', icon: 'info', label: 'Info e privacy', badge: '' }
  ]);
</script>

<div class="page fade">
  <h1>Altro</h1>

  <nav class="card list" aria-label="Altre sezioni">
    {#each items as it (it.href)}
      <a class="list-item" href={it.href}>
        <span class="ico"><Icon name={it.icon} /></span>
        <span class="grow">{it.label}</span>
        {#if it.badge}<span class="badge small">{it.badge}</span>{/if}
        <span class="muted"><Icon name="chevron" size={20} /></span>
      </a>
    {/each}
  </nav>

  <p class="small muted center">Blank Out · versione {APP_VERSION}</p>
  <p class="small muted center">I tuoi dati restano solo su questo dispositivo.</p>
</div>

<style>
  .list { padding-top: 4px; padding-bottom: 4px; }
  .ico { color: var(--accent); display: inline-flex; }
  .badge { background: var(--accent); color: var(--on-accent); border-radius: 999px; padding: 2px 10px; font-weight: 600; }
  .center { text-align: center; margin-bottom: 4px; }
</style>
