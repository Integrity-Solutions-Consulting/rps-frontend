import { EventoHistorial } from '../../features/colaboradores/models/colaborador.models';
import {
  CorteLiquidacion, LiquidacionDetalle, LiquidacionPendiente, LiquidacionResumen, LiquidacionesPeriodo,
} from '../../features/liquidaciones/models/liquidacion.models';
import { ETIQUETA_CORTE, TipoCorte } from '../../shared/models/corte';
import { esPeriodoValido, nombrePeriodo, periodoActual, periodoSiguiente } from '../../shared/utils/periodo';
import { RespuestaMock, colaboradoresMock } from './colaboradores.mock';
import { ResultadoCalculo, calcularColaborador, esResultado, r2 } from './calculo.mock';
import { anticiposMock } from './anticipos.mock';
import { documentosMock } from './documentos.mock';
import { exportacionesMock } from './exportaciones.mock';

/**
 * Liquidaciones guardadas por mes. "Calcular período" guarda una versión por colaborador;
 * si al recalcular algo cambió, se guarda una versión nueva, se quita "Revisado para envío"
 * y la anterior queda consultable (controles propuestos de la sección 11).
 *
 * Los datos de ejemplo se crean la primera vez que se consultan (asegurarDatos), porque
 * este mock, exportaciones y documentos se usan entre sí.
 */

export interface LiquidacionGuardada {
  id: string;
  periodo: string;
  colaboradorId: string;
  version: number;
  calculadoEn: string;
  usuario: string;
  /** Copia del cálculo tal como quedó: no cambia aunque luego cambien TMR o la configuración (RN 29). */
  resultado: ResultadoCalculo;
  cortes: { corte: TipoCorte; base: number; descuento: number; valor: number; cuotas: number }[];
  revisado: boolean;
  revisadoPor: string | null;
  revisadoEn: string | null;
  anteriores: { version: number; calculadoEn: string; netoConsolidado: number }[];
}

const dinero = (v: number) => v.toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Mes anterior al actual, "yyyy-MM". */
function mesAnterior(): string {
  const h = new Date();
  return periodoActual(new Date(h.getFullYear(), h.getMonth() - 1, 1));
}

class LiquidacionesMock {
  private readonly guardadas: LiquidacionGuardada[] = [];
  private readonly eventos: (EventoHistorial & { colaboradorId: string })[] = [];
  private sembrado = false;

  // ── Para otros mocks ───────────────────────────────────────────────
  /** Liquidaciones guardadas de un mes (la última versión de cada colaborador). */
  delPeriodo(periodo: string): LiquidacionGuardada[] {
    this.asegurarDatos();
    return this.guardadas.filter((l) => l.periodo === periodo);
  }

  porId(id: string): LiquidacionGuardada | null {
    this.asegurarDatos();
    return this.guardadas.find((l) => l.id === id) ?? null;
  }

  /** true si el cálculo de hoy daría otros valores que los guardados (RN 50). */
  requiereRecalculo(l: LiquidacionGuardada): boolean {
    const actual = calcularColaborador(l.colaboradorId, l.periodo);
    if (!esResultado(actual)) return true;
    return this.firma(actual, this.cortes(actual)) !== this.firma(l.resultado, l.cortes);
  }

  eventosDe(colaboradorId: string): EventoHistorial[] {
    this.asegurarDatos();
    return this.eventos.filter((e) => e.colaboradorId === colaboradorId).map(({ colaboradorId: _, ...e }) => e);
  }

  // ── Endpoints ──────────────────────────────────────────────────────
  listar(periodo: string | null): RespuestaMock {
    if (!periodo || !esPeriodoValido(periodo)) return this.periodoInvalido();
    this.asegurarDatos();
    const filas = this.delPeriodo(periodo)
      .map((l) => this.resumen(l))
      .sort((a, b) => a.colaborador.localeCompare(b.colaborador));
    const body: LiquidacionesPeriodo = { periodo, calculado: filas.length > 0, filas, pendientes: this.pendientes(periodo) };
    return { status: 200, body };
  }

  calcular(body: Record<string, unknown>): RespuestaMock {
    const periodo = typeof body['periodo'] === 'string' ? body['periodo'] : null;
    if (!periodo || !esPeriodoValido(periodo)) return this.periodoInvalido();
    if (periodo > periodoSiguiente())
      return { status: 400, body: { title: 'One or more validation errors occurred.', status: 400, errors: { periodo: ['Solo se calcula hasta el mes siguiente.'] }, codigo: 'Liquidacion.PeriodoFuturo' } };
    this.asegurarDatos();
    this.calcularPeriodo(periodo, new Date().toISOString());
    return this.listar(periodo);
  }

