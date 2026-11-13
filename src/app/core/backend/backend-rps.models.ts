/**
 * Respuestas tal como las devuelve rps-backend (Features/<Modulo>/Application/*Dtos.cs).
 * Los servicios de cada módulo las convierten a los modelos de pantalla (features/<modulo>/models).
 * Si el backend cambia un campo, se cambia aquí y en el servicio que lo convierte; las pantallas no.
 */

import { Clasificacion, EstadoConfiguracion, Frecuencia } from '../../features/colaboradores/models/colaborador.models';
import { Modalidad } from '../../features/honorarios/models/honorario.models';
import { TipoCorte } from '../../shared/models/corte';

export interface BeColaborador {
  id: string;
  tmrColaboradorId: string;
  /** Copia de TMR (la llena la sincronización). Nulos solo antes de la primera sincronización. */
  nombres: string | null;
  apellidos: string | null;
  identificacion: string | null;
  correo: string | null;
  activoEnTmr: boolean | null;
  sincronizadoEn: string | null;
  /** Ya no viene de TMR: se conserva para el historial (RN 07). */
  eliminadoEnOrigen: boolean;
  clasificacion: Clasificacion | null;
  estadoConfiguracion: EstadoConfiguracion;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  frecuenciaVigente?: { id: string; frecuencia: Frecuencia; vigenteDesdeMes: string } | null;
  cuentaBancaria?: { id: string; banco: string | null; tipoCuenta: string | null; numeroCuentaEnmascarado: string } | null;
}

export interface BeProyecto {
  id: string; tmrProyectoId: string | null; nombre: string; cliente: string | null; activo: boolean;
  sincronizadoEn: string | null; eliminadoEnOrigen: boolean; creadoEn: string;
}

export interface BeAsignacion {
  id: string; colaboradorId: string; proyectoId: string; proyectoNombre: string;
  fechaInicio: string; fechaSalida: string | null;
  /** null = creada a mano en RPS. eliminadaEnOrigen = ya no viene de TMR y no cuenta en cálculos nuevos (RN 22). */
  sincronizadaEn: string | null; eliminadaEnOrigen: boolean;
}

/** POST /api/integracion-tmr/sincronizar */
export interface BeSincronizacionTmr {
  sincronizadoEn: string;
  proyectos: BeConteoSincronizacion;
  colaboradores: BeConteoSincronizacion;
  asignaciones: BeConteoSincronizacion;
  cambiosDetectados: number;
  asignacionesOmitidas: { idEmpleado: number; idProyecto: number; motivo: string }[];
}
export interface BeConteoSincronizacion { creados: number; actualizados: number; marcadosEliminados: number }

/** GET /api/integracion-tmr/estado */
export interface BeEstadoTmr {
  automaticaHabilitada: boolean;
  intervaloMinutos: number;
  ultimaSincronizacion: string | null;
  desactualizada: boolean;
}

/** GET /api/integracion-tmr/cambios · aviso de un cambio detectado en TMR (RN 50). */
export type TipoCambioTmr =
  | 'AsignacionNueva' | 'AsignacionEliminada' | 'AsignacionRestaurada' | 'FechaSalida'
  | 'EstadoColaborador' | 'ColaboradorEliminado' | 'ColaboradorRestaurado' | 'DesactivacionRetenida' | 'TipoContrato';

export interface BeCambioTmr {
  id: string; colaboradorId: string; nombres: string | null; apellidos: string | null;
  proyectoId: string | null; proyectoNombre: string | null; tipo: TipoCambioTmr;
  valorAnterior: string | null; valorNuevo: string | null; periodoDesde: string | null; detectadoEn: string;
  /** Hay una liquidación (revisada o no) desde periodoDesde en adelante. */
  tieneLiquidacion: boolean; tieneLiquidacionRevisada: boolean;
  revisado: boolean; revisadoEn: string | null; revisadoPorUsuarioId: string | null;
}

/** GET /api/dashboard?periodo=2026-11-01 (DashboardService de rps-backend). */
export interface BeDashboard {
  periodo: string | null;
  colaboradores: { configurados: number; pendientes: number; activos: number; inactivos: number };
  honorarios: { cantidad: number; netoTotal: number };
  liquidaciones: { revisadas: number; sinRevisar: number };
  anticipos: { conSaldoPendiente: number; montoPendiente: number };
  /** RN 13: plazos configurables (Configuración) y cuántos contratos vencen dentro de cada uno. */
  contratosPorVencer: { diasAviso1: number; diasAviso2: number; diasAviso3: number; enAviso1: number; enAviso2: number; enAviso3: number };
}

