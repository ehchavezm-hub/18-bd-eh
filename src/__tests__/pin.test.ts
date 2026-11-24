import { beforeEach, describe, expect, it } from 'vitest';
import { isValidNewPin, isValidPin, setPin, verifyPin } from '../auth/lock';

describe('PIN', () => {
  beforeEach(() => localStorage.clear());
  it('valida formato de 4 a 6 números', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidNewPin('1234')).toBe(false);
    expect(isValidNewPin('482193')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
  it('guarda solo un hash y verifica el PIN', async () => {
    await setPin('482193');
    expect(localStorage.getItem('finanzas.settings.v1')).not.toContain('482193');
    expect(await verifyPin('482193')).toBe(true);
    expect(await verifyPin('0000')).toBe(false);
  });
});

import { esperaPin } from '../auth/lock';
describe('límite de intentos de PIN', () => {
  beforeEach(() => localStorage.clear());
  it('bloquea tras 5 fallos y no acepta ni el PIN correcto mientras espera', async () => {
    await setPin('482193');
    for (let i = 0; i < 5; i++) expect(await verifyPin('0000')).toBe(false);
    expect(esperaPin()).toBeGreaterThan(0);
    expect(await verifyPin('482193')).toBe(false);
  });
  it('un acierto reinicia el contador', async () => {
    await setPin('482193');
    for (let i = 0; i < 4; i++) await verifyPin('0000');
    expect(await verifyPin('482193')).toBe(true);
    expect(esperaPin()).toBe(0);
  });
});

import { loadSettings, saveSettings } from '../config/settings';
import { cerrarVault } from '../auth/vault';
describe('el PIN solo abre la bóveda (sin hash más débil guardado)', () => {
  beforeEach(() => { localStorage.clear(); cerrarVault(); });
  it('no guarda pinHash y la bóveda usa 600 000 iteraciones', async () => {
    await setPin('482193');
    const s = loadSettings();
    expect(s.pinHash).toBeUndefined();
    expect((s.vault as { iter?: number }).iter).toBe(600_000);
    cerrarVault();
    expect(await verifyPin('111111')).toBe(false);
    expect(await verifyPin('482193')).toBe(true);
  });
  it('bóveda antigua (310 000 iteraciones) se refuerza a 600 000 al abrir con PIN', async () => {
    const { b64 } = await import('../auth/vault');
    const raw = crypto.getRandomValues(new Uint8Array(32)), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('482193'), 'PBKDF2', false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, raw));
    const sellado = new Uint8Array(12 + ct.length); sellado.set(iv); sellado.set(ct, 12);
    saveSettings({ vault: { v: 1, salt: b64.enc(salt), pin: b64.enc(sellado), prfSalt: b64.enc(new Uint8Array(32)) }, pinHash: 'viejo', pinSalt: 'sal' });
    expect(await verifyPin('482193')).toBe(true);
    expect((loadSettings().vault as { iter?: number }).iter).toBe(600_000);
    expect(loadSettings().pinHash).toBeUndefined();
    cerrarVault();
    expect(await verifyPin('482193')).toBe(true); // sigue abriendo tras el refuerzo
  });
});
