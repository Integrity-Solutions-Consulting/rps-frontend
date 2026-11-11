import { Modalidad } from '../../honorarios/models/honorario.models';
import { TipoCorte } from '../../../shared/models/corte';

/**
 * Liquidación mensual de un colaborador, tal como la calcula rps-backend
 * (Features/Liquidaciones y Features/Honorarios). La pantalla solo muestra estos valores.
 */

/** Un honorario del mes (un proyecto): GET /api/liquidaciones/{id} → honorarios. */
export interface ProyectoLiquidado {
  /** Null: honorario de un contrato que se paga por contrato (proyecto = "Pago por contrato"). */
  proyectoId: string | null;
  proyecto: string;
  cliente: string | null;
  modalidad: Modalidad;
  diasReales: number;
  diasReconocidos: number;
  proporcionalAcordado: number;
  subtotal: number;
  iva: number;
  totalDocumento: number;
  retencionFuente: number;
  retencionIva: number;
  totalRetenciones: number;
  neto: number;
}

/** Un corte de la liquidación (valorBase, recuperacionAdicional y valorPreparado del backend). */
export interface CorteLiquidacion {
  corte: TipoCorte;
  base: number;
  descuento: number;
  valor: number;
  /** > 0: el anticipo programado para este corte no cupo completo (saldo insuficiente). */
  recuperacionNoAplicada: number;
  /** > 0: la quincena se redujo porque el mes resultó más corto de lo previsto (salida a mitad de mes). */
  ajustePorProrrateo: number;
}

export interface LiquidacionResumen {
  id: string;
  /** "yyyy-MM" */
  periodo: string;
  colaboradorId: string;
  tmrColaboradorId: string;
  colaborador: string;
  netoConsolidado: number;
  cortes: CorteLiquidacion[];
  /** "Revisado para envío" (RN 49). El backend solo permite marcarlo. No confirma una transferencia. */
  revisado: boolean;
  revisadoEn: string | null;
  /** true si quien revisó fue el usuario de la sesión actual (no hay directorio de usuarios en el frontend). */
  revisadoPorMi: boolean;
  calculadoEn: string;
}

export interface LiquidacionDetalle extends LiquidacionResumen {
  detalleProyectos: ProyectoLiquidado[];
}

/** Colaborador activo con configuración pendiente: el backend no lo incluye al calcular. */
export interface LiquidacionPendiente {
  colaboradorId: string;
  colaborador: string;
}

export interface LiquidacionesPeriodo {
  periodo: string;
  filas: LiquidacionResumen[];
  pendientes: LiquidacionPendiente[];
}

/** Resultado de "Calcular": lo que respondió el backend en sus dos pasos. */
export interface ResultadoCalculo {
  honorariosGenerados: number;
  honorariosOmitidos: number;
  liquidacionesGeneradas: number;
}

/** El corte de ese tipo, o null si la liquidación no lo tiene. */
export function corteDe(l: Pick<LiquidacionResumen, 'cortes'>, corte: TipoCorte): CorteLiquidacion | null {
  return l.cortes.find((c) => c.corte === corte) ?? null;
}
