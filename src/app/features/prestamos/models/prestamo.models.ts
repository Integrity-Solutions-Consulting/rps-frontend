import { BeCuotaPrestamo, BePrestamo, BeResumenPrestamos } from '../../../core/backend/backend-rps.models';
import { TipoCorte } from '../../../shared/models/corte';

/**
 * Préstamos, como los maneja rps-backend (/api/colaboradores/{id}/prestamos):
 *   - POST   registra el préstamo con su plan de pagos (la suma tiene que dar el monto).
 *   - PUT    cambia monto, observaciones y plan (los cobros cuya fecha ya llegó van iguales).
 *   - DELETE lo elimina, solo si todavía no empezó a cobrarse.
 * Cada cobro es la quincena (el 15) o el fin de mes (último día) de un mes desde el siguiente a la
 * entrega. El backend descuenta en la liquidación y, si el pago no alcanza, lo que falta pasa al
 * siguiente pago: el pago nunca queda negativo.
 */
export type Prestamo = BePrestamo;
export type CuotaPrestamo = BeCuotaPrestamo;
export type ResumenPrestamos = BeResumenPrestamos;

/** Un cobro del plan, como se envía al backend. */
export interface CuotaPlanPrestamo {
  /** Primer día del mes, "2026-12-01". */
  periodo: string;
  corte: TipoCorte;
  importe: number;
}

export interface CrearPrestamo {
  monto: number | null;
  /** "yyyy-MM-dd"; null = hoy. */
  fecha: string | null;
  observaciones: string | null;
  cuotas: CuotaPlanPrestamo[];
}

export interface ActualizarPrestamo {
  monto: number | null;
  observaciones: string | null;
  cuotas: CuotaPlanPrestamo[];
}
