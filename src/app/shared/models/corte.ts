/** Los dos cortes de pago del mes (sección 9 de los requisitos). */
export type TipoCorte = 'Quincena' | 'FinDeMes';

export const ETIQUETA_CORTE: Record<TipoCorte, string> = {
  Quincena: 'Quincena',
  FinDeMes: 'Fin de mes',
};

/** "Quincena (1 – 15 oct)" y "Fin de mes (16 – 31 oct)" para un período "yyyy-MM". */
export function rangoCorte(corte: TipoCorte, periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  const ultimo = new Date(anio, mes, 0).getDate();
  const nombreMes = new Date(anio, mes - 1, 1).toLocaleDateString('es-EC', { month: 'short' }).replace('.', '');
  return corte === 'Quincena' ? `1 – 15 ${nombreMes}` : `16 – ${ultimo} ${nombreMes}`;
}
