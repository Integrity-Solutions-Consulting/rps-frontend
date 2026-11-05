/**
 * Exportaciones que tiene rps-backend (Features/Exportaciones): archivos CSV para descargar.
 *   GET /api/exportaciones/honorarios?periodo=2026-11-01
 *   GET /api/exportaciones/liquidaciones?periodo=2026-11-01
 *   GET /api/exportaciones/colaboradores
 * Sin período, honorarios y liquidaciones traen todos los meses.
 */
export type TipoExportacion = 'honorarios' | 'liquidaciones' | 'colaboradores';

export interface ArchivoDescargado {
  nombre: string;
  contenido: Blob;
}
