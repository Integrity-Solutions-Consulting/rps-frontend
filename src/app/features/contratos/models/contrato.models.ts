/**
 * Contratos y adendas de rps-backend (Features/Contratos). Un contrato es por colaborador y puede
 * cubrir uno, varios o ningún proyecto (RR. HH. sin proyecto en TMR también tiene contrato).
 * Estado por proyecto: Vencido y ProximoAVencer salen de GET /api/dashboard/vencimientos;
 * Vigente / NoVigente, del campo `vigente` del contrato (inicio ≤ hoy ≤ fin vigente).
 */

import { Clasificacion, Frecuencia } from '../../colaboradores/models/colaborador.models';

export type EstadoContrato = 'Vigente' | 'ProximoAVencer' | 'Vencido' | 'NoVigente';

export interface Adenda {
  id: string;
  numero: number;
  /** Nueva fecha de fin que establece la adenda. */
  nuevaFechaFin: string;
  observaciones: string | null;
  fechaRegistro: string;
}

/** Un proyecto cubierto por el contrato, con su propio estado de vencimiento (RN 13-16: el
 * vencimiento se avisa por proyecto, uno vencido no afecta a los demás del mismo contrato). */
export interface ProyectoDeContrato {
  proyectoId: string;
  tmrProyectoId: string;
  proyecto: string;
  cliente: string | null;
  /** Solo si el backend lo trae en vencimientos; null si no está por vencer ni vencido. */
  diasParaVencer: number | null;
  estado: EstadoContrato;
  /** RN 15: vencido con asignación activa requiere revisión. */
  asignacionActiva: boolean;
}

export interface ContratoResumen {
  id: string;
  colaboradorId: string;
  tmrColaboradorId: string;
  /** Nombre copiado de TMR. */
  colaborador: string;
  /** Vacío: contrato sin proyecto (personal de RR. HH.). */
  proyectos: ProyectoDeContrato[];
  referencia: string | null;
  fechaInicio: string;
  /** Null: contrato indefinido (sin fecha de fin). Nunca cambia (RN 12). */
  fechaFinOriginal: string | null;
  /** Refleja la última adenda (RN 12). Null si es indefinido: nunca vence. */
  fechaFinVigente: string | null;
  /** El peor estado entre sus proyectos; Vigente/NoVigente si no tiene proyectos. */
  estado: EstadoContrato;
  numeroAdendas: number;
}

export interface ContratoDetalle extends ContratoResumen {
  observaciones: string | null;
  adendas: Adenda[];
}

export interface ResumenContratos {
  vigentes: number;
  proximosAVencer: number;
  vencidos: number;
  noVigentes: number;
}

/** Combinación colaborador + proyecto asignada en TMR, para elegir al registrar un contrato. */
export interface AsignacionDisponible {
  tmrColaboradorId: string;
  colaborador: string;
  tmrProyectoId: string;
  proyecto: string;
  fechaAsignacion: string | null;
  fechaFinAsignacion: string | null;
  /** Ya hay un contrato vigente (distinto del que se está editando) que cubre este proyecto. */
  tieneContratoVigente: boolean;
}

/** Honorario a registrar para uno de los proyectos elegidos, en el mismo formulario del contrato. */
export interface HonorarioDeRegistro {
  tmrProyectoId: string;
  importeMensual: number | null;
  modalidad: 'Neto' | 'MasIva';
}

/** Lo que el formulario del contrato también deja configurar del colaborador (RN 05, RN 36):
 * tipo de servicio, frecuencia de pago, honorario por proyecto y datos bancarios. Null/vacío = no
 * cambiar lo que ya tiene. La ficha del colaborador solo lo muestra, ya no lo edita. */
export interface ConfiguracionColaboradorForm {
  clasificacion: Clasificacion | null;
  frecuencia: { frecuencia: Frecuencia; vigenteDesdeMes: string } | null;
  /** Uno por cada proyecto elegido que Contabilidad quiera dejar configurado de una vez. */
  honorarios: HonorarioDeRegistro[];
  /** Null: no se tocan los datos bancarios en este registro. */
  cuentaBancaria: { banco: string | null; tipoCuenta: string | null; numeroCuenta: string } | null;
}

export interface RegistrarContratoRequest extends ConfiguracionColaboradorForm {
  tmrColaboradorId: string;
  /** Vacío: contrato sin proyecto. */
  tmrProyectoIds: string[];
  fechaInicio: string;
  /** Ignorada por el backend si indefinido es true. */
  fechaFin: string;
  /** true: contrato sin fecha de fin (nunca vence, sin adendas). */
  indefinido: boolean;
  referencia: string | null;
  observaciones: string | null;
}

// FechaFin/Indefinido no se editan (RN 12): para extender la vigencia se usa una Adenda.
export interface EditarContratoRequest extends ConfiguracionColaboradorForm {
  /** Vacío: contrato sin proyecto. */
  tmrProyectoIds: string[];
  fechaInicio: string;
  referencia: string | null;
  observaciones: string | null;
}

export interface RegistrarAdendaRequest {
  nuevaFechaFin: string;
  observaciones: string | null;
}

export const ETIQUETA_ESTADO_CONTRATO: Record<EstadoContrato, string> = {
  Vigente: 'Vigente',
  ProximoAVencer: 'Próximo a vencer',
  Vencido: 'Vencido con asignación activa',
  NoVigente: 'No vigente',
};
