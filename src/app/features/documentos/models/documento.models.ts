/**
 * Documento tributario mensual, como lo guarda rps-backend
 * (/api/colaboradores/{id}/documentos-mensuales): tipo, número y fecha de emisión.
 */

export type TipoDocumento = 'Factura' | 'NotaDeVenta';

/** Un honorario del mes que cubre el documento. */
export interface DetalleDocumento {
  tmrProyectoId: string;
  proyecto: string;
  /** Total del documento de ese honorario (subtotal + IVA, calculado por el backend). */
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
  detalle: DetalleDocumento[];
  registradoEn: string;
}

/** Una fila de la lista: el documento esperado de un colaborador en el mes. */
export interface FilaDocumento {
  colaboradorId: string;
  colaborador: string;
  periodo: string;
  /** Honorarios del mes del colaborador, con su total de documento. */
  proyectos: DetalleDocumento[];
  documento: DocumentoMensual | null;
}

export interface RegistrarDocumentoRequest {
  colaboradorId: string;
  periodo: string;
  tipo: TipoDocumento;
  numero: string;
  fechaEmision: string;
}

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  Factura: 'Factura',
  NotaDeVenta: 'Nota de venta',
};
