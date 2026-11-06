/** Utilidades del período mensual "yyyy-MM" que usa todo RPS. */

export function periodoActual(hoy: Date = new Date()): string {
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

/** Mes siguiente al actual, "yyyy-MM". Los cambios de condiciones aplican desde aquí (RN 19, RN 20). */
export function periodoSiguiente(hoy: Date = new Date()): string {
  return periodoActual(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1));
}

/** "2026-11" → "Noviembre 2026" */
export function nombrePeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  if (!anio || !mes) return periodo;
  const texto = new Date(anio, mes - 1, 1).toLocaleDateString('es-EC', { month: 'long' });
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)} ${anio}`;
}

export function esPeriodoValido(periodo: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
}

/** "2026-11" → "2026-11-01" (formato DateOnly del backend para "vigente desde mes"). */
export function primerDia(periodo: string): string {
  return `${periodo}-01`;
}

/** "2026-11-01" → "2026-11" */
export function periodoDeFecha(fecha: string): string {
  return fecha.slice(0, 7);
}
