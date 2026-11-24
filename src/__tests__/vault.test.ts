import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { abrirConPin, abrirConPrf, agregarPrf, cerrarVault, cifrar, crearVault, descifrar, vaultAbierto } from '../auth/vault';

describe('bóveda cifrada', () => {
  beforeEach(() => { localStorage.clear(); cerrarVault(); });

  it('cifra y descifra; el texto guardado no contiene los datos', async () => {
    await crearVault('482193');
    const sellado = await cifrar({ DESCRIPCION: 'Sueldo', MONTO: 4500 });
    expect(sellado).not.toContain('Sueldo');
    expect(await descifrar(sellado)).toEqual({ DESCRIPCION: 'Sueldo', MONTO: 4500 });
    expect(JSON.stringify(localStorage)).not.toMatch(/Sueldo/);
  });

  it('un PIN incorrecto no abre la bóveda; el correcto sí', async () => {
    await crearVault('482193');
    const sellado = await cifrar([1, 2, 3]);
    cerrarVault();
    expect(vaultAbierto()).toBe(false);
    expect(await abrirConPin('000000')).toBe(false);
    await expect(descifrar(sellado)).rejects.toThrow();
    expect(await abrirConPin('482193')).toBe(true);
    expect(await descifrar(sellado)).toEqual([1, 2, 3]);
  });

  it('abre con el secreto de la biometría (PRF) tras registrarlo', async () => {
    await crearVault('482193');
    const prf = crypto.getRandomValues(new Uint8Array(32)).buffer;
    await agregarPrf(prf);
    const sellado = await cifrar('ok');
    cerrarVault();
    expect(await abrirConPrf(crypto.getRandomValues(new Uint8Array(32)).buffer)).toBe(false);
    expect(await abrirConPrf(prf)).toBe(true);
    expect(await descifrar(sellado)).toBe('ok');
  });

  it('sin bóveda previa, abrir con PIN la crea (migración)', async () => {
    expect(await abrirConPin('482193')).toBe(true);
    expect(vaultAbierto()).toBe(true);
  });
});
