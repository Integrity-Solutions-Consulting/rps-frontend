/**
 * Contratos y adendas de rps-backend (Features/Contratos). Un contrato por colaborador y proyecto.
 * Estado: Vencido y ProximoAVencer salen de GET /api/dashboard/vencimientos; Vigente / NoVigente,
 * del campo `vigente` del contrato (inicio ≤ hoy ≤ fin vigente, según el backend).
 */

export type EstadoContrato = 'Vigente' | 'ProximoAVencer' | 'Vencido' | 'NoVigente';

export interface Adenda {
  id: string;
  numero: number;
  /** Nueva fecha de fin que establece la adenda. */
  nuevaFechaFin: string;
  observaciones: string | null;
  fechaRegistro: string;
}

export interface ContratoResumen {
  id: string;
  colaboradorId: string;
  tmrColaboradorId: string;
  /** Nombre copiado de TMR. */
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
  /** Solo para los que el backend lista en vencimientos; negativo si ya venció. */
  diasParaVencer: number | null;
  estado: EstadoContrato;
  /** RN 15: el backend lo marca en vencimientos (vencido con asignación activa requiere revisión). */
  asignacionActiva: boolean;
  numeroAdendas: number;
}

export interface ContratoDetalle extends ContratoResumen {
  observaciones: string | null;
  adendas: Adenda[];
  /** Fechas de la asignación que vienen de TMR. */
  asignacionInicio: string | null;
  asignacionSalida: string | null;
}

export interface ResumenContratos {
  vigentes: number;
  proximosAVencer: number;
  vencidos: number;
  noVigentes: number;
}

/** Combinación colaborador + proyecto asignada en TMR, para elegir al registrar un contrato. */
export interface AsignacionDisponible {
  tmrColaboradorId: string;
  colaborador: string;
  tmrProyectoId: string;
  proyecto: string;
  fechaAsignacion: string | null;
  fechaFinAsignacion: string | null;
  /** El backend marca un contrato de ese proyecto como vigente. */
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
  observaciones: string | null;
}

export const ETIQUETA_ESTADO_CONTRATO: Record<EstadoContrato, string> = {
  Vigente: 'Vigente',
  ProximoAVencer: 'Próximo a vencer',
  Vencido: 'Vencido con asignación activa',
  NoVigente: 'No vigente',
};