  obtener(id: string): RespuestaMock {
    const l = this.porId(id);
    if (!l) return { status: 404, body: { title: 'No encontrado', status: 404, detail: 'No existe esa liquidación.', codigo: 'Liquidacion.NoEncontrada' } };
    const r = l.resultado;
    const body: LiquidacionDetalle = {
      ...this.resumen(l),
      detalleProyectos: copia(r.proyectos),
      proyectosSinHonorario: [...r.proyectosSinHonorario],
      parametros: { ...r.parametros },
      notasCortes: [...r.notasCortes],
      versionesAnteriores: [...l.anteriores].reverse(),
    };
    return { status: 200, body };
  }

  marcarRevisado(id: string, body: Record<string, unknown>): RespuestaMock {
    const l = this.porId(id);
    if (!l) return { status: 404, body: { title: 'No encontrado', status: 404, detail: 'No existe esa liquidación.', codigo: 'Liquidacion.NoEncontrada' } };
    const revisado = body['revisado'] === true;
    if (revisado && this.requiereRecalculo(l))
      return { status: 409, body: { title: 'Conflicto', status: 409, codigo: 'Liquidacion.RequiereRecalculo',
        detail: 'Algo cambió después del cálculo. Recalcula el período antes de marcarla como revisada.' } };
    if (l.revisado !== revisado) {
      l.revisado = revisado;
      l.revisadoPor = revisado ? 'Contabilidad' : null;
      l.revisadoEn = revisado ? new Date().toISOString() : null;
      this.evento(l, revisado ? 'Revisada para envío' : 'Revisión retirada',
        revisado ? `Liquidación de ${nombrePeriodo(l.periodo).toLowerCase()} marcada como revisada para envío. No confirma una transferencia (RN 49).`
                 : `Se quitó la marca de revisión de la liquidación de ${nombrePeriodo(l.periodo).toLowerCase()}.`,
        new Date().toISOString());
    }
    return { status: 200, body: this.resumen(l) };
  }

  // ── Internos ───────────────────────────────────────────────────────
  private asegurarDatos(): void {
    if (this.sembrado) return;
    this.sembrado = true;
    // Mes anterior: calculado y revisado (luego exportaciones.mock lo exporta completo).
    this.calcularPeriodo(mesAnterior(), new Date(`${mesAnterior()}-12T10:00:00`).toISOString());
    for (const l of this.delPeriodo(mesAnterior())) this.marcarSembrado(l, `${mesAnterior()}-27T16:00:00`);
    // Mes actual: calculado; solo Ana revisada (su quincena ya se exportó).
    this.calcularPeriodo(periodoActual(), new Date(`${periodoActual()}-12T10:00:00`).toISOString());
    const ana = colaboradoresMock.porTmrId('1')?.id;
    for (const l of this.delPeriodo(periodoActual()).filter((x) => x.colaboradorId === ana)) this.marcarSembrado(l, `${periodoActual()}-13T09:30:00`);
  }

  private marcarSembrado(l: LiquidacionGuardada, fecha: string): void {
    l.revisado = true;
    l.revisadoPor = 'Contabilidad';
    l.revisadoEn = new Date(fecha).toISOString();
    this.evento(l, 'Revisada para envío', `Liquidación de ${nombrePeriodo(l.periodo).toLowerCase()} marcada como revisada para envío.`, l.revisadoEn);
  }

  private calcularPeriodo(periodo: string, ahora: string): void {
    for (const id of colaboradoresMock.ids()) {
      const r = calcularColaborador(id, periodo);
      if (!esResultado(r)) continue;
      const cortes = this.cortes(r);
      const previa = this.guardadas.find((l) => l.periodo === periodo && l.colaboradorId === id);

      if (!previa) {
        const nueva: LiquidacionGuardada = {
          id: crypto.randomUUID(), periodo, colaboradorId: id, version: 1, calculadoEn: ahora, usuario: 'Contabilidad',
          resultado: copia(r), cortes, revisado: false, revisadoPor: null, revisadoEn: null, anteriores: [],
        };
        this.guardadas.push(nueva);
        this.evento(nueva, 'Calculada', `Liquidación de ${nombrePeriodo(periodo).toLowerCase()} calculada: ${r.proyectos.length} ${r.proyectos.length === 1 ? 'proyecto' : 'proyectos'}.`, ahora);
        continue;
      }
      if (this.firma(r, cortes) === this.firma(previa.resultado, previa.cortes)) continue;

      // Cambió algo: versión nueva; la anterior queda en el historial y se retira la revisión.
      previa.anteriores.push({ version: previa.version, calculadoEn: previa.calculadoEn, netoConsolidado: previa.resultado.netoConsolidado });
      previa.version += 1;
      previa.calculadoEn = ahora;
      previa.resultado = copia(r);
      previa.cortes = cortes;
      const teniaRevision = previa.revisado;
      previa.revisado = false;
      previa.revisadoPor = null;
      previa.revisadoEn = null;
      this.evento(previa, `Recalculada v${previa.version}`,
        `Liquidación de ${nombrePeriodo(periodo).toLowerCase()} recalculada (versión ${previa.version}).` +
        (teniaRevision ? ' Se quitó la marca de revisión porque cambiaron los importes.' : ''), ahora);
    }
  }

