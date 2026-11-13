/**
 * Reportes de rps-backend (Features/Exportaciones), en Excel (.xlsx) o PDF. Las descargas son POST porque,
 * además del archivo, registran la exportación en el historial "Exportaciones recientes":
 *   POST /api/exportaciones/{honorarios|liquidaciones}[/pdf]   { periodo: "2026-11-01" | null, vista? }
 *   POST /api/exportaciones/colaboradores[/pdf]
 *   GET  /api/exportaciones/historial?periodo=&todos=&tipo=&pagina=&tamano=
 *   GET  /api/exportaciones/ultimas?periodo=
 * Sin período, honorarios y liquidaciones traen todos los meses.
 */
export type TipoExportacion = 'honorarios' | 'liquidaciones' | 'colaboradores';

export type FormatoExportacion = 'xlsx' | 'pdf';

/** Solo liquidaciones: el conglomerado (una fila por colaborador) o el detalle de cada colaborador. */
export type VistaLiquidaciones = 'consolidado' | 'porColaborador';

export interface ArchivoDescargado {
  nombre: string;
  contenido: Blob;
}

/** Una fila del historial. El backend no guarda el archivo: "Volver a generar" lo arma con los datos actuales. */
export interface ExportacionRegistrada {
  id: string;
  tipo: TipoExportacion;
  vista: VistaLiquidaciones | null;
  formato: FormatoExportacion;
  /** Primer día del mes ("2026-11-01"); null = todos los meses (y siempre en colaboradores). */
  periodo: string | null;
  nombreArchivo: string;
  registros: number;
  totalNeto: number | null;
  usuario: string | null;
  generadoEn: string;
  /** true: los datos del reporte cambiaron desde esta exportación; false: iguales; null: no se pudo comprobar. */
  datosCambiaron: boolean | null;
}

export interface PaginaExportaciones {
  items: ExportacionRegistrada[];
  total: number;
  pagina: number;
  tamano: number;
}

/** La última exportación de un reporte para el mes elegido. */
export interface UltimaExportacion {
  tipo: TipoExportacion;
  vista: VistaLiquidaciones | null;
  formato: FormatoExportacion;
  generadoEn: string;
  usuario: string | null;
}

/** Qué mes muestra el historial: un mes, las exportaciones de "todos los meses" (null) o todo. */
export interface FiltroHistorial {
  periodo: string | null;
  todos: boolean;
  tipo: TipoExportacion | null;
  pagina: number;
  tamano: number;
}