export interface BeProyectoDeContrato { proyectoId: string; proyectoNombre: string }

/** proyectos: 0, 1 o varios — un contrato puede cubrir varios proyectos, o ninguno (RR. HH.). */
export interface BeContrato {
  id: string; colaboradorId: string; proyectos: BeProyectoDeContrato[];
  /** Null: contrato indefinido (sin fecha de fin). */
  fechaInicio: string; fechaFin: string | null; fechaFinVigente: string | null;
  referencia: string | null; observaciones: string | null; vigente: boolean;
}

export interface BeAdenda {
  id: string; contratoId: string; nuevaFechaFin: string | null; fechaRegistro: string; observaciones: string | null;
  cambios: string | null;
}

/** GET /api/colaboradores/{id}/condiciones-economicas (de la más reciente a la más antigua). */
export interface BeCondicion {
  /** proyectoId null: el contrato se paga por contrato (un solo importe fijo, sin proyecto). */
  id: string; colaboradorId: string; proyectoId: string | null; proyectoNombre: string | null; contratoId: string;
  importeMensual: number; modalidad: Modalidad; mesInicioVigencia: string; observaciones: string | null;
}

export interface BeHonorario {
  /** proyectoId null: honorario de un contrato que se paga por contrato. */
  id: string; colaboradorId: string; proyectoId: string | null; contratoId: string; periodo: string;
  diasReales: number; diasReconocidos: number; modalidad: Modalidad; proporcionalAcordado: number;
  subtotal: number; iva: number; totalDocumento: number; retencionFuente: number; retencionIva: number;
  totalRetenciones: number; neto: number; liquidacionId: string | null; creadoEn: string;
}

export interface BeCorte {
  id: string; tipo: TipoCorte; valorBase: number; recuperacionAdicional: number; valorPreparado: number;
  /** > 0: el anticipo programado no cupo completo en este corte (no se oculta, se muestra). */
  recuperacionNoAplicada: number;
  /** > 0: la quincena se redujo porque el mes resultó más corto de lo previsto (salida, RN 27). */
  ajustePorProrrateo: number;
}

export interface BeLiquidacion {
  id: string; colaboradorId: string; periodo: string; netoConsolidado: number;
  revisado: boolean; revisadoEn: string | null; revisadoPorUsuarioId: string | null; creadoEn: string; cortes: BeCorte[];
  /** Cambió después de calculada (anticipo, honorarios tardíos…); se limpia al volver a revisarla. */
  modificadaEn: string | null; motivoModificacion: string | null;
  /** Estaba revisada y por el cambio volvió a "Por revisar". */
  revisionAnulada: boolean;
}

export interface BeLiquidacionDetalle extends BeLiquidacion { honorarios: BeHonorario[] }

export interface BeCuota { id: string; periodo: string; corte: TipoCorte; importe: number }

export interface BeAnticipo {
  id: string; colaboradorId: string; monto: number; fecha: string; observaciones: string | null;
  saldoPendiente: number; cuotas: BeCuota[]; creadoPor: string; creadoEn: string;
}

/** GET /api/colaboradores/{id}/anticipos/resumen · mismos cálculos con los que el backend valida. */
export interface BeResumenAnticipos {
  colaboradorId: string; activo: boolean; netoMensualCompleto: number; porcentajeMaximoAnticipo: number;
  limite: number; saldoPendiente: number; disponible: number; periodo: string; cortesPermitidos: TipoCorte[];
  /** Tope de descuento por corte del mes: lo que se le paga ahí menos lo ya programado por sus anticipos. */
  topesPorCorte: BeTopeCorte[];
  /** Pasó el día 15 del mes: la quincena ya se pagó y solo se descuenta de lo que le queda (fin de mes). */
  quincenaCerrada: boolean;
}

/** valorBase: quincena = 50 % del subtotal; fin de mes = neto − quincena (o neto completo si cobra solo a fin de mes). */
export interface BeTopeCorte { corte: TipoCorte; valorBase: number; comprometido: number; disponible: number }

export interface BeConfiguracion {
  id: string; razonSocial: string; ruc: string; moneda: string;
  diaPagoFinDeMes: number; diaPagoDosPagos1: number; diaPagoDosPagos2: number;
  porcentajeMaximoAnticipo: number; porcentajeIva: number; porcentajeRetencionFuente: number;
  porcentajeRetencionIvaProfesional: number; porcentajeRetencionIvaJunior: number; actualizadoEn: string;
}
