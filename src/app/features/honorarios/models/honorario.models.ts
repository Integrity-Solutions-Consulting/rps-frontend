/**
 * Honorario mensual por colaborador y proyecto (RN 17, RN 18).
 * En rps-backend: condiciones económicas (/api/colaboradores/{id}/condiciones-economicas).
 */

export type Modalidad = 'Neto' | 'MasIva';

export interface HonorarioVigencia {
  id: string;
  importe: number;
  modalidad: Modalidad;
  /** Primer día del mes, "2026-11-01". */
  vigenteDesdeMes: string;
  contratoId: string;
}

/** Honorario de un contrato que se paga POR CONTRATO: un solo importe fijo, sin importar sus proyectos. */
export interface HonorarioContrato {
  contratoId: string;
  vigente: HonorarioVigencia | null;
  programado: HonorarioVigencia | null;
}

/** Contrato del proyecto, para elegir a cuál se asocia un honorario (el backend lo exige). */
export interface ContratoDelProyecto {
  id: string;
  referencia: string | null;
  fechaInicio: string;
  /** Null: contrato indefinido (sin fecha de fin). */
  fechaFinVigente: string | null;
  vigente: boolean;
}

/** Un proyecto del colaborador con su honorario vigente, el programado y el historial. */
export interface HonorarioProyecto {
  tmrProyectoId: string;
  proyecto: string;
  cliente: string | null;
  /** false si la asignación ya no viene de TMR. */
  asignacionActiva: boolean;
  /** El que rige este mes. null = sin honorario configurado (pendiente, RN 06). */
  vigente: HonorarioVigencia | null;
  /** Cambio ya registrado para un mes que aún no empieza. */
  programado: HonorarioVigencia | null;
  /** Todos los honorarios registrados, del más reciente al más antiguo (orden del backend). */
  historial: HonorarioVigencia[];
  contratos: ContratoDelProyecto[];
}

export interface ProgramarHonorarioRequest {
  tmrColaboradorId: string;
  tmrProyectoId: string;
  contratoId: string;
  importe: number;
  modalidad: Modalidad;
  vigenteDesdeMes: string;
}

export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  Neto: 'Neto',
  MasIva: 'Más IVA',
};

export const DETALLE_MODALIDAD: Record<Modalidad, string> = {
  Neto: 'Lo que recibe después de IVA y retenciones.',
  MasIva: 'Es el subtotal; sobre él se agrega el IVA y se descuentan las retenciones.',
};
