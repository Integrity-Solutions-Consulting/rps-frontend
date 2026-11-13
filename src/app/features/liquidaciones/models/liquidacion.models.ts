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
  /** Identificación de la copia de TMR ("" si no se conoce). Solo para buscar; en pantalla se muestra enmascarada. */
  identificacion: string;
  netoConsolidado: number;
  cortes: CorteLiquidacion[];
  /** "Revisado para envío" (RN 49). El backend solo permite marcarlo. No confirma una transferencia. */
  revisado: boolean;
  revisadoEn: string | null;
  /** true si quien revisó fue el usuario de la sesión actual (no hay directorio de usuarios en el frontend). */
  revisadoPorMi: boolean;
  calculadoEn: string;
  /** Cambió después de calculada; null si no hay cambios pendientes de revisar. */
  modificadaEn: string | null;
  motivoModificacion: string | null;
  /** Estaba revisada y por el cambio volvió a "Por revisar". */
  revisionAnulada: boolean;
}

export interface LiquidacionDetalle extends LiquidacionResumen {
  detalleProyectos: ProyectoLiquidado[];
}

export interface LiquidacionesPeriodo {
  periodo: string;
  filas: LiquidacionResumen[];
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
