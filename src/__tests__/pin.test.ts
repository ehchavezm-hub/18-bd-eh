import { beforeEach, describe, expect, it } from 'vitest';
import { isValidPin, setPin, verifyPin } from '../auth/lock';

describe('PIN', () => {
  beforeEach(() => localStorage.clear());
  it('valida formato de 4 a 6 números', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
  it('guarda solo un hash y verifica el PIN', async () => {
    await setPin('4821');
    expect(localStorage.getItem('finanzas.settings.v1')).not.toContain('4821');
    expect(await verifyPin('4821')).toBe(true);
    expect(await verifyPin('0000')).toBe(false);
  });
});
