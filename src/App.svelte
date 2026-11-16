<script lang="ts">
  import { onMount } from 'svelte';
  import { route } from './lib/router.svelte';
  import { applySettings, settings } from './lib/settings.svelte';
  import { data, loadAll } from './lib/db.svelte';
  import { startReminders } from './lib/reminders';
  import { startAutoBackup } from './lib/drive.svelte';
  import Icon from './components/Icon.svelte';
  import Toasts from './components/Toasts.svelte';
  import Lock from './components/Lock.svelte';
  import { lock } from './lib/lock.svelte';
  import Home from './routes/Home.svelte';
  import Episode from './routes/Episode.svelte';
  import Calendar from './routes/Calendar.svelte';
  import Stats from './routes/Stats.svelte';
  import More from './routes/More.svelte';
  import Meds from './routes/Meds.svelte';
  import Prophylaxis from './routes/Prophylaxis.svelte';
  import Questionnaires from './routes/Questionnaires.svelte';
  import Report from './routes/Report.svelte';
  import Backup from './routes/Backup.svelte';
  import Settings from './routes/Settings.svelte';
  import RedFlags from './routes/RedFlags.svelte';
  import Info from './routes/Info.svelte';
  import Onboarding from './routes/Onboarding.svelte';

  applySettings();
  onMount(() => {
    loadAll().then(() => {
      startReminders();
      startAutoBackup();
    });
  });

  const tabs = [
    { path: '/', label: 'Oggi', icon: 'home' },
    { path: '/calendar', label: 'Calendario', icon: 'calendar' },
    { path: '/stats', label: 'Statistiche', icon: 'chart' },
    { path: '/more', label: 'Altro', icon: 'more' }
  ];
  const routes: Record<string, any> = {
    '/': Home,
    '/log': Home,
    '/episode': Episode,
    '/calendar': Calendar,
    '/stats': Stats,
    '/more': More,
    '/meds': Meds,
    '/prophylaxis': Prophylaxis,
    '/questionnaires': Questionnaires,
    '/report': Report,
    '/backup': Backup,
    '/settings': Settings,
    '/redflags': RedFlags,
    '/info': Info
  };
  const Page = $derived(routes[route.path] ?? Home);
  // Le pagine leggono route.params all'avvio: se cambia solo la query vanno ricreate
  const pageKey = $derived(route.path + '?' + route.params.toString());
  const activeTab = $derived(
    tabs.find((t) => t.path === route.path)?.path ??
      (['/episode', '/log'].includes(route.path) ? '/' : '/more')
  );
</script>

{#if !lock.unlocked}
  <Lock />
{:else if !data.ready}
  <div class="page muted">Caricamento…</div>
{:else if !settings.onboarded}
  <Onboarding />
{:else}
  <main>
    {#key pageKey}
      <Page />
    {/key}
  </main>
  {#if route.path !== '/report'}
    <nav class="tabbar no-print" aria-label="Navigazione principale">
      {#each tabs as t (t.path)}
        <a href={'#' + t.path} class="tab" aria-current={activeTab === t.path ? 'page' : undefined}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </a>
      {/each}
    </nav>
  {/if}
{/if}
<Toasts />

<style>
  .tabbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    display: grid; grid-template-columns: repeat(4, 1fr);
    background: var(--surface); border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .tab { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 0 8px; min-height: 64px; color: var(--muted); text-decoration: none; font-size: 0.75rem; }
  .tab[aria-current='page'] { color: var(--accent); font-weight: 600; }
</style>
