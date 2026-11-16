// Meteo storico e previsioni da Open-Meteo (gratuito, senza chiave).
// Privacy: si inviano solo coordinate arrotondate (~1 km) e date. Nessun dato sanitario lascia il dispositivo.
import { addDays, dayKey, daysBetween, rangeKeys } from '../clinic';
import type { WeatherDay } from './types';

const KEY = 'blankout.weather';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const DAILY = 'pressure_msl_mean,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean';
const ARCHIVE_LAG = 5; // giorni: l'archivio è completo fino a circa 5 giorni fa
const REFRESH_LAST = 3; // gli ultimi giorni (e le previsioni) si riscaricano sempre

interface Raw {
  p: number;
  tmax: number;
  tmin: number;
  h: number;
}
interface Cache {
  lat: number;
  lon: number;
  days: Record<string, Raw>;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function readCache(): Cache | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const c = JSON.parse(s) as Cache;
    return c && typeof c === 'object' && c.days ? c : null;
  } catch {
    return null;
  }
}

function writeCache(c: Cache) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* quota piena o storage non disponibile: pazienza, si riscarica la prossima volta */
  }
}

function toWeatherDays(days: Record<string, Raw>, from?: string, to?: string): WeatherDay[] {
  return Object.keys(days)
    .sort()
    .filter((k) => (!from || k >= from) && (!to || k <= to))
    .map((k) => {
      const r = days[k];
      const prev = days[addDays(k, -1)];
      return {
        date: k,
        pressureMean: r.p,
        pressureChange: prev ? round2(r.p - prev.p) : 0,
        tempMax: r.tmax,
        tempMin: r.tmin,
        humidity: r.h
      };
    });
}

/** Meteo già scaricato (nessuna rete). */
export function loadCachedWeather(): WeatherDay[] {
  const c = readCache();
  return c ? toWeatherDays(c.days) : [];
}

type Series = Record<string, (number | null)[] | string[] | undefined>;
interface OMResponse {
  daily?: Series & { time: string[] };
  hourly?: Series & { time: string[] };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

async function getJson(url: string): Promise<OMResponse> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo: errore ${r.status}`);
  return (await r.json()) as OMResponse;
}

/** Scarica e normalizza; se manca la pressione media giornaliera la ricava dai valori orari. */
async function download(base: string, params: Record<string, string | number>): Promise<Record<string, Raw>> {
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), daily: DAILY, timezone: 'auto' });
  const data = await getJson(`${base}?${q}`);
  const d = data.daily;
  if (!d?.time) return {};
  const num = (name: string, i: number) => {
    const v = (d[name] as (number | null)[] | undefined)?.[i];
    return typeof v === 'number' ? v : null;
  };

  let hourlyP: Record<string, number> | null = null;
  if (d.time.some((_, i) => num('pressure_msl_mean', i) === null)) {
    const qh = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), hourly: 'pressure_msl', timezone: 'auto' });
    try {
      const h = (await getJson(`${base}?${qh}`)).hourly;
      if (h?.time) {
        const by = new Map<string, number[]>();
        h.time.forEach((t, i) => {
          const v = (h.pressure_msl as (number | null)[] | undefined)?.[i];
          if (typeof v !== 'number') return;
          const k = t.slice(0, 10);
          if (!by.has(k)) by.set(k, []);
          by.get(k)!.push(v);
        });
        hourlyP = Object.fromEntries([...by].filter(([, v]) => v.length >= 12).map(([k, v]) => [k, round2(mean(v))]));
      }
    } catch {
      hourlyP = null;
    }
  }

  const out: Record<string, Raw> = {};
  d.time.forEach((k, i) => {
    const p = num('pressure_msl_mean', i) ?? hourlyP?.[k] ?? null;
    const tmax = num('temperature_2m_max', i);
    const tmin = num('temperature_2m_min', i);
    const h = num('relative_humidity_2m_mean', i);
    if (p === null || tmax === null || tmin === null) return; // giorno non ancora disponibile
    out[k] = { p, tmax, tmin, h: h ?? NaN };
  });
  return out;
}

/**
 * Meteo giornaliero tra `from` e `to` (YYYY-MM-DD). Il futuro è limitato a dopodomani.
 * Usa la cache e scarica solo i giorni mancanti più gli ultimi giorni/previsioni.
 */
export async function fetchWeather(lat: number, lon: number, from: string, to: string): Promise<WeatherDay[]> {
  const la = round2(lat);
  const lo = round2(lon);
  const today = dayKey(new Date());
  const end = to > addDays(today, 2) ? addDays(today, 2) : to;
  let cache = readCache();
  // Spostamento di più di ~10 km: il vecchio meteo non vale più
  if (!cache || Math.abs(cache.lat - la) > 0.1 || Math.abs(cache.lon - lo) > 0.1) cache = { lat: la, lon: lo, days: {} };
  if (from > end) return toWeatherDays(cache.days, from, to);

  const refreshFrom = addDays(today, -REFRESH_LAST);
  const need = rangeKeys(from, end).filter((k) => !cache!.days[k] || k >= refreshFrom);
  const recentStart = addDays(today, -ARCHIVE_LAG);
  const old = need.filter((k) => k < recentStart);
  const recent = need.filter((k) => k >= recentStart);

  const jobs: Promise<Record<string, Raw>>[] = [];
  if (old.length)
    jobs.push(download(ARCHIVE, { latitude: la, longitude: lo, start_date: old[0], end_date: old[old.length - 1] }));
  if (recent.length) {
    const pastDays = Math.min(92, Math.max(0, daysBetween(recent[0], today)));
    const forecastDays = Math.min(16, Math.max(1, daysBetween(today, recent[recent.length - 1]) + 1));
    jobs.push(download(FORECAST, { latitude: la, longitude: lo, past_days: pastDays, forecast_days: forecastDays }));
  }
  const results = await Promise.all(jobs);
  for (const r of results) Object.assign(cache.days, r);
  cache.lat = la;
  cache.lon = lo;
  writeCache(cache);
  return toWeatherDays(cache.days, from, to);
}

/** Posizione attuale arrotondata a 2 decimali (~1 km). */
export function getLocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocalizzazione non disponibile su questo dispositivo'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude) }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Permesso di posizione negato' : 'Posizione non disponibile')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 6 * 3600 * 1000 }
    );
  });
}
