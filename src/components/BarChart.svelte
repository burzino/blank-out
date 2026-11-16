<script module lang="ts">
  // Barre raggruppate per mese (stessa scala: giorni) con marcatori verticali per eventi (es. profilassi).
  export interface BarGroup {
    label: string;
    values: number[];
    note?: string; // es. "mese in corso"
  }
  export interface BarSeries {
    label: string;
    color: string; // variabile CSS
  }
  export interface BarMarker {
    pos: number; // 0…n gruppi (frazionario)
    label: string;
    kind: 'start' | 'end';
  }
</script>

<script lang="ts">
  let { groups, series, markers = [], unit = 'giorni' }: { groups: BarGroup[]; series: BarSeries[]; markers?: BarMarker[]; unit?: string } = $props();

  const W = 320;
  const H = 150;
  const top = 16;
  const bottom = 22;
  const left = 4;
  const plotH = H - top - bottom;
  const plotW = W - left * 2;

  const max = $derived(Math.max(4, ...groups.flatMap((g) => g.values)));
  const step = $derived(plotW / Math.max(1, groups.length));
  const barW = $derived(Math.max(3, Math.min(18, (step - 6) / series.length - 2)));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const showValues = $derived(groups.length <= 6);
  const gridLines = $derived([0.5, 1].map((f) => Math.round(max * f)));

  // Barra con estremità superiore arrotondata (4px) e base piatta sull'asse
  function barPath(x: number, v: number, w: number) {
    const h = Math.max(0, (v / max) * plotH);
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    const yb = top + plotH;
    const yt = yb - h;
    return `M${x},${yb}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + w - r}Q${x + w},${yt} ${x + w},${yt + r}V${yb}Z`;
  }
</script>

<figure>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={groups.map((g) => `${g.label}: ${series.map((s, i) => `${s.label} ${g.values[i]}`).join(', ')}`).join('; ')}>
    {#each gridLines as g (g)}
      <line x1={left} x2={W - left} y1={y(g)} y2={y(g)} class="grid" />
      <text x={W - left} y={y(g) - 3} class="axis" text-anchor="end">{g}</text>
    {/each}
    <line x1={left} x2={W - left} y1={top + plotH} y2={top + plotH} class="base" />

    {#each groups as g, gi (gi)}
      {@const gx = left + gi * step + (step - series.length * (barW + 2)) / 2}
      {#each series as s, si (si)}
        {@const x = gx + si * (barW + 2)}
        <g>
          <title>{g.label}{g.note ? ` (${g.note})` : ''} · {s.label}: {g.values[si]} {unit}</title>
          <rect x={left + gi * step} y={top} width={step} height={plotH} fill="transparent" />
          <path d={barPath(x, g.values[si], barW)} style="fill: {s.color}" />
          {#if showValues}
            <text x={x + barW / 2} y={y(g.values[si]) - 3} text-anchor="middle" class="val">{g.values[si]}</text>
          {/if}
        </g>
      {/each}
      <text x={left + gi * step + step / 2} y={H - 6} text-anchor="middle" class="axis">{g.label}{g.note ? '*' : ''}</text>
    {/each}

    {#each markers as m, mi (mi)}
      {@const mx = left + m.pos * step}
      <g>
        <title>{m.label}</title>
        <line x1={mx} x2={mx} y1={top - 6} y2={top + plotH} class="marker" class:end={m.kind === 'end'} />
        <text x={mx} y={top - 8} text-anchor="middle" class="mk">{m.kind === 'start' ? '▼' : '■'}</text>
      </g>
    {/each}
  </svg>
  <figcaption class="legend small">
    {#each series as s (s.label)}
      <span class="row"><i class="sw" style="background: {s.color}"></i>{s.label}</span>
    {/each}
  </figcaption>
</figure>

<style>
  figure { margin: 0; }
  svg { width: 100%; height: auto; display: block; overflow: visible; }
  .grid { stroke: var(--border); stroke-width: 1; stroke-dasharray: 2 3; }
  .base { stroke: var(--muted); stroke-width: 1; }
  .axis { fill: var(--muted); font-size: 9px; }
  .val { fill: var(--text); font-size: 9px; font-variant-numeric: tabular-nums; }
  .marker { stroke: var(--text); stroke-width: 1.5; stroke-dasharray: 3 2; }
  .marker.end { stroke: var(--muted); }
  .mk { fill: var(--text); font-size: 7px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; color: var(--muted); }
  .sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
</style>
