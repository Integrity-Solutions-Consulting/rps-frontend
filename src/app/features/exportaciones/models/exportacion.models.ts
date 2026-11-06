/**
 * Exportaciones que tiene rps-backend (Features/Exportaciones): archivos CSV para descargar.
 *   GET /api/exportaciones/honorarios?periodo=2026-11-01
 *   GET /api/exportaciones/liquidaciones?periodo=2026-11-01
 *   GET /api/exportaciones/liquidaciones/pdf?periodo=2026-11-01   (PDF formal con logo y totales)
 *   GET /api/exportaciones/honorarios/pdf?periodo=2026-11-01
 *   GET /api/exportaciones/colaboradores
 *   GET /api/exportaciones/colaboradores/pdf
 * Sin período, honorarios y liquidaciones traen todos los meses.
 */
export type TipoExportacion = 'honorarios' | 'liquidaciones' | 'colaboradores';

export type FormatoExportacion = 'csv' | 'pdf';

export interface ArchivoDescargado {
  nombre: string;
  contenido: Blob;
}
