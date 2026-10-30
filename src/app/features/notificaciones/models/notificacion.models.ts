/**
 * Bandeja de notificaciones (campana de la cabecera). Junta en un solo lugar lo que necesita
 * atención: configuración incompleta, contratos por vencer, documentos faltantes, liquidaciones
 * por recalcular y cambios de TMR (RN 13, RN 35, RN 50, RN 06).
 * Endpoint propuesto: GET /api/notificaciones?periodo=yyyy-MM.
 */

export type TipoNotificacion = 'Configuracion' | 'Contrato' | 'Documento' | 'Liquidacion' | 'Tmr' | 'Anticipo';
export type Severidad = 'Critica' | 'Advertencia' | 'Info';

export interface Notificacion {
  id: string;
  tipo: TipoNotificacion;
  severidad: Severidad;
  /** Persona afectada; null si es general. */
  colaboradorId: string | null;
  /** Lo envía rps-backend para poner el nombre de TMR (el backend aún no conoce nombres). */
  tmrColaboradorId?: string | null;
  colaborador: string | null;
  titulo: string;
  mensaje: string;
  fecha: string;
  /** Pantalla donde se resuelve. */
  ruta: string;
  query: Record<string, string> | null;
}

export const ETIQUETA_TIPO: Record<TipoNotificacion, string> = {
  Configuracion: 'Configuración incompleta',
  Contrato: 'Contratos',
  Documento: 'Documentos',
  Liquidacion: 'Liquidaciones',
  Tmr: 'Cambios de TMR',
  Anticipo: 'Anticipos',
};

/** Orden: primero lo crítico, luego advertencias, luego informativo. */
export const PESO_SEVERIDAD: Record<Severidad, number> = { Critica: 0, Advertencia: 1, Info: 2 };
