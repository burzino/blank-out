// Router minimale basato su hash: funziona offline e su qualsiasi sottocartella.
function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}

export const route = $state(parse());

window.addEventListener('hashchange', () => {
  const r = parse();
  route.path = r.path;
  route.params = r.params;
  window.scrollTo(0, 0);
});

export function go(path: string) {
  location.hash = path;
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else go(fallback);
}