  /** Bases de cada corte menos las cuotas de anticipos (RN 38). Nunca deja un corte en negativo (RN 47). */
  private cortes(r: ResultadoCalculo): LiquidacionGuardada['cortes'] {
    const cuotas = anticiposMock.cuotasDe(r.colaboradorId, r.periodo);
    const aplican: TipoCorte[] = r.frecuencia === 'DosPagos' ? ['Quincena', 'FinDeMes'] : ['FinDeMes'];
    return aplican.map((corte) => {
      const base = r.bases[corte];
      const descuento = r2(Math.min(cuotas[corte], base));
      return { corte, base, descuento, valor: r2(base - descuento), cuotas: cuotas[corte] };
    });
  }

  private firma(r: ResultadoCalculo, cortes: LiquidacionGuardada['cortes']): string {
    return JSON.stringify({
      p: r.proyectos.map((x) => [x.tmrProyectoId, x.diasReconocidos, x.honorario, x.modalidad, x.neto]),
      f: r.frecuencia, c: r.clasificacion,
      k: cortes.map((x) => [x.corte, x.base, x.descuento, x.cuotas]),
    });
  }

  private resumen(l: LiquidacionGuardada): LiquidacionResumen {
    const r = l.resultado;
    const requiere = this.requiereRecalculo(l);
    const advertencias: string[] = [];
    if (requiere) advertencias.push('Algo cambió después del cálculo (TMR, honorarios o anticipos). Recalcula el período.');
    for (const p of r.proyectosSinHonorario) advertencias.push(`${p} tiene días en el mes pero no tiene honorario: no se calculó (RN 06).`);
    for (const p of r.proyectos.filter((x) => x.contrato?.estado === 'Vencido'))
      advertencias.push(`El contrato de ${p.proyecto} está vencido. Solo es una alerta: no bloquea ni recorta el cálculo (RN 14).`);
    for (const p of r.proyectos.filter((x) => !x.contrato))
      advertencias.push(`${p.proyecto} no tiene contrato registrado.`);
    for (const c of l.cortes.filter((x) => x.cuotas > x.descuento))
      advertencias.push(`Las cuotas de ${ETIQUETA_CORTE[c.corte].toLowerCase()} (${dinero(c.cuotas)}) superan lo que paga el corte: ` +
        `quedan ${dinero(r2(c.cuotas - c.descuento))} pendientes. Contabilidad debe decidir qué hacer (PA 01).`);

    const cortes: CorteLiquidacion[] = l.cortes.map((c) => ({
      corte: c.corte, base: c.base, descuento: c.descuento, valor: c.valor,
      versionExportada: exportacionesMock.versionExportada(l.periodo, c.corte, l.colaboradorId),
    }));

    return {
      id: l.id, periodo: l.periodo, colaboradorId: l.colaboradorId, tmrColaboradorId: r.tmrColaboradorId,
      colaborador: r.colaborador, clasificacion: r.clasificacion, frecuencia: r.frecuencia,
      proyectos: r.proyectos.length, netoConsolidado: r.netoConsolidado, cortes,
      documento: documentosMock.tieneDocumento(l.colaboradorId, l.periodo) ? 'Registrado' : 'Pendiente',
      revisado: l.revisado, revisadoPor: l.revisadoPor, revisadoEn: l.revisadoEn,
      version: l.version, calculadoEn: l.calculadoEn, requiereRecalculo: requiere, advertencias,
    };
  }

  private pendientes(periodo: string): LiquidacionPendiente[] {
    const lista: LiquidacionPendiente[] = [];
    for (const id of colaboradoresMock.ids()) {
      const r = calcularColaborador(id, periodo);
      if (r && !esResultado(r)) lista.push({ colaboradorId: r.colaboradorId, colaborador: r.colaborador, motivo: r.motivo });
    }
    return lista;
  }

  private evento(l: LiquidacionGuardada, estado: string, descripcion: string, fecha: string): void {
    this.eventos.push({
      colaboradorId: l.colaboradorId, fecha, tipo: 'Liquidación', descripcion, usuario: 'Contabilidad',
      periodo: l.periodo, importe: l.resultado.netoConsolidado, estado,
      enlace: { texto: 'Ver detalle', ruta: '/liquidaciones', query: { periodo: l.periodo, liquidacion: l.id } },
    });
  }

  private periodoInvalido(): RespuestaMock {
    return { status: 400, body: { title: 'One or more validation errors occurred.', status: 400, errors: { periodo: ['Elige el mes (yyyy-MM).'] }, codigo: 'Liquidacion.PeriodoInvalido' } };
  }
}

export const liquidacionesMock = new LiquidacionesMock();
