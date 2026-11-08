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

/**
 * El Excel de pago por corte (RN 52-57): POST .../exportaciones/pago genera una versión nueva
 * para (periodo, corte); GET .../preview muestra importes y advertencias antes de generar;
 * GET .../{id}/descargar lee el archivo ya guardado, nunca lo regenera.
 */
import { TipoCorte } from '../../../shared/models/corte';

export interface ItemExportacionPago {
  colaboradorId: string;
  colaborador: string;
  importe: number;
  tieneCuentaBancaria: boolean;
  advertencias: string[];
}

export interface PreviewExportacionPago {
  /** "yyyy-MM" */
  periodo: string;
  corte: TipoCorte;
  versionSiguiente: number;
  items: ItemExportacionPago[];
  total: number;
}

export interface ExportacionPago {
  id: string;
  /** "yyyy-MM" */
  periodo: string;
  corte: TipoCorte;
  version: number;
  /** true si la generó el usuario de la sesión actual (no hay directorio de usuarios en el frontend). */
  generadoPorMi: boolean;
  generadoEn: string;
  nombreArchivo: string;
  total: number;
  colaboradores: number;
}
