/**
 * Honorario mensual por colaborador y proyecto (RN 17, RN 18, RN 19).
 * Tabla propuesta: rps.honorario_vigente (colaborador + tmr_proyecto_id + vigente_desde_mes).
 * El backend todavía no lo tiene: hoy responde el mock.
 */

export type Modalidad = 'Neto' | 'MasIva';

export interface HonorarioVigencia {
  id: string;
  importe: number;
  modalidad: Modalidad;
  /** Primer día del mes, "2026-11-01". */
  vigenteDesdeMes: string;
  registradoEn: string;
  /** Si se canceló antes de regir. No se borra: queda en el historial y se puede restaurar. */
  canceladoEn: string | null;
}

/** Un proyecto del colaborador con su honorario vigente, el programado y el historial. */
export interface HonorarioProyecto {
  tmrProyectoId: string;
  proyecto: string;
  cliente: string | null;
  asignacionActiva: boolean;
  /** El que rige este mes. null = sin honorario configurado (pendiente, RN 06). */
  vigente: HonorarioVigencia | null;
  /** Cambio ya registrado para un mes que aún no empieza. */
  programado: HonorarioVigencia | null;
  /** Todas las vigencias (también las canceladas), de la más reciente a la más antigua. */
  historial: HonorarioVigencia[];
}

export interface ProgramarHonorarioRequest {
  tmrColaboradorId: string;
  tmrProyectoId: string;
  importe: number;
  modalidad: Modalidad;
  vigenteDesdeMes: string;
}

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  Neto: 'Neto',
  MasIva: 'Más IVA',
};

export const DETALLE_MODALIDAD: Record<Modalidad, string> = {
  Neto: 'Lo que recibe después de IVA y retenciones; RPS calcula el subtotal hacia atrás.',
  MasIva: 'Es el subtotal; RPS agrega el IVA y descuenta las retenciones.',
};
