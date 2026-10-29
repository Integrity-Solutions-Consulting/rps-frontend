import { Clasificacion, Frecuencia } from '../../colaboradores/models/colaborador.models';
import { Modalidad } from '../../honorarios/models/honorario.models';
import { EstadoContrato } from '../../contratos/models/contrato.models';
import { TipoCorte } from '../../../shared/models/corte';

/**
 * Liquidación mensual de un colaborador (secciones 6 a 9 de los requisitos).
 * El backend calcula; esta pantalla solo muestra. Endpoint propuesto: /api/liquidaciones.
 *
 * Cómo se calcula, en orden:
 *   1. Por cada proyecto: días reconocidos del mes (RN 22 a 25) → proporcional del honorario.
 *   2. Por cada proyecto: impuestos según su modalidad (RN 28) → neto del proyecto.
 *   3. Neto consolidado = suma de los netos de los proyectos (RN 30, RN 31).
 *   4. Cortes: 50 % y 50 % o todo a fin de mes, según la frecuencia del colaborador (RN 36 a 39).
 *   5. Se restan las cuotas de anticipos adicionales de cada corte (RN 38).
 */

export interface ProyectoLiquidado {
  tmrProyectoId: string;
  proyecto: string;
  cliente: string | null;
  /** Honorario mensual vigente en el período (RN 17). */
  honorario: number;
  modalidad: Modalidad;
  /** Desde y hasta del mes que cubre la asignación de TMR. */
  desde: string;
  hasta: string;
  diasReconocidos: number;
  diasDelMes: number;
  /** honorario ÷ días del mes × días reconocidos. */
  proporcional: number;
  subtotal: number;
  iva: number;
  totalDocumento: number;
  retencionFuente: number;
  retencionIva: number;
  totalRetenciones: number;
  neto: number;
  /** Diferencia de centavos por redondeo en la modalidad neto (la secuencia la confirmará Contabilidad). */
  ajusteRedondeo: number;
  contrato: { estado: EstadoContrato; fechaFinVigente: string } | null;
}

export interface CorteLiquidacion {
  corte: TipoCorte;
  /** Parte del neto que corresponde al corte, antes de anticipos (RN 38). */
  base: number;
  /** Cuotas de anticipos adicionales programadas para el corte. */
  descuento: number;
  /** Valor a considerar en la exportación. */
  valor: number;
  /** Versión de exportación en la que salió este corte, o null. */
  versionExportada: number | null;
}

export type EstadoDocumento = 'Registrado' | 'Pendiente';

export interface LiquidacionResumen {
  id: string;
  periodo: string;
  colaboradorId: string;
  tmrColaboradorId: string;
  colaborador: string;
  clasificacion: Clasificacion;
  frecuencia: Frecuencia;
  proyectos: number;
  netoConsolidado: number;
  cortes: CorteLiquidacion[];
  documento: EstadoDocumento;
  /** Casilla "Revisado para envío" (RN 49). No confirma una transferencia. */
  revisado: boolean;
  revisadoPor: string | null;
  revisadoEn: string | null;
  version: number;
  calculadoEn: string;
  /** Algo cambió después del cálculo (TMR, honorarios, anticipos): hay que recalcular (RN 50). */
  requiereRecalculo: boolean;
  advertencias: string[];
}

export interface LiquidacionDetalle extends LiquidacionResumen {
  detalleProyectos: ProyectoLiquidado[];
  /** Proyectos con días en el mes pero sin honorario: no se calculan (RN 06). */
  proyectosSinHonorario: string[];
  /** Porcentajes usados en este cálculo (RN 29). */
  parametros: { ivaPct: number; retencionFuentePct: number; retencionIvaPct: number };
  /** Explicación de cómo se repartió el neto entre los cortes (RN 26, RN 27, RN 39). */
  notasCortes: string[];
  versionesAnteriores: { version: number; calculadoEn: string; netoConsolidado: number }[];
}

/** Colaborador con proyectos en el mes que no se pudo calcular. */
export interface LiquidacionPendiente {
  colaboradorId: string;
  colaborador: string;
  motivo: string;
}

export interface LiquidacionesPeriodo {
  periodo: string;
  calculado: boolean;
  filas: LiquidacionResumen[];
  pendientes: LiquidacionPendiente[];
}

export const ETIQUETA_ESTADO_DOCUMENTO: Record<EstadoDocumento, string> = {
  Registrado: 'Registrado',
  Pendiente: 'Pendiente',
};

/** Valor de un corte, o 0 si el colaborador no tiene ese corte (frecuencia solo fin de mes). */
export function corteDe(l: Pick<LiquidacionResumen, 'cortes'>, corte: TipoCorte): CorteLiquidacion {
  return l.cortes.find((c) => c.corte === corte) ?? { corte, base: 0, descuento: 0, valor: 0, versionExportada: null };
}
