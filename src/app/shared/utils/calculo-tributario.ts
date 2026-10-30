import { Modalidad } from '../../features/honorarios/models/honorario.models';

/**
 * Misma fórmula que rps-backend/Features/Honorarios/Application/CalculoTributario.cs (sección 7, RN 28).
 * El frontend la usa solo para mostrar estimaciones (por ejemplo, el neto de referencia de anticipos);
 * el valor oficial lo calcula siempre el backend.
 */
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function netoDe(importe: number, modalidad: Modalidad, ivaPct: number, retFuentePct: number, retIvaPct: number): number {
  const factor = 1 + ivaPct / 100 - retFuentePct / 100 - (ivaPct / 100) * (retIvaPct / 100);
  const subtotal = modalidad === 'Neto' ? r2(importe / factor) : importe;
  const iva = r2(subtotal * ivaPct / 100);
  const total = subtotal + iva;
  const retenciones = r2(subtotal * retFuentePct / 100) + r2(iva * retIvaPct / 100);
  return r2(total - retenciones);
}
