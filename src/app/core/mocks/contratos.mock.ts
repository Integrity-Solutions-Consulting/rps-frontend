import { EventoHistorial } from '../../features/colaboradores/models/colaborador.models';
import {
  Adenda, AsignacionDisponible, ContratoDetalle, ContratoResumen, EstadoContrato, ResumenContratos,
} from '../../features/contratos/models/contrato.models';
import { RespuestaMock, colaboradoresMock } from './colaboradores.mock';
import { TMR_ASIGNACIONES, asignacionTmr, nombreTmr } from './tmr.mock';
import { diasEntre, enDias, hoy, sumarDias } from './fechas';
import { configuracionMock } from './configuracion.mock';

/**
 * Contratos y adendas en memoria, con las reglas de la sección 4 de los requisitos (RN 08 a 16).
 * Los errores siguen el formato ProblemDetails con `codigo`, igual que Colaboradores.
 */

/** Mayor plazo de alerta configurado (RN 13): 30 días por defecto. */
const diasAlerta = () => Math.max(...configuracionMock.alertasDias(), 0);

interface ContratoGuardado {
  id: string;
  tmrColaboradorId: string;
  tmrProyectoId: string;
  fechaInicio: string;
  fechaFinOriginal: string;
  referencia: string | null;
  observaciones: string | null;
  adendas: Adenda[];
  registradoEn: string;
}

const conflicto = (codigo: string, detail: string): RespuestaMock =>
  ({ status: 409, body: { title: 'Conflicto', status: 409, detail, codigo } });
const noEncontrado = (codigo: string, detail: string): RespuestaMock =>
  ({ status: 404, body: { title: 'No encontrado', status: 404, detail, codigo } });
const validacion = (codigo: string, campo: string, mensaje: string): RespuestaMock =>
  ({ status: 400, body: { title: 'One or more validation errors occurred.', status: 400, errors: { [campo]: [mensaje] }, codigo } });
const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const texto = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

class ContratosMock {
  private readonly contratos: ContratoGuardado[] = [];

  constructor() {
    // Ana Pérez · Marketing Digital: contrato original de 6 meses y dos adendas; vence pronto.
    const ana = this.sembrar('1', '201', '2026-01-01', '2026-06-30', 'CT-2026-001');
    this.agregarAdenda(ana, '2026-09-30', 'AD-001', 'Extensión por continuidad del proyecto', new Date(2026, 5, 20, 10).toISOString());
    this.agregarAdenda(ana, enDias(12), 'AD-002', null, new Date(2026, 8, 22, 10).toISOString());
    // Ana Pérez · Consultoría RPS: segundo contrato de la misma persona (RN 04, RN 08).
    this.sembrar('1', '202', '2026-03-01', enDias(120), 'CT-2026-014');
    this.sembrar('2', '202', '2025-03-15', enDias(200), 'CT-2025-031');
    // Diego Rivas: vencido con asignación activa → requiere revisión (RN 15).
    this.sembrar('4', '203', '2026-01-10', enDias(-8), 'CT-2026-004');
    // Nicolás Paredes: próximo a vencer.
    this.sembrar('10', '208', '2026-04-15', enDias(25), 'CT-2026-022');
    // Elena Palacios: vencido y la asignación ya terminó (solo historial).
    this.sembrar('9', '208', '2025-01-15', '2025-12-31', 'CT-2025-007');
  }

  // ── Endpoints ──────────────────────────────────────────────────────
  listar(estado: string | null, tmrColaboradorId: string | null = null): RespuestaMock {
    const lista = this.contratos
      .filter((c) => !tmrColaboradorId || c.tmrColaboradorId === tmrColaboradorId)
      .map((c) => this.resumen(c))
      .filter((c) => !estado || c.estado === estado)
      .sort((a, b) => a.diasParaVencer - b.diasParaVencer);
    return { status: 200, body: lista };
  }

  contadores(): RespuestaMock {
    const todos = this.contratos.map((c) => this.resumen(c));
    const body: ResumenContratos = {
      vigentes: todos.filter((c) => c.estado === 'Vigente').length,
      proximosAVencer: todos.filter((c) => c.estado === 'ProximoAVencer').length,
      vencidos: todos.filter((c) => c.estado === 'Vencido').length,
      diasAlerta: diasAlerta(),
    };
    return { status: 200, body };
  }

  obtener(id: string): RespuestaMock {
    const c = this.contratos.find((x) => x.id === id);
    return c ? { status: 200, body: this.detalle(c) } : this.noExiste(id);
  }

