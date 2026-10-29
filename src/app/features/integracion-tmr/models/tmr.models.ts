/**
 * Datos que RPS lee de TMR. Según la Propuesta de arquitectura, el backend los guarda en sus
 * tablas espejo (tmr_colaborador, tmr_asignacion) y los expone en /api/integracion-tmr.
 * Son de solo lectura en RPS (RN 01): se cambian en TMR.
 */

export interface TmrColaborador {
  tmrColaboradorId: string;
  nombres: string;
  apellidos: string;
  identificacion: string;
  correo: string | null;
  /** Estado de la persona en TMR. */
  activo: boolean;
  /** Última vez que RPS copió los datos de TMR. */
  ultimaSincronizacion: string;
}

export interface TmrAsignacion {
  tmrAsignacionId: string;
  tmrProyectoId: string;
  proyecto: string;
  cliente: string | null;
  fechaAsignacion: string | null;
  /** null = sin fecha de salida. */
  fechaFinAsignacion: string | null;
}

export interface TmrColaboradorDetalle extends TmrColaborador {
  asignaciones: TmrAsignacion[];
}

/** "Ana" + "Pérez" → "Ana Pérez". */
export function nombreCompleto(p: Pick<TmrColaborador, 'nombres' | 'apellidos'>): string {
  return `${p.nombres} ${p.apellidos}`.trim();
}

/** Muestra solo los primeros 4 dígitos de la identificación: "1723******". */
export function identificacionEnmascarada(identificacion: string): string {
  return identificacion.length <= 4 ? identificacion : identificacion.slice(0, 4) + '*'.repeat(identificacion.length - 4);
}

/** Una asignación está activa si no tiene salida o la salida es hoy o después. */
export function asignacionActiva(a: TmrAsignacion, hoy: string): boolean {
  return a.fechaFinAsignacion === null || a.fechaFinAsignacion >= hoy;
}
