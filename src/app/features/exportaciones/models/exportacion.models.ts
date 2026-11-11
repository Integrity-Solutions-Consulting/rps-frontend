/**
 * Reportes de rps-backend (Features/Exportaciones), en Excel (.xlsx) o PDF:
 *   GET /api/exportaciones/{honorarios|liquidaciones}?periodo=2026-11-01        (Excel)
 *   GET /api/exportaciones/{honorarios|liquidaciones}/pdf?periodo=2026-11-01    (PDF)
 *   GET /api/exportaciones/colaboradores   ·   GET /api/exportaciones/colaboradores/pdf
 * Sin período, honorarios y liquidaciones traen todos los meses.
 */
export type TipoExportacion = 'honorarios' | 'liquidaciones' | 'colaboradores';

export type FormatoExportacion = 'xlsx' | 'pdf';

export interface ArchivoDescargado {
  nombre: string;
  contenido: Blob;
}
