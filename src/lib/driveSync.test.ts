import { describe, expect, it } from 'vitest';
import { BANNER_AFTER_MS, fingerprint, parseStoredToken, shouldShowSyncBanner, TOKEN_MARGIN_MS, tokenExpiry, tokenUsable } from './driveSync';

const NOW = Date.UTC(2026, 10, 24, 12);

describe('token salvato', () => {
  it('legge un token valido', () => {
    expect(parseStoredToken(JSON.stringify({ value: 'abc', exp: NOW }))).toEqual({ value: 'abc', exp: NOW });
  });
  it('scarta valori assenti o malformati', () => {
    for (const raw of [null, '', 'null', '{', '{}', '{"value":"","exp":1}', '{"value":"a","exp":"1"}', '{"value":1,"exp":1}', '[]']) {
      expect(parseStoredToken(raw)).toBeNull();
    }
  });
  it('è usabile solo fino a un minuto prima della scadenza', () => {
    expect(tokenUsable(null, NOW)).toBe(false);
    expect(tokenUsable({ value: 'a', exp: NOW + TOKEN_MARGIN_MS + 1 }, NOW)).toBe(true);
    expect(tokenUsable({ value: 'a', exp: NOW + TOKEN_MARGIN_MS }, NOW)).toBe(false);
    expect(tokenUsable({ value: 'a', exp: NOW - 1 }, NOW)).toBe(false);
  });
  it('calcola la scadenza da expires_in', () => {
    expect(tokenExpiry(3599, NOW)).toBe(NOW + 3599_000);
    expect(tokenExpiry('3599', NOW)).toBe(NOW + 3599_000);
    expect(tokenExpiry(undefined, NOW)).toBe(NOW + 3600_000);
    expect(tokenExpiry('x', NOW)).toBe(NOW + 3600_000);
    expect(tokenExpiry(0, NOW)).toBe(NOW + 3600_000);
  });
});

describe('avviso in Home', () => {
  const base = { enabled: true, hasKey: true, needsReauth: true, now: NOW };
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it('non compare se non ci sono modifiche in sospeso', () => {
    expect(shouldShowSyncBanner({ ...base, pendingSince: null })).toBe(false);
    expect(shouldShowSyncBanner({ ...base, pendingSince: undefined })).toBe(false);
  });
  it('non compare per modifiche recenti', () => {
    expect(shouldShowSyncBanner({ ...base, pendingSince: ago(3600_000) })).toBe(false);
    expect(shouldShowSyncBanner({ ...base, pendingSince: ago(BANNER_AFTER_MS - 1) })).toBe(false);
  });
  it('compare per modifiche in sospeso da oltre la soglia', () => {
    expect(shouldShowSyncBanner({ ...base, pendingSince: ago(BANNER_AFTER_MS) })).toBe(true);
    expect(shouldShowSyncBanner({ ...base, pendingSince: 'non-una-data' })).toBe(true);
  });
  it('non compare se il backup è spento, senza chiave o con Google collegato', () => {
    const old = ago(BANNER_AFTER_MS * 2);
    expect(shouldShowSyncBanner({ ...base, enabled: false, pendingSince: old })).toBe(false);
    expect(shouldShowSyncBanner({ ...base, hasKey: false, pendingSince: old })).toBe(false);
    expect(shouldShowSyncBanner({ ...base, needsReauth: false, pendingSince: old })).toBe(false);
  });
});

describe('impronta dei dati', () => {
  it('è stabile e distingue contenuti diversi', () => {
    expect(fingerprint('{"a":1}')).toBe(fingerprint('{"a":1}'));
    expect(fingerprint('{"a":1}')).not.toBe(fingerprint('{"a":2}'));
    expect(fingerprint('')).toMatch(/^[0-9a-f]{8}:0$/);
  });
});
