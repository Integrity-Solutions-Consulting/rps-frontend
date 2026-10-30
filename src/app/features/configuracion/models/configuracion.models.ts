/**
 * Parámetros del sistema que administra Contabilidad (sección 13, pantalla Configuración).
 * Cada cambio crea una vigencia nueva; los cálculos ya hechos guardan los valores que usaron (RN 29).
 * Endpoint propuesto: /api/configuracion (hoy responde el mock).
 */

export type ClaveParametro =
  | 'AlertasDias'
  | 'LimiteAnticiposPct'
  | 'IvaPct'
  | 'RetencionFuentePct'
  | 'RetencionIvaProfesionalPct'
  | 'RetencionIvaJuniorPct';

/** Desde cuándo rige un cambio. Las alertas no cambian importes: rigen de inmediato. */
export type AplicaDesde = 'Inmediato' | 'SiguienteMes';

export interface ParametroVigente {
  clave: ClaveParametro;
  /** Un solo número para porcentajes; varios para los días de alerta (30, 15, 7). */
  valores: number[];
  /** Mes "yyyy-MM" desde el que rige el valor actual. */
  vigenteDesde: string;
  /** Cambio registrado para un mes que aún no empieza. */
  programado: { valores: number[]; vigenteDesde: string } | null;
  aplicaDesde: AplicaDesde;
}

export interface CambioParametro {
  clave: ClaveParametro;
  anterior: number[] | null;
  nuevo: number[];
  vigenteDesde: string;
  registradoEn: string;
  usuario: string;
}

/** Qué sabe guardar quien responde (los datos de ejemplo sí; rps-backend todavía no). */
export interface CapacidadesConfiguracion {
  /** Cambios que rigen desde el mes siguiente y se pueden programar o cancelar. */
  vigencias: boolean;
  /** Días de alerta de vencimiento editables. */
  alertas: boolean;
  /** Catálogo de bancos editable. */
  bancos: boolean;
}

export interface Configuracion {
  capacidades: CapacidadesConfiguracion;
  parametros: ParametroVigente[];
  /** Catálogo de bancos para la pestaña Datos bancarios. */
  bancos: string[];
  historial: CambioParametro[];
}

export interface CambiarParametroRequest {
  valores: number[];
}

export const PARAMETROS: Record<ClaveParametro, { nombre: string; unidad: '%' | 'días'; ayuda: string }> = {
  AlertasDias: { nombre: 'Alertas de vencimiento', unidad: 'días', ayuda: 'Con cuántos días de anticipación se avisa que vence un contrato (RN 13).' },
  LimiteAnticiposPct: { nombre: 'Límite de anticipos adicionales', unidad: '%', ayuda: 'Porcentaje del neto mensual completo que pueden sumar los anticipos pendientes (RN 42, RN 43).' },
  IvaPct: { nombre: 'IVA', unidad: '%', ayuda: 'Sobre el subtotal del servicio.' },
  RetencionFuentePct: { nombre: 'Retención en la fuente', unidad: '%', ayuda: 'Sobre el subtotal del servicio.' },
  RetencionIvaProfesionalPct: { nombre: 'Retención de IVA · profesional', unidad: '%', ayuda: 'Sobre el IVA, para servicios profesionales.' },
  RetencionIvaJuniorPct: { nombre: 'Retención de IVA · junior', unidad: '%', ayuda: 'Sobre el IVA, para servicios junior.' },
};

/** "30, 15, 7 días" o "15 %". */
export function textoValores(clave: ClaveParametro, valores: number[] | null): string {
  if (!valores?.length) return '—';
  const unidad = PARAMETROS[clave].unidad;
  return unidad === '%' ? `${valores.join(', ')} %` : `${valores.join(', ')} días`;
}
