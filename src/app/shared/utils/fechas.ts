/** Fechas locales yyyy-MM-dd (sin toISOString, que usa UTC y en Ecuador después de las 19:00 da el día siguiente). */

export function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function hoy(): string {
  return fechaLocal(new Date());
}

/** Hoy más (o menos) N días. */
export function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
}

/** Días entre dos fechas yyyy-MM-dd (b − a). */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return fechaLocal(new Date(y, m - 1, d + dias));
}

/** Días de un mes "yyyy-MM" que cubre un rango [desde, hasta] (ambos inclusive, null = abierto). RN 22 a 24. */
export function diasCubiertosEnMes(periodo: string, desde: string | null, hasta: string | null): number {
  const [anio, mes] = periodo.split('-').map(Number);
  const primero = `${periodo}-01`;
  const ultimo = fechaLocal(new Date(anio, mes, 0));
  const inicio = desde && desde > primero ? desde : primero;
  const fin = hasta && hasta < ultimo ? hasta : ultimo;
  return fin < inicio ? 0 : diasEntre(inicio, fin) + 1;
}

/** Días reales del mes "yyyy-MM": 28, 29, 30 o 31 (RN 23). */
export function diasDelMes(periodo: string): number {
  const [anio, mes] = periodo.split('-').map(Number);
  return new Date(anio, mes, 0).getDate();
}
