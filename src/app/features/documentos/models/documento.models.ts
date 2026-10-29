/**
 * Documento tributario mensual (sección 8 de los requisitos).
 * Uno por colaborador y mes, aunque tenga dos pagos o varios proyectos (RN 32).
 * Su falta se advierte pero no impide exportar (RN 35, RN 57).
 * Endpoint propuesto: /api/documentos.
 */

export type TipoDocumento = 'Factura' | 'NotaDeVenta';

/** Qué proyecto y qué valor cubre el documento, para no duplicarlos (RN 34). */
export interface DetalleDocumento {
  tmrProyectoId: string;
  proyecto: string;
  /** Total del documento calculado para ese proyecto (subtotal + IVA). */
  importe: number;
}

export interface DocumentoMensual {
  id: string;
  colaboradorId: string;
  periodo: string;
  tipo: TipoDocumento;
  /** Formato del SRI: 001-001-000001234. */
  numero: string;
  fechaEmision: string;
  observaciones: string | null;
  detalle: DetalleDocumento[];
  registradoEn: string;
  usuario: string;
  /** Veces que se corrigió. Las versiones anteriores se conservan. */
  correcciones: number;
}

/** Una fila de la lista: el documento esperado de un colaborador en el mes. */
export interface FilaDocumento {
  colaboradorId: string;
  colaborador: string;
  periodo: string;
  /** Total de documento calculado en la liquidación (lo que se espera recibir). */
  totalCalculado: number | null;
  /** Proyectos y valores de la liquidación que debe cubrir el documento. */
  proyectos: DetalleDocumento[];
  documento: DocumentoMensual | null;
}

export interface RegistrarDocumentoRequest {
  colaboradorId: string;
  periodo: string;
  tipo: TipoDocumento;
  numero: string;
  fechaEmision: string;
  observaciones: string | null;
}

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  Factura: 'Factura',
  NotaDeVenta: 'Nota de venta',
};