  registrar(body: Record<string, unknown>): RespuestaMock {
    const tmrColaboradorId = texto(body['tmrColaboradorId'], 50);
    const tmrProyectoId = texto(body['tmrProyectoId'], 50);
    if (!tmrColaboradorId || !tmrProyectoId)
      return validacion('Contrato.AsignacionRequerida', 'asignacion', 'Elige el colaborador y el proyecto.');
    const inicio = body['fechaInicio'];
    const fin = body['fechaFin'];
    if (!esFecha(inicio))
      return validacion('Contrato.FechaInicioInvalida', 'fechaInicio', 'Es obligatoria.');
    if (!esFecha(fin))
      return validacion('Contrato.FechaFinInvalida', 'fechaFin', 'Es obligatoria.');
    if (fin < inicio)
      return validacion('Contrato.FinAntesDeInicio', 'fechaFin', 'El fin no puede ser anterior al inicio.');

    const colaborador = colaboradoresMock.porTmrId(tmrColaboradorId);
    if (!colaborador)
      return conflicto('Contrato.ColaboradorNoVinculado', 'La persona no está vinculada en RPS. Vincúlala en Colaboradores antes de registrar su contrato.');
    if (!colaborador.activo)
      return conflicto('Contrato.ColaboradorDesactivado', 'El colaborador está desactivado en RPS.');
    if (!asignacionTmr(tmrColaboradorId, tmrProyectoId))
      return conflicto('Contrato.SinAsignacion', 'TMR no tiene una asignación de esta persona a este proyecto.');

    const misma = this.contratos.filter((c) => c.tmrColaboradorId === tmrColaboradorId && c.tmrProyectoId === tmrProyectoId);
    const superpuesto = misma.find((c) => inicio <= this.finVigente(c) && fin >= c.fechaInicio);
    if (superpuesto)
      return conflicto('Contrato.Superpuesto',
        `Ya hay un contrato para esta relación hasta el ${this.finVigente(superpuesto)}. Para extenderlo registra una adenda; un contrato nuevo no puede superponerse.`);

    const nuevo = this.sembrar(tmrColaboradorId, tmrProyectoId, inicio, fin, texto(body['referencia'], 100));
    nuevo.observaciones = texto(body['observaciones'], 500);
    return { status: 201, body: this.detalle(nuevo) };
  }

  registrarAdenda(id: string, body: Record<string, unknown>): RespuestaMock {
    const c = this.contratos.find((x) => x.id === id);
    if (!c) return this.noExiste(id);
    const nueva = body['nuevaFechaFin'];
    if (!esFecha(nueva))
      return validacion('Adenda.FechaInvalida', 'nuevaFechaFin', 'Es obligatoria.');
    if (nueva <= this.finVigente(c))
      return validacion('Adenda.NoExtiende', 'nuevaFechaFin',
        `Debe ser posterior al fin vigente (${this.finVigente(c)}). Una adenda solo extiende el contrato.`);
    this.agregarAdenda(c, nueva, texto(body['referencia'], 100), texto(body['observaciones'], 500));
    return { status: 201, body: this.detalle(c) };
  }

  asignacionesDisponibles(): RespuestaMock {
    const lista: AsignacionDisponible[] = TMR_ASIGNACIONES.map((a) => ({
      tmrColaboradorId: a.tmrColaboradorId,
      colaborador: nombreTmr(a.tmrColaboradorId),
      tmrProyectoId: a.tmrProyectoId,
      proyecto: a.proyecto,
      cliente: a.cliente,
      fechaAsignacion: a.fechaAsignacion,
      fechaFinAsignacion: a.fechaFinAsignacion,
      activa: a.activa,
      vinculadoEnRps: colaboradoresMock.porTmrId(a.tmrColaboradorId) !== null,
      tieneContratoVigente: this.contratos.some((c) =>
        c.tmrColaboradorId === a.tmrColaboradorId && c.tmrProyectoId === a.tmrProyectoId && this.finVigente(c) >= hoy()),
    })).sort((x, y) => x.colaborador.localeCompare(y.colaborador) || x.proyecto.localeCompare(y.proyecto));
    return { status: 200, body: lista };
  }

  /** Para la liquidación: estado del último contrato de una relación colaborador y proyecto (RN 14: solo informa). */
  contratoDe(tmrColaboradorId: string, tmrProyectoId: string): ContratoResumen | null {
    const lista = this.contratos
      .filter((c) => c.tmrColaboradorId === tmrColaboradorId && c.tmrProyectoId === tmrProyectoId)
      .sort((a, b) => this.finVigente(b).localeCompare(this.finVigente(a)));
    return lista.length ? this.resumen(lista[0]) : null;
  }

  /** Movimientos para el historial del colaborador. */
  eventosDe(tmrColaboradorId: string): EventoHistorial[] {
    const eventos: EventoHistorial[] = [];
    for (const c of this.contratos.filter((x) => x.tmrColaboradorId === tmrColaboradorId)) {
      const proyecto = asignacionTmr(c.tmrColaboradorId, c.tmrProyectoId)?.proyecto ?? `Proyecto ${c.tmrProyectoId}`;
      const enlace = { texto: 'Ver contrato', ruta: '/contratos', query: { contrato: c.id } };
      eventos.push({
        fecha: c.registradoEn, tipo: 'Contrato', usuario: 'Contabilidad',
        descripcion: `Contrato ${c.referencia ?? ''} en ${proyecto}: del ${c.fechaInicio} al ${c.fechaFinOriginal}.`.replace('  ', ' '),
        periodo: c.fechaInicio.slice(0, 7), estado: 'Registrado', enlace,
      });
      for (const a of c.adendas) {
        eventos.push({
          fecha: a.fechaRegistro, tipo: 'Adenda', usuario: 'Contabilidad',
          descripcion: `Adenda ${a.numero} en ${proyecto}: nuevo fin ${a.nuevaFechaFin}.`,
          periodo: a.fechaRegistro.slice(0, 7), estado: 'Registrada', enlace,
        });
      }
    }
    return eventos;
  }

