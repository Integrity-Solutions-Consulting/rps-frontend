import { HonorarioProyecto, HonorarioVigencia, Modalidad } from '../../features/honorarios/models/honorario.models';
import { EventoHistorial } from '../../features/colaboradores/models/colaborador.models';
import { RespuestaMock, colaboradoresMock } from './colaboradores.mock';
import { asignacionesDe, asignacionTmr } from './tmr.mock';
import { hoy } from './fechas';

/**
 * Honorarios por colaborador y proyecto en memoria (RN 17 a 19).
 * Cada cambio crea una vigencia nueva desde un mes; nunca se edita el valor anterior.
 */

interface VigenciaGuardada extends HonorarioVigencia {
  tmrColaboradorId: string;
  tmrProyectoId: string;
}

function mesRelativo(meses: number): string {
  const h = new Date();
  const d = new Date(h.getFullYear(), h.getMonth() + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
const mesActual = () => mesRelativo(0);

function mesEnTexto(fecha: string): string {
  const [a, m] = fecha.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
}

const dinero = (v: number) => v.toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
const conflicto = (codigo: string, detail: string): RespuestaMock =>
  ({ status: 409, body: { title: 'Conflicto', status: 409, detail, codigo } });
const validacion = (codigo: string, campo: string, mensaje: string): RespuestaMock =>
  ({ status: 400, body: { title: 'One or more validation errors occurred.', status: 400, errors: { [campo]: [mensaje] }, codigo } });

class HonorariosMock {
  private readonly vigencias: VigenciaGuardada[] = [];

  constructor() {
    this.sembrar('1', '201', 600, 'Neto', '2026-01-01');
    this.sembrar('1', '202', 400, 'MasIva', '2026-03-01');
    this.sembrar('1', '202', 450, 'MasIva', mesRelativo(1)); // cambio programado
    this.sembrar('1', '206', 500, 'Neto', '2026-05-01');
    this.sembrar('2', '202', 800, 'Neto', '2025-04-01');
    this.sembrar('4', '203', 1000, 'Neto', '2026-01-01');
    // Diego Rivas · Análisis Financiero Q4 queda sin honorario: pendiente de configuración (RN 06).
    this.sembrar('10', '208', 700, 'MasIva', '2026-05-01');
    this.sembrar('9', '208', 500, 'Neto', '2025-01-01');
  }

  porColaborador(tmrColaboradorId: string | null): RespuestaMock {
    if (!tmrColaboradorId) return validacion('Honorario.ColaboradorRequerido', 'tmrColaboradorId', 'Es obligatorio.');
    const mes = mesActual();
    const lista: HonorarioProyecto[] = asignacionesDe(tmrColaboradorId).map((a) => {
      const historial = this.vigencias
        .filter((v) => v.tmrColaboradorId === tmrColaboradorId && v.tmrProyectoId === a.tmrProyectoId)
        .sort((x, y) => y.vigenteDesdeMes.localeCompare(x.vigenteDesdeMes));
      return {
        tmrProyectoId: a.tmrProyectoId,
        proyecto: a.proyecto,
        cliente: a.cliente,
        asignacionActiva: a.fechaFinAsignacion === null || a.fechaFinAsignacion >= hoy(),
        vigente: this.publica(historial.find((v) => v.vigenteDesdeMes <= mes) ?? null),
        programado: this.publica([...historial].reverse().find((v) => v.vigenteDesdeMes > mes) ?? null),
        historial: historial.map((v) => this.publica(v)!),
      };
    }).sort((x, y) => Number(y.asignacionActiva) - Number(x.asignacionActiva) || x.proyecto.localeCompare(y.proyecto));
    return { status: 200, body: lista };
  }

  programar(body: Record<string, unknown>): RespuestaMock {
    const tmrColaboradorId = typeof body['tmrColaboradorId'] === 'string' ? body['tmrColaboradorId'] : '';
    const tmrProyectoId = typeof body['tmrProyectoId'] === 'string' ? body['tmrProyectoId'] : '';
    const importe = body['importe'];
    const modalidad = body['modalidad'];
    const mes = body['vigenteDesdeMes'];

    if (!tmrProyectoId) return validacion('Honorario.ProyectoRequerido', 'tmrProyectoId', 'Elige el proyecto.');
    if (typeof importe !== 'number' || !(importe > 0) || Math.round(importe * 100) !== importe * 100)
      return validacion('Honorario.ImporteInvalido', 'importe', 'Debe ser mayor que cero y con máximo dos decimales.');
    if (modalidad !== 'Neto' && modalidad !== 'MasIva')
      return validacion('Honorario.ModalidadRequerida', 'modalidad', 'Elige Neto o Más IVA.');
    if (typeof mes !== 'string' || !/^\d{4}-\d{2}-01$/.test(mes))
      return validacion('Honorario.MesInvalido', 'vigenteDesdeMes', 'Elige el mes desde el que aplica.');

    const colaborador = colaboradoresMock.porTmrId(tmrColaboradorId);
    if (!colaborador) return conflicto('Honorario.ColaboradorNoVinculado', 'La persona no está vinculada en RPS.');
    if (!colaborador.activo) return conflicto('Colaborador.Desactivado', 'El colaborador está desactivado. Actívalo antes de modificar su configuración.');
    if (!asignacionTmr(tmrColaboradorId, tmrProyectoId))
      return conflicto('Honorario.SinAsignacion', 'TMR no tiene una asignación de esta persona a este proyecto.');

    const previas = this.vigencias.filter((v) => v.tmrColaboradorId === tmrColaboradorId && v.tmrProyectoId === tmrProyectoId);
    // RN 19: un cambio rige desde un mes nuevo. La primera configuración sí puede ser del mes en curso.
    if (previas.length > 0 && mes <= mesActual())
      return validacion('Honorario.MesNoFuturo', 'vigenteDesdeMes', 'Los cambios de honorario aplican desde el mes siguiente; el mes en curso no se modifica.');
    if (previas.some((v) => v.vigenteDesdeMes === mes))
      return conflicto('Honorario.Duplicado', `Ya hay un honorario registrado para ${mesEnTexto(mes)} en este proyecto.`);

    const nueva = this.sembrar(tmrColaboradorId, tmrProyectoId, importe, modalidad, mes);
    return { status: 201, body: this.publica(nueva) };
  }

  cancelar(id: string): RespuestaMock {
    const v = this.vigencias.find((x) => x.id === id);
    if (!v) return { status: 404, body: { title: 'No encontrado', status: 404, detail: 'No existe ese honorario.', codigo: 'Honorario.NoEncontrado' } };
    if (v.vigenteDesdeMes <= mesActual())
      return conflicto('Honorario.NoModificable', 'Solo se pueden cancelar honorarios de meses que aún no empiezan.');
    this.vigencias.splice(this.vigencias.indexOf(v), 1);
    return { status: 204, body: null };
  }

  /** Para el cálculo: honorario que rige en un mes "yyyy-MM" para un proyecto (RN 19). */
  vigenteEn(tmrColaboradorId: string, tmrProyectoId: string, periodo: string): { importe: number; modalidad: Modalidad } | null {
    const v = this.vigencias
      .filter((x) => x.tmrColaboradorId === tmrColaboradorId && x.tmrProyectoId === tmrProyectoId && x.vigenteDesdeMes <= `${periodo}-01`)
      .sort((a, b) => b.vigenteDesdeMes.localeCompare(a.vigenteDesdeMes))[0];
    return v ? { importe: v.importe, modalidad: v.modalidad } : null;
  }

  /** Movimientos para el historial del colaborador. */
  eventosDe(tmrColaboradorId: string): EventoHistorial[] {
    return this.vigencias
      .filter((v) => v.tmrColaboradorId === tmrColaboradorId)
      .map((v): EventoHistorial => ({
        fecha: v.registradoEn,
        tipo: 'Honorario',
        descripcion: `Cambio de honorario · ${asignacionTmr(v.tmrColaboradorId, v.tmrProyectoId)?.proyecto ?? 'Proyecto ' + v.tmrProyectoId}: ${dinero(v.importe)} ${v.modalidad === 'Neto' ? 'neto' : 'más IVA'} desde ${mesEnTexto(v.vigenteDesdeMes)}.`,
        usuario: 'Contabilidad',
        periodo: v.vigenteDesdeMes.slice(0, 7),
        importe: v.importe,
        estado: v.vigenteDesdeMes > mesActual() ? 'Programado' : 'Registrado',
        enlace: { texto: 'Ver condiciones', ruta: `/colaboradores/${colaboradoresMock.porTmrId(v.tmrColaboradorId)?.id ?? ''}`, query: { tab: 'condiciones' } },
      }));
  }

  private publica(v: VigenciaGuardada | null): HonorarioVigencia | null {
    return v ? { id: v.id, importe: v.importe, modalidad: v.modalidad, vigenteDesdeMes: v.vigenteDesdeMes, registradoEn: v.registradoEn } : null;
  }

  private sembrar(tmrColaboradorId: string, tmrProyectoId: string, importe: number, modalidad: Modalidad, vigenteDesdeMes: string): VigenciaGuardada {
    // Los de ejemplo se registran el mes anterior a su vigencia; los nuevos, ahora.
    const [a, m] = vigenteDesdeMes.split('-').map(Number);
    const registro = new Date(a, m - 2, 20, 10, 0);
    const v: VigenciaGuardada = {
      id: crypto.randomUUID(), tmrColaboradorId, tmrProyectoId, importe, modalidad, vigenteDesdeMes,
      registradoEn: (registro.getTime() < Date.now() ? registro : new Date()).toISOString(),
    };
    this.vigencias.push(v);
    return v;
  }
}

export const honorariosMock = new HonorariosMock();
