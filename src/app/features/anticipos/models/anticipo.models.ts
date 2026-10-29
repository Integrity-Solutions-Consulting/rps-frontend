import { Clasificacion, Frecuencia } from '../../colaboradores/models/colaborador.models';
import { TipoCorte } from '../../../shared/models/corte';

/**
 * Anticipos adicionales (sección 10 de los requisitos). Son aparte del pago ordinario de quincena:
 * se entregan por separado y se recuperan con cuotas en los cortes del mismo mes (RN 41 a 47).
 * Endpoint propuesto: /api/anticipos.
 */

/** Programada: se descontará en su corte. Aplicada: ya se descontó (el hito exacto está pendiente, sección 10). */
export type EstadoCuota = 'Programada' | 'Aplicada';

export interface CuotaAnticipo {
  id: string;
  corte: TipoCorte;
  monto: number;
  estado: EstadoCuota;
}

export interface Anticipo {
  id: string;
  colaboradorId: string;
  fecha: string;
  /** Mes "yyyy-MM" en el que se recupera todo el anticipo (RN 45). */
  periodo: string;
  monto: number;
  observaciones: string | null;
  cuotas: CuotaAnticipo[];
  /** Neto y límite con los que se validó (se conservan aunque cambie la configuración). */
  netoReferencia: number;
  limite: number;
  registradoEn: string;
  usuario: string;
}

export interface CorteDisponible {
  corte: TipoCorte;
  /** Lo que el corte paga antes de anticipos. */
  base: number;
  /** Cuotas ya programadas para este corte. */
  cuotasProgramadas: number;
  /** Lo que todavía se puede descontar sin dejar el corte en negativo (RN 47). */
  disponible: number;
  /** Si el corte ya se exportó, no se le pueden agregar cuotas. */
  versionExportada: number | null;
}

export interface ResumenAnticipos {
  colaboradorId: string;
  colaborador: string;
  identificacion: string;
  clasificacion: Clasificacion | null;
  frecuencia: Frecuencia | null;
  periodo: string;
  /** Neto mensual completo consolidado (RN 21). null si falta configuración para calcularlo. */
  netoReferencia: number | null;
  /** De dónde sale el neto de referencia: un renglón por proyecto. */
  proyectos: { proyecto: string; neto: number }[];
  /** Suma de las cuotas programadas que aún no se descuentan. */
  saldoPendiente: number;
  limitePct: number;
  limite: number | null;
  disponible: number | null;
  cortes: CorteDisponible[];
  /** Si no se puede registrar un anticipo, aquí está el motivo. */
  bloqueo: string | null;
}

export interface RegistrarAnticipoRequest {
  colaboradorId: string;
  fecha: string;
  monto: number;
  observaciones: string | null;
  cuotas: { corte: TipoCorte; monto: number }[];
}
