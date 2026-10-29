import { TmrColaborador, TmrColaboradorDetalle } from '../../features/integracion-tmr/models/tmr.models';
import { RespuestaMock } from './colaboradores.mock';
import { enDias } from './fechas';

/**
 * Lo que tendría RPS en sus tablas espejo de TMR (tmr_colaborador y tmr_asignacion)
 * después de sincronizar. Los IDs de TMR coinciden con los de colaboradores.mock.ts.
 */

export interface TmrPersonaMock {
  tmrColaboradorId: string;
  nombres: string;
  apellidos: string;
  identificacion: string;
  correo: string;
  activo: boolean;
}

export interface TmrAsignacionMock {
  tmrAsignacionId: string;
  tmrColaboradorId: string;
  tmrProyectoId: string;
  proyecto: string;
  cliente: string | null;
  fechaAsignacion: string | null;
  fechaFinAsignacion: string | null;
  /** Registro activo en TMR (una asignación borrada en TMR queda en false). */
  activa: boolean;
}

export const TMR_PERSONAS: TmrPersonaMock[] = [
  { tmrColaboradorId: '1', nombres: 'Ana', apellidos: 'Pérez', identificacion: '1723456789', correo: 'ana.perez@example.com', activo: true },
  { tmrColaboradorId: '2', nombres: 'Luis', apellidos: 'Gómez', identificacion: '1712345678', correo: 'luis.gomez@example.com', activo: true },
  { tmrColaboradorId: '3', nombres: 'María', apellidos: 'Castro', identificacion: '1709876543', correo: 'maria.castro@example.com', activo: true },
  { tmrColaboradorId: '4', nombres: 'Diego', apellidos: 'Rivas', identificacion: '1718765432', correo: 'diego.rivas@example.com', activo: true },
  { tmrColaboradorId: '5', nombres: 'Sofía', apellidos: 'Cordero', identificacion: '1720987654', correo: 'sofia.cordero@example.com', activo: true },
  { tmrColaboradorId: '9', nombres: 'Elena', apellidos: 'Palacios', identificacion: '1719012345', correo: 'elena.palacios@example.com', activo: false },
  { tmrColaboradorId: '10', nombres: 'Nicolás', apellidos: 'Paredes', identificacion: '1721234567', correo: 'nicolas.paredes@example.com', activo: true },
];

export const TMR_ASIGNACIONES: TmrAsignacionMock[] = [
  // Ana Pérez: dos proyectos a la vez y uno terminado.
  { tmrAsignacionId: '1001', tmrColaboradorId: '1', tmrProyectoId: '201', proyecto: 'Marketing Digital', cliente: 'Comercial Andina', fechaAsignacion: '2026-01-01', fechaFinAsignacion: enDias(25), activa: true },
  { tmrAsignacionId: '1002', tmrColaboradorId: '1', tmrProyectoId: '202', proyecto: 'Consultoría RPS', cliente: 'Integrity Solutions', fechaAsignacion: '2026-03-01', fechaFinAsignacion: null, activa: true },
  { tmrAsignacionId: '1012', tmrColaboradorId: '1', tmrProyectoId: '206', proyecto: 'Rediseño Portal Clientes', cliente: 'Comercial Andina', fechaAsignacion: '2026-05-01', fechaFinAsignacion: '2026-09-30', activa: true },
  { tmrAsignacionId: '1003', tmrColaboradorId: '2', tmrProyectoId: '202', proyecto: 'Consultoría RPS', cliente: 'Integrity Solutions', fechaAsignacion: '2025-03-15', fechaFinAsignacion: null, activa: true },
  { tmrAsignacionId: '1004', tmrColaboradorId: '3', tmrProyectoId: '205', proyecto: 'App Móvil Clientes', cliente: 'Banco del Litoral', fechaAsignacion: '2026-02-01', fechaFinAsignacion: null, activa: true },
  { tmrAsignacionId: '1005', tmrColaboradorId: '4', tmrProyectoId: '203', proyecto: 'Consultoría Tributaria', cliente: 'Grupo Sierra', fechaAsignacion: '2026-01-10', fechaFinAsignacion: null, activa: true },
  { tmrAsignacionId: '1006', tmrColaboradorId: '4', tmrProyectoId: '204', proyecto: 'Análisis Financiero Q4', cliente: 'Grupo Sierra', fechaAsignacion: enDias(-20), fechaFinAsignacion: null, activa: true },
  { tmrAsignacionId: '1007', tmrColaboradorId: '5', tmrProyectoId: '204', proyecto: 'Análisis Financiero Q4', cliente: 'Grupo Sierra', fechaAsignacion: '2026-04-01', fechaFinAsignacion: '2026-12-31', activa: true },
  { tmrAsignacionId: '1010', tmrColaboradorId: '9', tmrProyectoId: '208', proyecto: 'Soporte TI', cliente: 'Integrity Solutions', fechaAsignacion: '2025-01-15', fechaFinAsignacion: '2025-12-31', activa: true },
  { tmrAsignacionId: '1011', tmrColaboradorId: '10', tmrProyectoId: '208', proyecto: 'Soporte TI', cliente: 'Integrity Solutions', fechaAsignacion: '2026-04-15', fechaFinAsignacion: null, activa: true },
];

