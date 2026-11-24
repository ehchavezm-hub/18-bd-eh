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
