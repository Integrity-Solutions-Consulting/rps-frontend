/**
 * Datos de Inicio. Todo viene de rps-backend; la pantalla solo los muestra.
 *   - Indicadores: GET /api/dashboard?periodo= (DashboardService del backend).
 *   - Vencimientos: GET /api/dashboard/vencimientos (VencimientosContratosService del backend).
 */
import { BeDashboard } from '../../../core/backend/backend-rps.models';

/** Período mensual en formato yyyy-MM, por ejemplo "2026-11". */
export type Periodo = string;

export type IndicadoresDashboard = BeDashboard;

export interface VencimientoContrato {
  /** Mismo ID que usa la pantalla Contratos (?contrato=). Una fila por contrato (con o sin proyectos). */
  contratoId: string;
  colaboradorId: string;
  /** ID de TMR: filtra la pantalla Contratos (?colaborador=). */
  tmrColaboradorId: string;
  colaborador: string;
  /** Siempre null: el aviso es del contrato, no de cada proyecto. */
  proyectoId: string | null;
  /** Proyectos del contrato separados por coma, o "Sin proyectos". */
  proyecto: string;
  fechaFinVigente: string;
  /** Negativo cuando el contrato ya venció (lo calcula el backend). */
  diasRestantes: number;
  /** RN 15: vencido con asignación activa requiere revisión. */
  asignacionActiva: boolean;
}

/** Salida de un proyecto que se paga POR PROYECTO: ese monto deja de pagarse desde el día siguiente. */
export interface SalidaProyecto {
  colaboradorId: string;
  tmrColaboradorId: string;
  colaborador: string;
  contratoId: string;
  proyectoId: string;
  proyecto: string;
  fechaSalida: string;
  diasRestantes: number;
}