/** Fecha de la última sincronización simulada: hoy a las 06:00. */
function ultimaSincronizacion(): string {
  const d = new Date();
  d.setHours(6, 0, 0, 0);
  return d.toISOString();
}

function aColaborador(p: TmrPersonaMock): TmrColaborador {
  return {
    tmrColaboradorId: p.tmrColaboradorId, nombres: p.nombres, apellidos: p.apellidos,
    identificacion: p.identificacion, correo: p.correo, activo: p.activo, ultimaSincronizacion: ultimaSincronizacion(),
  };
}

export function nombreTmr(tmrColaboradorId: string): string {
  const p = TMR_PERSONAS.find((x) => x.tmrColaboradorId === tmrColaboradorId);
  return p ? `${p.nombres} ${p.apellidos}` : `Colaborador ${tmrColaboradorId}`;
}

export function asignacionTmr(tmrColaboradorId: string, tmrProyectoId: string): TmrAsignacionMock | null {
  return TMR_ASIGNACIONES.find((a) => a.activa && a.tmrColaboradorId === tmrColaboradorId && a.tmrProyectoId === tmrProyectoId) ?? null;
}

export function asignacionesDe(tmrColaboradorId: string): TmrAsignacionMock[] {
  return TMR_ASIGNACIONES.filter((a) => a.activa && a.tmrColaboradorId === tmrColaboradorId);
}

// ── Endpoints /api/integracion-tmr/colaboradores ──────────────────────
export function tmrColaboradores(): RespuestaMock {
  return { status: 200, body: TMR_PERSONAS.map(aColaborador) };
}

export function tmrColaborador(tmrColaboradorId: string): RespuestaMock {
  const p = TMR_PERSONAS.find((x) => x.tmrColaboradorId === tmrColaboradorId);
  if (!p) {
    return {
      status: 404,
      body: { title: 'No encontrado', status: 404, codigo: 'Tmr.ColaboradorNoEncontrado',
        detail: `La copia de TMR no tiene un colaborador con ID '${tmrColaboradorId}'. Puede que aún no se haya sincronizado.` },
    };
  }
  const body: TmrColaboradorDetalle = {
    ...aColaborador(p),
    asignaciones: asignacionesDe(tmrColaboradorId)
      .map((a) => ({
        tmrAsignacionId: a.tmrAsignacionId, tmrProyectoId: a.tmrProyectoId, proyecto: a.proyecto, cliente: a.cliente,
        fechaAsignacion: a.fechaAsignacion, fechaFinAsignacion: a.fechaFinAsignacion,
      }))
      .sort((x, y) => (y.fechaAsignacion ?? '').localeCompare(x.fechaAsignacion ?? '')),
  };
  return { status: 200, body };
}
