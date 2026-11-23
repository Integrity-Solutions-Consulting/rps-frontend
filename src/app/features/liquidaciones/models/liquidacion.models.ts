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
  /** Cuotas de préstamos descontadas en el corte (ya restadas de valor). */
  prestamos: number;
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
  /** Ya existían y cambiaron (ej. una adenda alargó el contrato): se recalcularon. */
  honorariosRecalculados: number;
  liquidacionesGeneradas: number;
  /** Se quedaron sin honorarios (ya no les corresponde ningún día del mes). */
  liquidacionesEliminadas: number;
}

// ── Rol a pagar: factura del mes, días descontados y observaciones ──────────
// GET /api/liquidaciones/facturacion?periodo=… (FacturacionService en el backend).
// Plazo: hasta el día 7, 23:59 (a tiempo: cobra quincena). Gracia: del 8 al 14, 23:59 (se registra,
// pero el mes se paga a fin de mes). Desde el 15 ya no se puede marcar.

export type EstadoFactura = 'NoAplica' | 'Pendiente' | 'PendienteEnGracia' | 'NoEntregada' | 'ATiempo' | 'EnGracia';
export type FasePlazoFactura = 'NoAplica' | 'Abierto' | 'Gracia' | 'Cerrado';

export interface ControlMensual {
  colaboradorId: string;
  frecuencia: 'DosPagos' | 'FinDeMes';
  estadoFactura: EstadoFactura;
  facturaRecibidaEn: string | null;
  facturaMarcadaPor: string | null;
  puedeMarcarFactura: boolean;
  puedeQuitarFactura: boolean;
  /** Solo se registran: por ahora no cambian el valor a pagar ni salen en las exportaciones. */
  diasDescontados: number;
  observaciones: string | null;
  diasActualizadoEn: string | null;
  diasActualizadoPor: string | null;
  /** Todavía tiene quincena aunque ya no le corresponde: se ajusta al volver a "Calcular período". */
  quincenaPorAjustar: boolean;
}

export interface FacturacionPeriodo {
  periodo: string;
  fase: FasePlazoFactura;
  /** Hora de Ecuador, sin zona ("2026-12-08T00:00:00"). */
  cierreATiempo: string;
  cierreGracia: string;
  quincenasPorAjustar: number;
  colaboradores: ControlMensual[];
}

export const ETIQUETA_FACTURA: Record<EstadoFactura, { texto: string; tono: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }> = {
  NoAplica: { texto: 'No aplica', tono: 'neutral' },
  Pendiente: { texto: 'Pendiente', tono: 'warn' },
  PendienteEnGracia: { texto: 'Pendiente · gracia', tono: 'warn' },
  NoEntregada: { texto: 'No entregada', tono: 'danger' },
  ATiempo: { texto: 'A tiempo', tono: 'ok' },
  EnGracia: { texto: 'En gracia', tono: 'info' },
};

/** Sin factura (todavía o ya vencida): para el filtro "Sin factura". */
export function sinFactura(estado: EstadoFactura): boolean {
  return estado === 'Pendiente' || estado === 'PendienteEnGracia' || estado === 'NoEntregada';
}

/** El corte de ese tipo, o null si la liquidación no lo tiene. */
export function corteDe(l: Pick<LiquidacionResumen, 'cortes'>, corte: TipoCorte): CorteLiquidacion | null {
  return l.cortes.find((c) => c.corte === corte) ?? null;
}
