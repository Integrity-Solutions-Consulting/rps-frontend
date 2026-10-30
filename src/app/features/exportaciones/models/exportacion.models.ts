import { TipoCorte } from '../../../shared/models/corte';

/**
 * Exportación del Excel de pago (sección 12 de los requisitos).
 * RPS prepara el archivo; el pago se hace fuera del sistema (RN 52).
 * Exportar no marca nada como pagado ni da por recuperados los anticipos (RN 56).
 * Endpoint propuesto: /api/exportaciones.
 */

/** Un colaborador que se puede incluir en el archivo de un corte. */
export interface CandidatoExportacion {
  liquidacionId: string;
  colaboradorId: string;
  /** Lo envía rps-backend para poner el nombre de TMR (el backend aún no conoce nombres). */
  tmrColaboradorId?: string;
  colaborador: string;
  /** Importe consolidado del corte, ya con los anticipos descontados (RN 54). */
  valor: number;
  banco: string | null;
  cuenta: string | null;
  revisado: boolean;
  documentoRegistrado: boolean;
  requiereRecalculo: boolean;
  /** Si ya salió en una versión anterior de este corte (control propuesto: advertir repeticiones). */
  versionExportada: number | null;
  advertencias: string[];
}

export interface PreparacionExportacion {
  periodo: string;
  corte: TipoCorte;
  /** false si todavía no se calcula el mes. */
  calculado: boolean;
  candidatos: CandidatoExportacion[];
  /** Versión que se generará. */
  siguienteVersion: number;
}

export interface FilaExportada {
  colaboradorId: string;
  tmrColaboradorId?: string;
  colaborador: string;
  valor: number;
  banco: string | null;
  cuenta: string | null;
}

export interface Exportacion {
  id: string;
  periodo: string;
  corte: TipoCorte;
  version: number;
  generadaEn: string;
  usuario: string;
  filas: FilaExportada[];
  total: number;
  /** La última versión del mes y corte (la que vale para preparar el pago). */
  vigente: boolean;
  /** Algún importe cambió después de generarla (control propuesto). */
  desactualizada: boolean;
  nombreArchivo: string;
}

export interface GenerarExportacionRequest {
  periodo: string;
  corte: TipoCorte;
  liquidacionIds: string[];
}
