/**
 * Contrato propuesto para Features/Contratos del backend (tabla rps.contrato y rps.adenda de la
 * "Propuesta de arquitectura"). El backend todavía no lo tiene: hoy responde el mock.
 * Un contrato por colaborador y proyecto (RN 08); una persona con dos proyectos tiene dos contratos.
 */

export type EstadoContrato = 'Vigente' | 'ProximoAVencer' | 'Vencido';

export interface Adenda {
  id: string;
  numero: number;
  /** Nueva fecha de fin que establece la adenda. */
  nuevaFechaFin: string;
  referencia: string | null;
  observaciones: string | null;
  fechaRegistro: string;
}

export interface ContratoResumen {
  id: string;
  colaboradorId: string;
  tmrColaboradorId: string;
  /** Nombre que viene de TMR (tabla espejo tmr_colaborador). */
  colaborador: string;
  tmrProyectoId: string;
  proyecto: string;
  cliente: string | null;
  referencia: string | null;
  fechaInicio: string;
  /** Nunca cambia (RN 12). */
  fechaFinOriginal: string;
  /** Refleja la última adenda (RN 12). */
  fechaFinVigente: string;
  /** Negativo si ya venció. */
  diasParaVencer: number;
  estado: EstadoContrato;
  /** RN 15: vencido con asignación activa requiere revisión. */
  asignacionActiva: boolean;
  numeroAdendas: number;
}

export interface ContratoDetalle extends ContratoResumen {
  observaciones: string | null;
  adendas: Adenda[];
  /** Fechas de la asignación en TMR, para advertir huecos sin cobertura. */
  asignacionInicio: string | null;
  asignacionSalida: string | null;
  advertencias: string[];
}

export interface ResumenContratos {
  vigentes: number;
  proximosAVencer: number;
  vencidos: number;
  /** Mayor plazo de alerta configurado (30 días por defecto, RN 13). */
  diasAlerta: number;
}

/** Combinación colaborador + proyecto asignada en TMR, para elegir al registrar un contrato. */
export interface AsignacionDisponible {
  tmrColaboradorId: string;
  colaborador: string;
  tmrProyectoId: string;
  proyecto: string;
  cliente: string | null;
  fechaAsignacion: string | null;
  fechaFinAsignacion: string | null;
  activa: boolean;
  /** false si la persona aún no está vinculada en RPS (no se le puede registrar contrato). */
  vinculadoEnRps: boolean;
  /** Ya tiene contrato con fin vigente igual o posterior a hoy. */
  tieneContratoVigente: boolean;
}

export interface RegistrarContratoRequest {
  tmrColaboradorId: string;
  tmrProyectoId: string;
  fechaInicio: string;
  fechaFin: string;
  referencia: string | null;
  observaciones: string | null;
}

export interface RegistrarAdendaRequest {
  nuevaFechaFin: string;
  referencia: string | null;
  observaciones: string | null;
}

export const ETIQUETA_ESTADO_CONTRATO: Record<EstadoContrato, string> = {
  Vigente: 'Vigente',
  ProximoAVencer: 'Próximo a vencer',
  Vencido: 'Vencido',
};
