/** Valores fijos de los desplegables (mismos que la pestaña 10.LISTAS de la BD). */
export const TIPOS_CUENTA = ['EFECTIVO', 'AHORRO', 'CORRIENTE', 'CTS', 'PLAZO FIJO', 'TARJETA DE CRÉDITO', 'VALES', 'BILLETERA DIGITAL', 'INVERSION', 'POR COBRAR', 'DEUDA'];
export const MEDIOS_PAGO = ['EFECTIVO', 'TARJETA DE DÉBITO', 'TARJETA DE CRÉDITO', 'TRANSFERENCIA', 'YAPE', 'PLIN', 'TARJETA DE VALES', 'DÉBITO AUTOMÁTICO'];
export const FRECUENCIAS = ['ÚNICA', 'SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'];
export const CLASES_CATEGORIA = ['INGRESO', 'CONSUMO', 'IMPUESTO', 'FINANCIERO', 'INVERSIÓN', 'INTERNO'];
export const TIPOS_50_30_20 = ['NECESIDAD', 'DESEO', 'AHORRO / DEUDA'];
export const CLASES_PATRIMONIO = ['LÍQUIDO', 'RETIRO', 'INVERSIÓN', 'DEUDA', 'POR COBRAR'];
export const TIPOS_INSTITUCION = ['BANCO', 'CAJA MUNICIPAL', 'FINANCIERA', 'BILLETERA DIGITAL', 'AFP', 'EMISOR DE VALES', 'PROPIO', 'PERSONA', 'OTRO'];

/** Medio de pago sugerido según el tipo de cuenta. */
export function medioPorCuenta(tipo: string): string {
  if (tipo === 'EFECTIVO') return 'EFECTIVO';
  if (tipo === 'TARJETA DE CRÉDITO') return 'TARJETA DE CRÉDITO';
  if (tipo === 'VALES') return 'TARJETA DE VALES';
  if (tipo === 'BILLETERA DIGITAL') return 'YAPE';
  return 'TARJETA DE DÉBITO';
}
