/**
 * Configuración global de rps-backend (Features/Configuracion): un solo registro.
 * GET /api/configuracion y PUT /api/configuracion (se envía el registro completo).
 * Los cambios rigen de inmediato; el backend valida rangos y largos.
 */
export interface Configuracion {
  id: string;
  razonSocial: string;
  ruc: string;
  moneda: string;
  diaPagoFinDeMes: number;
  diaPagoDosPagos1: number;
  diaPagoDosPagos2: number;
  porcentajeMaximoAnticipo: number;
  porcentajeIva: number;
  porcentajeRetencionFuente: number;
  porcentajeRetencionIvaProfesional: number;
  porcentajeRetencionIvaJunior: number;
  actualizadoEn: string;
}

export type ActualizarConfiguracionRequest = Omit<Configuracion, 'id' | 'actualizadoEn'>;

/** Campos del formulario, en el orden en que se muestran. */
export const CAMPOS_CONFIGURACION: { clave: keyof ActualizarConfiguracionRequest; etiqueta: string; tipo: 'texto' | 'entero' | 'porcentaje'; grupo: string }[] = [
  { clave: 'razonSocial', etiqueta: 'Razón social', tipo: 'texto', grupo: 'Empresa' },
  { clave: 'ruc', etiqueta: 'RUC', tipo: 'texto', grupo: 'Empresa' },
  { clave: 'moneda', etiqueta: 'Moneda', tipo: 'texto', grupo: 'Empresa' },
  { clave: 'diaPagoDosPagos1', etiqueta: 'Día de pago de la quincena', tipo: 'entero', grupo: 'Días de pago' },
  { clave: 'diaPagoDosPagos2', etiqueta: 'Día de pago de fin de mes (dos pagos)', tipo: 'entero', grupo: 'Días de pago' },
  { clave: 'diaPagoFinDeMes', etiqueta: 'Día de pago (solo fin de mes)', tipo: 'entero', grupo: 'Días de pago' },
  { clave: 'porcentajeMaximoAnticipo', etiqueta: 'Límite de anticipos (% del neto mensual)', tipo: 'porcentaje', grupo: 'Anticipos' },
  { clave: 'porcentajeIva', etiqueta: 'IVA', tipo: 'porcentaje', grupo: 'Impuestos' },
  { clave: 'porcentajeRetencionFuente', etiqueta: 'Retención en la fuente', tipo: 'porcentaje', grupo: 'Impuestos' },
  { clave: 'porcentajeRetencionIvaProfesional', etiqueta: 'Retención de IVA · profesional', tipo: 'porcentaje', grupo: 'Impuestos' },
  { clave: 'porcentajeRetencionIvaJunior', etiqueta: 'Retención de IVA · junior', tipo: 'porcentaje', grupo: 'Impuestos' },
];
