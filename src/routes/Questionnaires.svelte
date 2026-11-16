<script lang="ts">
  import { addDays, computeStats, dayKey, hit6Impact, midasGrade, questionnaireDue } from '../lib/clinic';
  import { data, deleteQuestionnaire, saveQuestionnaire, uid } from '../lib/db.svelte';
  import type { Questionnaire } from '../lib/types';
  import { haptic, toast } from '../lib/ui.svelte';
  import PageHeader from '../components/PageHeader.svelte';

  type QType = 'midas' | 'hit6';

  const MIDAS_Q = [
    'In quanti giorni, negli ultimi 3 mesi, non è andato/a al lavoro o a scuola a causa del mal di testa?',
    'In quanti giorni la sua produttività al lavoro o a scuola si è ridotta della metà o più a causa del mal di testa? (Non conti i giorni già indicati alla domanda 1.)',
    'In quanti giorni non ha svolto i lavori domestici a causa del mal di testa?',
    'In quanti giorni la sua produttività nei lavori domestici si è ridotta della metà o più a causa del mal di testa? (Non conti i giorni già indicati alla domanda 3.)',
    'In quanti giorni ha rinunciato ad attività familiari, sociali o di svago a causa del mal di testa?',
    'In quanti giorni ha avuto mal di testa negli ultimi 3 mesi?',
    'Su una scala da 0 a 10, quanto è stato forte in media il dolore?'
  ];
  const MIDAS_LABEL = ['1', '2', '3', '4', '5', 'A', 'B'];
  const HIT6_Q = [
    'Quando ha mal di testa, con che frequenza il dolore è forte?',
    'Con che frequenza il mal di testa limita la sua capacità di svolgere le normali attività quotidiane, incluse le faccende domestiche, il lavoro, lo studio o le attività sociali?',
    'Quando ha mal di testa, con che frequenza vorrebbe potersi sdraiare?',
    'Nelle ultime 4 settimane, con che frequenza si è sentito/a troppo stanco/a per lavorare o svolgere le attività quotidiane a causa del mal di testa?',
    'Nelle ultime 4 settimane, con che frequenza si è sentito/a stufo/a o irritato/a a causa del mal di testa?',
    'Nelle ultime 4 settimane, con che frequenza il mal di testa ha limitato la sua capacità di concentrarsi sul lavoro o sulle attività quotidiane?'
  ];
  const HIT6_OPTS = [
    { label: 'Mai', value: 6 },
    { label: 'Raramente', value: 8 },
    { label: 'Qualche volta', value: 10 },
    { label: 'Molto spesso', value: 11 },
    { label: 'Sempre', value: 13 }
  ];
  const QUICK_DAYS = [0, 1, 2, 5, 10];

  const midasDue = $derived(questionnaireDue(data.questionnaires, 'midas'));
  const hit6Due = $derived(questionnaireDue(data.questionnaires, 'hit6'));

  // ---- Compilazione ----
  let mode = $state<QType | null>(null);
  let step = $state(0);
  let answers = $state<(number | null)[]>([]);
  let result = $state<Questionnaire | null>(null);
  let numInput = $state<number | null>(null);
  let diaryA = $state(0);

  const total = $derived(mode === 'midas' ? MIDAS_Q.length : HIT6_Q.length);
  const question = $derived(mode === 'midas' ? MIDAS_Q[step] : mode === 'hit6' ? HIT6_Q[step] : '');

  function start(t: QType) {
    mode = t;
    step = 0;
    result = null;
    if (t === 'midas') {
      const today = dayKey(new Date());
      const a = computeStats(data.episodes, addDays(today, -89), today).headacheDays;
      diaryA = a;
      answers = [null, null, null, null, null, a, null];
    } else answers = Array(HIT6_Q.length).fill(null);
    numInput = answers[0];
    window.scrollTo(0, 0);
  }

  function goTo(i: number) {
    step = i;
    numInput = answers[i] ?? null;
  }

  function answer(v: number) {
    haptic();
    answers[step] = v;
    if (step < total - 1) goTo(step + 1);
    else finish();
  }

  function nextFromInput() {
    const v = Math.max(0, Math.min(90, Math.round(Number(numInput) || 0)));
    answer(v);
  }

  function prev() {
    if (step > 0) goTo(step - 1);
    else mode = null;
  }

  async function finish() {
    if (!mode) return;
    const ans = answers.map((x) => x ?? 0);
    let q: Questionnaire;
    if (mode === 'midas') {
      const score = ans.slice(0, 5).reduce((s, x) => s + x, 0);
      q = { id: uid(), type: 'midas', date: dayKey(new Date()), answers: ans.slice(0, 5), score, a: ans[5], b: ans[6] };
    } else {
      const score = ans.reduce((s, x) => s + x, 0);
      q = { id: uid(), type: 'hit6', date: dayKey(new Date()), answers: ans, score };
    }
    await saveQuestionnaire(q);
    haptic(20);
    result = q;
    mode = null;
  }

  // ---- Storico ----
  const describe = (q: Questionnaire) => (q.type === 'midas' ? `Grado ${midasGrade(q.score).grade} · ${midasGrade(q.score).label}` : hit6Impact(q.score));
  const fmtDate = (k: string) => new Date(k + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

  const history = $derived(
    data.questionnaires.map((q, i) => {
      const prevQ = data.questionnaires.slice(i + 1).find((x) => x.type === q.type);
      const diff = prevQ ? q.score - prevQ.score : null;
      return { q, diff, significant: q.type === 'hit6' && diff !== null && Math.abs(diff) >= 6 };
    })
  );

  async function remove(q: Questionnaire) {
    const before = $state.snapshot(q);
    await deleteQuestionnaire(q.id);
    haptic();
    toast('Questionario eliminato', { label: 'Annulla', run: () => saveQuestionnaire(before) });
    if (result?.id === q.id) result = null;
  }
</script>

<div class="page fade">
  {#if mode}
    <!-- Una domanda per schermata -->
    <div class="runner">
      <div class="row top">
        <button class="btn ghost" onclick={prev}>‹ Indietro</button>
        <span class="grow"></span>
        <span class="small muted num">{mode === 'midas' ? 'MIDAS' : 'HIT-6'} · {step + 1}/{total}</span>
      </div>
      <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step + 1}>
        <span style="width:{((step + 1) / total) * 100}%"></span>
      </div>

      {#key `${mode}-${step}`}
        <div class="fade">
          {#if mode === 'midas'}
            <p class="small muted qn">Domanda {MIDAS_LABEL[step]}{step === 0 ? ' · pensi agli ultimi 3 mesi' : ''}</p>
          {/if}
          <p class="question">{question}</p>

          {#if mode === 'hit6'}
            <div class="stack">
              {#each HIT6_OPTS as o (o.value)}
                <button class="btn big block" aria-pressed={answers[step] === o.value} class:primary={answers[step] === o.value} onclick={() => answer(o.value)}>{o.label}</button>
              {/each}
            </div>
          {:else if step === 6}
            <div class="grid11" role="group" aria-label="Intensità media da 0 a 10">
              {#each Array(11) as _, i (i)}
                <button class="chip n" class:i1={i > 0 && i <= 3} class:i2={i >= 4 && i <= 6} class:i3={i >= 7} aria-pressed={answers[6] === i} onclick={() => answer(i)}>{i}</button>
              {/each}
            </div>
          {:else}
            {#if step === 5}<p class="small muted">Dal diario risultano {diaryA} giorni. Puoi correggerlo.</p>{/if}
            <div class="row numrow">
              <input
                class="bignum num"
                type="number"
                inputmode="numeric"
                min="0"
                max="90"
                aria-label="Numero di giorni"
                bind:value={numInput}
                onkeydown={(e) => e.key === 'Enter' && nextFromInput()}
              />
              <span class="muted">giorni</span>
            </div>
            <div class="chips quick">
              {#each QUICK_DAYS as d (d)}
                <button class="chip" aria-pressed={answers[step] === d} onclick={() => answer(d)}>{d}</button>
              {/each}
            </div>
            <button class="btn primary big block" onclick={nextFromInput} disabled={numInput == null}>Avanti</button>
          {/if}
        </div>
      {/key}
    </div>
  {:else}
    <PageHeader title="Questionari" />
    <p class="muted small">Misurano quanto il mal di testa pesa sulla tua vita. Al neurologo servono per valutare le terapie.</p>

    {#if result}
      <section class="card result fade">
        <p class="small muted">{result.type === 'midas' ? 'MIDAS' : 'HIT-6'} · salvato</p>
        <p class="score num">{result.score}</p>
        <p><strong>{describe(result)}</strong></p>
        <button class="btn block" onclick={() => (result = null)}>Fatto</button>
      </section>
    {/if}

    <div class="stack">
      <button class="btn block big start" onclick={() => start('midas')}>
        <span class="grow left">MIDAS<span class="small muted d">Ultimi 3 mesi · ogni 3 mesi · 7 domande</span></span>
        {#if midasDue}<span class="badge small">da fare</span>{/if}
      </button>
      <button class="btn block big start" onclick={() => start('hit6')}>
        <span class="grow left">HIT-6<span class="small muted d">Ultime 4 settimane · ogni 4 settimane · 6 domande</span></span>
        {#if hit6Due}<span class="badge small">da fare</span>{/if}
      </button>
    </div>

    <h2>Storico</h2>
    {#if !history.length}
      <p class="muted">Ancora nessun questionario compilato.</p>
    {:else}
      <section class="card list">
        {#each history as h (h.q.id)}
          <div class="list-item">
            <span class="grow">
              <strong>{h.q.type === 'midas' ? 'MIDAS' : 'HIT-6'} · <span class="num">{h.q.score}</span></strong>
              <span class="small sub">{describe(h.q)}</span>
              <span class="small muted sub">
                {fmtDate(h.q.date)}{#if h.diff !== null} · {h.diff > 0 ? '+' : ''}{h.diff} rispetto al precedente{/if}{#if h.significant} · <strong>clinicamente significativa</strong>{/if}
              </span>
              {#if h.q.type === 'midas' && (h.q.a != null || h.q.b != null)}
                <span class="small muted sub">A: {h.q.a ?? '–'} giorni di mal di testa · B: intensità media {h.q.b ?? '–'}/10</span>
              {/if}
            </span>
            <button class="btn ghost" aria-label="Elimina questionario del {fmtDate(h.q.date)}" onclick={() => remove(h.q)}>✕</button>
          </div>
        {/each}
      </section>
    {/if}
    <p class="small muted">MIDAS: da 0 a 5 disabilità minima, 6–10 lieve, 11–20 moderata, oltre 20 grave. HIT-6: da 36 a 78; una variazione di almeno 6 punti è clinicamente significativa.</p>
  {/if}
</div>

<style>
  .top { margin: -4px 0 8px -12px; }
  .top .btn { border: none; }
  .progress { height: 6px; background: var(--surface-2); border-radius: 999px; overflow: hidden; margin-bottom: 24px; }
  .progress span { display: block; height: 100%; background: var(--accent); transition: width 150ms; }
  .qn { margin-bottom: 4px; }
  .question { font-size: 1.2rem; font-weight: 600; margin-bottom: 20px; }
  .numrow { margin-bottom: 12px; }
  .bignum { font-size: 2rem; min-height: 72px; text-align: center; max-width: 160px; font-weight: 700; }
  .quick { margin-bottom: 20px; }
  .quick .chip { min-width: 56px; justify-content: center; }
  .quick .chip[aria-pressed='true']::before { content: ''; }
  .grid11 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .n { min-height: 56px; padding: 0; text-align: center; border-radius: var(--radius-sm); font-size: 1.2rem; font-weight: 600; border: 2px solid transparent; }
  .n[aria-pressed='true'] { outline: 3px solid var(--text); }
  .n[aria-pressed='true']::before { content: ''; }
  .start { justify-content: flex-start; text-align: left; }
  .left { display: flex; flex-direction: column; }
  .d { font-weight: 400; }
  .badge { background: var(--accent); color: var(--on-accent); border-radius: 999px; padding: 2px 10px; font-weight: 600; }
  .result { text-align: center; }
  .score { font-size: 3rem; font-weight: 700; margin: 0; line-height: 1.1; }
  .list { padding-top: 4px; padding-bottom: 4px; }
  .sub { display: block; margin-top: 2px; }
  @media (prefers-reduced-motion: reduce) { .progress span { transition: none; } }
</style>
