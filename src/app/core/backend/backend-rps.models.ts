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
  clasificacion: Clasificacion | null;
  estadoConfiguracion: EstadoConfiguracion;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  frecuenciaVigente?: { id: string; frecuencia: Frecuencia; vigenteDesdeMes: string } | null;
  cuentaBancaria?: { id: string; banco: string | null; tipoCuenta: string | null; numeroCuentaEnmascarado: string } | null;
}

export interface BeProyecto { id: string; nombre: string; cliente: string | null; activo: boolean; creadoEn: string }

export interface BeAsignacion {
  id: string; colaboradorId: string; proyectoId: string; proyectoNombre: string;
  fechaInicio: string; fechaSalida: string | null;
}

export interface BeContrato {
  id: string; colaboradorId: string; proyectoId: string; proyectoNombre: string;
  fechaInicio: string; fechaFin: string; fechaFinVigente: string;
  referencia: string | null; observaciones: string | null; vigente: boolean;
}

export interface BeAdenda { id: string; contratoId: string; nuevaFechaFin: string; fechaRegistro: string; observaciones: string | null }

/** GET /api/colaboradores/{id}/condiciones-economicas/historial (incluye canceladas). */
export interface BeCondicion {
  id: string; colaboradorId: string; proyectoId: string; proyectoNombre: string; contratoId: string;
  importeMensual: number; modalidad: Modalidad; mesInicioVigencia: string; observaciones: string | null;
  creadoEn: string; canceladoEn: string | null;
}

export interface BeHonorario {
  id: string; colaboradorId: string; proyectoId: string; contratoId: string; periodo: string;
  diasReales: number; diasReconocidos: number; modalidad: Modalidad; proporcionalAcordado: number;
  subtotal: number; iva: number; totalDocumento: number; retencionFuente: number; retencionIva: number;
  totalRetenciones: number; neto: number; liquidacionId: string | null; creadoEn: string;
}

export interface BeCorte { id: string; tipo: TipoCorte; valorBase: number; recuperacionAdicional: number; valorPreparado: number }

export interface BeLiquidacion {
  id: string; colaboradorId: string; periodo: string; netoConsolidado: number;
  revisado: boolean; revisadoEn: string | null; creadoEn: string; cortes: BeCorte[];
}

export interface BeLiquidacionDetalle extends BeLiquidacion { honorarios: BeHonorario[] }

export interface BeCuota { id: string; periodo: string; corte: TipoCorte; importe: number }

export interface BeAnticipo {
  id: string; colaboradorId: string; monto: number; fecha: string; observaciones: string | null;
  saldoPendiente: number; cuotas: BeCuota[]; creadoEn: string;
}

export interface BeDocumento {
  id: string; colaboradorId: string; periodo: string; tipo: 'Factura' | 'NotaDeVenta';
  numero: string; fechaEmision: string; marcadoEn: string;
}

export interface BeConfiguracion {
  id: string; razonSocial: string; ruc: string; moneda: string;
  diaPagoFinDeMes: number; diaPagoDosPagos1: number; diaPagoDosPagos2: number;
  porcentajeMaximoAnticipo: number; porcentajeIva: number; porcentajeRetencionFuente: number;
  porcentajeRetencionIvaProfesional: number; porcentajeRetencionIvaJunior: number; actualizadoEn: string;
}
