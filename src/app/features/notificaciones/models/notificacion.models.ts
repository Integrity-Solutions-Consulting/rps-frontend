import { BeCambioTmr, TipoCambioTmr } from '../../../core/backend/backend-rps.models';

/**
 * Campana de la cabecera: cambios detectados en TMR que Contabilidad no ha revisado (RN 50).
 * Datos: GET /api/integracion-tmr/cambios?revisado=false · POST /api/integracion-tmr/cambios/{id}/revisar.
 * El backend no tiene otras notificaciones.
 */
export type CambioTmr = BeCambioTmr;

/** Título corto de cada tipo de cambio, tal como lo nombra el backend. */
export const ETIQUETA_CAMBIO: Record<TipoCambioTmr, string> = {
  AsignacionNueva: 'Asignación nueva',
  AsignacionEliminada: 'Asignación quitada en TMR',
  AsignacionRestaurada: 'Asignación restaurada',
  FechaSalida: 'Cambio de fecha de salida',
  EstadoColaborador: 'Cambio de estado en TMR',
  ColaboradorEliminado: 'Ya no está en TMR',
  ColaboradorRestaurado: 'Volvió a TMR',
};

/** "Ana Pérez" o "ID ..." si el colaborador no tiene nombre copiado de TMR. */
export function nombreCambio(c: CambioTmr): string {
  return `${c.nombres ?? ''} ${c.apellidos ?? ''}`.trim() || 'Colaborador sin nombre';
}

/** Valor anterior → nuevo, tal como los guarda el backend. */
export function detalleCambio(c: CambioTmr): string {
  const proyecto = c.proyectoNombre ? `${c.proyectoNombre}: ` : '';
  if (c.valorAnterior === null && c.valorNuevo === null) return c.proyectoNombre ?? '';
  return `${proyecto}${c.valorAnterior ?? 'sin valor'} → ${c.valorNuevo ?? 'sin valor'}`;
}
