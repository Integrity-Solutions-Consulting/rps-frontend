/**
 * Contrato con Features/Colaboradores del backend (rama sm-Desarrollo).
 * Los enums viajan como texto gracias a JsonStringEnumConverter.
 */

export type Clasificacion = 'Profesional' | 'Junior';
export type EstadoConfiguracion = 'Pendiente' | 'Configurado';
export type Frecuencia = 'DosPagos' | 'FinDeMes';

export interface ColaboradorResumen {
  id: string;
  /** Referencia a la persona en TMR. Los nombres llegarán con la sincronización. */
  tmrColaboradorId: string;
  clasificacion: Clasificacion | null;
  estadoConfiguracion: EstadoConfiguracion;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export interface FrecuenciaVigencia {
  id: string;
  frecuencia: Frecuencia;
  /** Primer día del mes, "2026-11-01". */
  vigenteDesdeMes: string;
}

export interface CuentaBancaria {
  id: string;
  banco: string | null;
  tipoCuenta: string | null;
  /** El backend nunca devuelve el número completo: "****1234". */
  numeroCuentaEnmascarado: string;
}

export interface ColaboradorDetalle extends ColaboradorResumen {
  frecuenciaVigente: FrecuenciaVigencia | null;
  cuentaBancaria: CuentaBancaria | null;
}

// ── Requests ─────────────────────────────────────────────────────────
export interface CrearColaboradorRequest {
  tmrColaboradorId: string;
  clasificacion: Clasificacion | null;
}

export interface RegistrarFrecuenciaRequest {
  frecuencia: Frecuencia;
  vigenteDesdeMes: string;
}

export interface RegistrarCuentaBancariaRequest {
  banco: string | null;
  tipoCuenta: string | null;
  numeroCuenta: string;
}

export interface FiltrosColaboradores {
  estado: EstadoConfiguracion | null;
  activo: boolean | null;
}

/** Movimiento del historial del colaborador (RN 48, sección 12 "Historial por colaborador"). */
export type TipoEvento =
  | 'Vinculación' | 'Clasificación' | 'Frecuencia' | 'Cuenta bancaria' | 'Estado' | 'Contrato' | 'Adenda' | 'Honorario'
  | 'Liquidación' | 'Anticipo' | 'Documento' | 'Exportación';

export interface EventoHistorial {
  fecha: string;
  tipo: TipoEvento;
  descripcion: string;
  usuario: string;
  /** Mes "yyyy-MM" al que corresponde el movimiento, si aplica. */
  periodo?: string | null;
  importe?: number | null;
  /**
   * Lo que pasó, con palabras exactas: "Calculada", "Exportado v1", "Programado"…
   * Un cambio de honorario no se etiqueta como exportación, ni una exportación como pago (sección 12).
   */
  estado?: string | null;
  /** Pantalla donde se ve el detalle del movimiento. */
  enlace?: { texto: string; ruta: string; query?: Record<string, string> } | null;
}

// ── Textos para pantalla ─────────────────────────────────────────────
export const ETIQUETA_FRECUENCIA: Record<Frecuencia, string> = {
  DosPagos: 'Quincena y fin de mes',
  FinDeMes: 'Solo fin de mes',
};

export const DETALLE_FRECUENCIA: Record<Frecuencia, string> = {
  DosPagos: '50 % en quincena y 50 % a fin de mes',
  FinDeMes: '100 % a fin de mes',
};

export const ETIQUETA_CLASIFICACION: Record<Clasificacion, string> = {
  Profesional: 'Servicios profesionales',
  Junior: 'Servicios junior',
};

export const DETALLE_CLASIFICACION: Record<Clasificacion, string> = {
  Profesional: 'Retención de IVA 100 %',
  Junior: 'Retención de IVA 70 %',
};

export const TIPOS_CUENTA = ['Ahorros', 'Corriente'] as const;