  // ── Armado de respuestas ─────────────────────────────────────────────
  private finVigente(c: ContratoGuardado): string {
    return c.adendas.length ? c.adendas[c.adendas.length - 1].nuevaFechaFin : c.fechaFinOriginal;
  }

  private resumen(c: ContratoGuardado): ContratoResumen {
    const fin = this.finVigente(c);
    const dias = diasEntre(hoy(), fin);
    const estado: EstadoContrato = dias < 0 ? 'Vencido' : dias <= diasAlerta() ? 'ProximoAVencer' : 'Vigente';
    const asig = asignacionTmr(c.tmrColaboradorId, c.tmrProyectoId);
    const asignacionActiva = !!asig && asig.activa && (asig.fechaFinAsignacion === null || asig.fechaFinAsignacion >= hoy());
    return {
      id: c.id,
      colaboradorId: colaboradoresMock.porTmrId(c.tmrColaboradorId)?.id ?? '',
      tmrColaboradorId: c.tmrColaboradorId,
      colaborador: nombreTmr(c.tmrColaboradorId),
      tmrProyectoId: c.tmrProyectoId,
      proyecto: asig?.proyecto ?? `Proyecto ${c.tmrProyectoId}`,
      cliente: asig?.cliente ?? null,
      referencia: c.referencia,
      fechaInicio: c.fechaInicio,
      fechaFinOriginal: c.fechaFinOriginal,
      fechaFinVigente: fin,
      diasParaVencer: dias,
      estado,
      asignacionActiva,
      numeroAdendas: c.adendas.length,
    };
  }

  private detalle(c: ContratoGuardado): ContratoDetalle {
    const r = this.resumen(c);
    const asig = asignacionTmr(c.tmrColaboradorId, c.tmrProyectoId);
    const advertencias: string[] = [];

    if (r.estado === 'Vencido' && r.asignacionActiva)
      advertencias.push('El contrato venció y la asignación sigue activa en TMR. Consulta con Proyectos si corresponde una adenda. No bloquea la liquidación (RN 14, RN 15).');
    if (asig?.fechaAsignacion && asig.fechaAsignacion < c.fechaInicio)
      advertencias.push(`La asignación en TMR empieza el ${asig.fechaAsignacion}, antes del inicio del contrato (${c.fechaInicio}).`);
    const salida = asig?.fechaFinAsignacion ?? null;
    if (r.estado === 'ProximoAVencer' && r.asignacionActiva && (salida === null || salida > r.fechaFinVigente))
      advertencias.push(`El contrato vence el ${r.fechaFinVigente} y la asignación sigue después en TMR. Revisa si hará falta una adenda.`);

    // Huecos entre contratos de la misma relación.
    const anteriores = this.contratos
      .filter((x) => x !== c && x.tmrColaboradorId === c.tmrColaboradorId && x.tmrProyectoId === c.tmrProyectoId && this.finVigente(x) < c.fechaInicio)
      .sort((a, b) => this.finVigente(b).localeCompare(this.finVigente(a)));
    if (anteriores.length && sumarDias(this.finVigente(anteriores[0]), 1) < c.fechaInicio)
      advertencias.push(`Hay días sin cobertura entre el contrato anterior (fin ${this.finVigente(anteriores[0])}) y este.`);

    return {
      ...r,
      observaciones: c.observaciones,
      adendas: [...c.adendas],
      asignacionInicio: asig?.fechaAsignacion ?? null,
      asignacionSalida: salida,
      advertencias,
    };
  }

  private sembrar(tmrColaboradorId: string, tmrProyectoId: string, inicio: string, fin: string, referencia: string | null): ContratoGuardado {
    const c: ContratoGuardado = {
      id: crypto.randomUUID(), tmrColaboradorId, tmrProyectoId, fechaInicio: inicio, fechaFinOriginal: fin,
      referencia, observaciones: null, adendas: [],
      // Los de ejemplo se registran el día de inicio; los nuevos, ahora.
      registradoEn: (inicio < hoy() ? new Date(`${inicio}T10:00:00`) : new Date()).toISOString(),
    };
    this.contratos.push(c);
    return c;
  }

  private agregarAdenda(c: ContratoGuardado, nuevaFechaFin: string, referencia: string | null, observaciones: string | null, registrada?: string): void {
    c.adendas.push({
      id: crypto.randomUUID(), numero: c.adendas.length + 1, nuevaFechaFin, referencia, observaciones,
      fechaRegistro: registrada ?? new Date().toISOString(),
    });
  }

  private noExiste(id: string): RespuestaMock {
    return noEncontrado('Contrato.NoEncontrado', `No existe un contrato con id '${id}'.`);
  }
}

export const contratosMock = new ContratosMock();
