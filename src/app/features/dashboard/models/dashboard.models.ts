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
  /** Mismo ID que usa la pantalla Contratos (?contrato=). Un contrato con varios proyectos puede
   * aparecer en más de una fila: una por cada proyecto que esté por vencer o vencido. */
  contratoId: string;
  colaboradorId: string;
  /** ID de TMR: filtra la pantalla Contratos (?colaborador=). */
  tmrColaboradorId: string;
  colaborador: string;
  proyectoId: string;
  proyecto: string;
  fechaFinVigente: string;
  /** Negativo cuando el contrato ya venció (lo calcula el backend). */
  diasRestantes: number;
  /** RN 15: vencido con asignación activa requiere revisión. */
  asignacionActiva: boolean;
}
