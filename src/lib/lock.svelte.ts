// Blocco d'accesso semplice lato client (dissuasivo, non è crittografia dei dati).
// Stessa chiave e stesso hash del sito burzino.github.io: chi sblocca lì non deve ripetere.
const KEY = 'blankout.unlocked';
const HASH = 'f7f2a3dc8d8c2a198b50c49aa4f1133e32a1c42f5b1e497a848428f68b9a09ba'; // SHA-256 della password (trim, minuscole)

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function read() {
  try {
    return localStorage.getItem(KEY) === HASH;
  } catch {
    return false;
  }
}

export const lock = $state({ unlocked: read() });

export async function tryUnlock(pw: string) {
  const ok = (await sha256(pw.trim().toLowerCase())) === HASH;
  if (ok) {
    lock.unlocked = true;
    try {
      localStorage.setItem(KEY, HASH);
    } catch {}
  }
  return ok;
}
