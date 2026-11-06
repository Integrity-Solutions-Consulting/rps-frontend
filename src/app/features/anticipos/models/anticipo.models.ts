import { BeResumenAnticipos } from '../../../core/backend/backend-rps.models';
import { TipoCorte } from '../../../shared/models/corte';

/**
 * Anticipos adicionales, como los maneja rps-backend (/api/colaboradores/{id}/anticipos):
 *   1. POST       registra el anticipo (valida monto, colaborador activo y límite).
 *   2. PUT /plan  registra o reemplaza su plan de cuotas (valida suma, un solo mes y cortes según la frecuencia).
 *   3. DELETE     lo elimina, solo si todavía no tiene cuotas.
 * El frontend no calcula ni valida: muestra lo que responde el backend.
 */

export interface CuotaAnticipo {
  id: string;
  /** Primer día del mes, "2026-11-01". */
  periodo: string;
  corte: TipoCorte;
  importe: number;
}

export interface Anticipo {
  id: string;
  colaboradorId: string;
  fecha: string;
  monto: number;
  observaciones: string | null;
  /** Monto menos la suma de sus cuotas (lo calcula el backend). */
  saldoPendiente: number;
  cuotas: CuotaAnticipo[];
  creadoEn: string;
}

/** GET .../anticipos/resumen: neto, límite, saldo, disponible y cortes permitidos. */
export type ResumenAnticipos = BeResumenAnticipos;

export interface CuotaPlan {
  /** Primer día del mes, "2026-11-01". */
  periodo: string;
  corte: TipoCorte;
  importe: number;
}
