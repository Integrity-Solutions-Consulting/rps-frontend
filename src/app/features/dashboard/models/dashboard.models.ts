/** Contrato de datos de Inicio. Debe coincidir con los DTO del slice Features/Dashboard del backend. */

/** Período mensual en formato yyyy-MM, por ejemplo "2026-11". */
export type Periodo = string;

export type TipoCorte = 'Quincena' | 'FinDeMes';

export interface CorteResumen {
  corte: TipoCorte;
  /** Neto distribuido al corte antes de anticipos adicionales (RN 38). */
  base: number;
  /** Cuotas de anticipos adicionales programadas para el corte. */
  descuentoAnticipos: number;
  /** Base − descuentos: lo que irá en el Excel. */
  valorPreparado: number;
  colaboradores: number;
  /** Versión de exportación vigente, o null si el corte no se ha exportado. */
  versionExportada: number | null;
  fechaExportacion: string | null;
}

export interface DashboardResumen {
  periodo: Periodo;
  /** Suma de netos consolidados de todos los colaboradores, antes de anticipos (RN 31). */
  netoConsolidado: number;
  colaboradoresActivos: number;
  liquidaciones: {
    total: number;
    revisadas: number;
    pendientesRevision: number;
    requierenRecalculo: number;
  };
  /** Colaboradores con proyectos sin contrato u honorario configurado (RN 06). */
  pendientesConfiguracion: number;
  /** Colaboradores sin documento mensual registrado (RN 35). */
  documentosFaltantes: number;
  /** Cambios detectados en TMR que no se han revisado (RN 50). */
  avisosTmrPendientes: number;
  cortes: CorteResumen[];
  /** RC 05: si TMR no responde, RPS lo muestra y no asume cero. */
  origenTmr: { disponible: boolean; ultimaConsulta: string | null };
}

export interface VencimientoContrato {
  contratoId: number;
  colaboradorId: number;
  colaborador: string;
  proyecto: string;
  fechaFinVigente: string;
  /** Negativo cuando el contrato ya venció. */
  diasRestantes: number;
  /** RN 15: vencido con asignación activa requiere revisión. */
  asignacionActiva: boolean;
}

export type TipoAlerta = 'Asignacion' | 'Documentacion' | 'DatosIncompletos' | 'CambioTmr' | 'Anticipo';
export type Severidad = 'Info' | 'Advertencia' | 'Critica';

export interface AlertaDashboard {
  id: string;
  tipo: TipoAlerta;
  severidad: Severidad;
  colaboradorId: number | null;
  colaborador: string | null;
  proyecto: string | null;
  mensaje: string;
  fechaDeteccion: string;
  /** Ruta del frontend para resolver la alerta, por ejemplo "/liquidaciones". */
  ruta: string | null;
}
