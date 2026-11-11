/**
 * Contrato con Features/Colaboradores del backend (rama sm-Desarrollo).
 * Los enums viajan como texto gracias a JsonStringEnumConverter.
 */

export type Clasificacion = 'Profesional' | 'Junior';
export type EstadoConfiguracion = 'Pendiente' | 'Configurado';
export type Frecuencia = 'DosPagos' | 'FinDeMes';

export interface ColaboradorResumen {
  id: string;
  /** Referencia a la persona en TMR. */
  tmrColaboradorId: string;
  /** Copia de TMR (la llena la sincronización). Nulos si el colaborador se creó a mano. */
  nombres: string | null;
  apellidos: string | null;
  identificacion: string | null;
  correo: string | null;
  activoEnTmr: boolean | null;
  sincronizadoEn: string | null;
  eliminadoEnOrigen: boolean;
  clasificacion: Clasificacion | null;
  estadoConfiguracion: EstadoConfiguracion;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  /** Código del tipo de contrato en TMR: CON, PAS, MT, COS (FJ = afiliado, no factura). */
  tipoContratoTmr: string | null;
  /** true (CON/PAS): el tipo de servicio sale de TMR y no se elige en RPS. */
  clasificacionDesdeTmr: boolean;
}

/** Nombre del tipo de contrato de TMR, por código. */
export const ETIQUETA_TIPO_CONTRATO_TMR: Record<string, string> = {
  CON: 'Servicios profesionales',
  PAS: 'Servicios juniors',
  MT: 'Medio tiempo',
  COS: 'Consultor externo',
  FJ: 'Afiliado',
};

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

// Sin CrearColaboradorRequest a propósito (RN 03): un colaborador solo entra a RPS por sincronización con TMR.

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
  /** Nombre, apellido o identificación: la búsqueda la hace el backend. */
  busqueda?: string | null;
  /** Tipo de servicio (Profesional o Junior): lo filtra el backend. */
  clasificacion?: Clasificacion | null;
}

/** Movimiento del historial del colaborador (RN 48, sección 12 "Historial por colaborador"). */
export type TipoEvento =
  | 'Vinculación' | 'Frecuencia' | 'Contrato' | 'Adenda' | 'Honorario' | 'Liquidación' | 'Anticipo';

export interface EventoHistorial {
  fecha: string;
  tipo: TipoEvento;
  descripcion: string;
  /** Null si el backend todavía no captura quién hizo ese movimiento (no se inventa un autor). */
  usuario: string | null;
  /** Mes "yyyy-MM" al que corresponde el movimiento, si aplica. */
  periodo?: string | null;
  importe?: number | null;
  /**
   * Lo que pasó, como lo manda el backend: "Registrado", "Programado", "Calculada", "Revisada"…
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
