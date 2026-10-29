import { EventoHistorial } from '../../features/colaboradores/models/colaborador.models';
import {
  CandidatoExportacion, Exportacion, PreparacionExportacion,
} from '../../features/exportaciones/models/exportacion.models';
import { ETIQUETA_CORTE, TipoCorte } from '../../shared/models/corte';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../shared/utils/periodo';
import { RespuestaMock, colaboradoresMock } from './colaboradores.mock';
import { r2 } from './calculo.mock';
import { documentosMock } from './documentos.mock';
import { liquidacionesMock } from './liquidaciones.mock';
import { TMR_PERSONAS } from './tmr.mock';

/**
 * Exportaciones del Excel de pago (sección 12). Cada vez que se genera, se guarda una versión
 * con fecha, usuario, mes, corte, colaboradores e importes, y se puede descargar otra vez (RN 55).
 * Exportar no cambia nada a "pagado" ni da por recuperados los anticipos (RN 56).
 *
 * El archivo de ejemplo es un CSV que Excel abre directo. La plantilla real del banco
 * está pendiente (PA 02): cuando llegue, solo cambia cómo el backend arma el archivo.
 */

interface FilaGuardada {
  liquidacionId: string;
  liquidacionVersion: number;
  colaboradorId: string;
  colaborador: string;
  valor: number;
  banco: string | null;
  cuenta: string | null;
}

interface ExportacionGuardada {
  id: string;
  periodo: string;
  corte: TipoCorte;
  version: number;
  generadaEn: string;
  usuario: string;
  filas: FilaGuardada[];
  total: number;
}

const esCorte = (v: unknown): v is TipoCorte => v === 'Quincena' || v === 'FinDeMes';
const validacion = (codigo: string, campo: string, mensaje: string): RespuestaMock =>
  ({ status: 400, body: { title: 'One or more validation errors occurred.', status: 400, errors: { [campo]: [mensaje] }, codigo } });

function mesAnterior(): string {
  const h = new Date();
  return periodoActual(new Date(h.getFullYear(), h.getMonth() - 1, 1));
}

class ExportacionesMock {
  private readonly exportaciones: ExportacionGuardada[] = [];
  private sembrado = false;

  // ── Para otros mocks ───────────────────────────────────────────────
  /** Última versión de exportación de un mes y corte que incluyó a un colaborador. */
  versionExportada(periodo: string, corte: TipoCorte, colaboradorId: string): number | null {
    this.asegurarDatos();
    const versiones = this.exportaciones
      .filter((e) => e.periodo === periodo && e.corte === corte && e.filas.some((f) => f.colaboradorId === colaboradorId))
      .map((e) => e.version);
    return versiones.length ? Math.max(...versiones) : null;
  }

  eventosDe(colaboradorId: string): EventoHistorial[] {
    this.asegurarDatos();
    return this.exportaciones.flatMap((e) => e.filas.filter((f) => f.colaboradorId === colaboradorId).map((f): EventoHistorial => ({
      fecha: e.generadaEn,
      tipo: 'Exportación',
      descripcion: `Exportación ${ETIQUETA_CORTE[e.corte].toLowerCase()} de ${nombrePeriodo(e.periodo).toLowerCase()} (versión ${e.version}). Archivo preparado; no confirma la transferencia.`,
      usuario: e.usuario,
      periodo: e.periodo,
      importe: f.valor,
      estado: `Exportado v${e.version}`,
      enlace: { texto: 'Ver versión', ruta: '/exportaciones', query: { periodo: e.periodo, corte: e.corte } },
    })));
  }

  // ── Endpoints ──────────────────────────────────────────────────────
  preparar(periodo: string | null, corte: string | null): RespuestaMock {
    if (!periodo || !esPeriodoValido(periodo)) return validacion('Exportacion.PeriodoInvalido', 'periodo', 'Elige el mes.');
    if (!esCorte(corte)) return validacion('Exportacion.CorteInvalido', 'corte', 'Elige quincena o fin de mes.');
    this.asegurarDatos();

    const liquidaciones = liquidacionesMock.delPeriodo(periodo);
    const candidatos: CandidatoExportacion[] = liquidaciones
      .map((l) => ({ l, c: l.cortes.find((x) => x.corte === corte) }))
      .filter((x) => x.c && x.c.valor > 0)
      .map(({ l, c }) => {
        const datos = colaboradoresMock.paraCalculo(l.colaboradorId);
        const documento = documentosMock.tieneDocumento(l.colaboradorId, periodo);
        const requiere = liquidacionesMock.requiereRecalculo(l);
        const version = this.versionExportada(periodo, corte, l.colaboradorId);
        const advertencias: string[] = [];
        if (version) advertencias.push(`Ya salió en la versión ${version}. Si lo incluyes, se repite en el archivo nuevo.`);
        if (!l.revisado) advertencias.push('No está marcada como "Revisado para envío".');
        if (requiere) advertencias.push('Algo cambió después del cálculo: recalcula antes de exportar.');
        if (!documento) advertencias.push('Falta el documento tributario. No impide exportar (RN 57).');
        if (!datos?.cuenta) advertencias.push('No tiene cuenta bancaria registrada.');
        return {
          liquidacionId: l.id, colaboradorId: l.colaboradorId, colaborador: l.resultado.colaborador,
          valor: c!.valor, banco: datos?.cuenta?.banco ?? null, cuenta: datos?.cuenta?.numero ?? null,
          revisado: l.revisado, documentoRegistrado: documento, requiereRecalculo: requiere,
          versionExportada: version, advertencias,
        };
      })
      .sort((a, b) => a.colaborador.localeCompare(b.colaborador));

    const body: PreparacionExportacion = {
      periodo, corte, calculado: liquidaciones.length > 0, candidatos,
      siguienteVersion: this.ultimaVersion(periodo, corte) + 1,
    };
    return { status: 200, body };
  }

  listar(periodo: string | null): RespuestaMock {
    this.asegurarDatos();
    const lista = this.exportaciones
      .filter((e) => !periodo || e.periodo === periodo)
      .sort((a, b) => b.generadaEn.localeCompare(a.generadaEn))
      .map((e) => this.publica(e));
    return { status: 200, body: lista };
  }

  generar(body: Record<string, unknown>): RespuestaMock {
    const periodo = typeof body['periodo'] === 'string' ? body['periodo'] : '';
    const corte = body['corte'];
    const ids = body['liquidacionIds'];
    if (!esPeriodoValido(periodo)) return validacion('Exportacion.PeriodoInvalido', 'periodo', 'Elige el mes.');
    if (!esCorte(corte)) return validacion('Exportacion.CorteInvalido', 'corte', 'Elige quincena o fin de mes.');
    if (!Array.isArray(ids) || ids.length === 0)
      return validacion('Exportacion.SinColaboradores', 'liquidacionIds', 'Selecciona al menos un colaborador.');
    this.asegurarDatos();

    const filas: FilaGuardada[] = [];
    for (const id of ids) {
      const l = typeof id === 'string' ? liquidacionesMock.porId(id) : null;
      const c = l?.cortes.find((x) => x.corte === corte);
      if (!l || l.periodo !== periodo || !c || c.valor <= 0)
        return validacion('Exportacion.SeleccionInvalida', 'liquidacionIds', 'Algún colaborador no tiene valor para este corte. Vuelve a cargar la lista.');
      const datos = colaboradoresMock.paraCalculo(l.colaboradorId);
      filas.push({
        liquidacionId: l.id, liquidacionVersion: l.version, colaboradorId: l.colaboradorId, colaborador: l.resultado.colaborador,
        valor: c.valor, banco: datos?.cuenta?.banco ?? null, cuenta: datos?.cuenta?.numero ?? null,
      });
    }
    const nueva = this.guardar(periodo, corte, filas, new Date().toISOString());
    return { status: 201, body: this.publica(nueva) };
  }

  /** El mismo archivo que se generó, sin crear otra versión. */
  archivo(id: string): RespuestaMock {
    this.asegurarDatos();
    const e = this.exportaciones.find((x) => x.id === id);
    if (!e) return { status: 404, body: { title: 'No encontrado', status: 404, detail: 'No existe esa exportación.', codigo: 'Exportacion.NoEncontrada' } };
    const numero = (v: number) => v.toFixed(2).replace('.', ',');
    const lineas = [
      ['Colaborador', 'Identificación', 'Banco', 'Cuenta', 'Valor'].join(';'),
      ...e.filas.map((f) => {
        const tmrId = colaboradoresMock.tmrIdDe(f.colaboradorId);
        const identificacion = TMR_PERSONAS.find((p) => p.tmrColaboradorId === tmrId)?.identificacion ?? '';
        return [f.colaborador, identificacion, f.banco ?? '', f.cuenta ?? '', numero(f.valor)].join(';');
      }),
      ['Total', '', '', '', numero(e.total)].join(';'),
    ];
    // BOM para que Excel lea bien las tildes.
    return { status: 200, body: new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }) };
  }

  // ── Internos ───────────────────────────────────────────────────────
  private asegurarDatos(): void {
    if (this.sembrado) return;
    this.sembrado = true;
    // Mes anterior: los dos cortes exportados. Mes actual: solo la quincena.
    for (const [periodo, corte, dia] of [
      [mesAnterior(), 'Quincena', 14], [mesAnterior(), 'FinDeMes', 28], [periodoActual(), 'Quincena', 14],
    ] as [string, TipoCorte, number][]) {
      const filas = liquidacionesMock.delPeriodo(periodo)
        .filter((l) => l.revisado)
        .map((l) => ({ l, c: l.cortes.find((x) => x.corte === corte) }))
        .filter((x) => x.c && x.c.valor > 0)
        .map(({ l, c }) => {
          const datos = colaboradoresMock.paraCalculo(l.colaboradorId);
          return {
            liquidacionId: l.id, liquidacionVersion: l.version, colaboradorId: l.colaboradorId, colaborador: l.resultado.colaborador,
            valor: c!.valor, banco: datos?.cuenta?.banco ?? null, cuenta: datos?.cuenta?.numero ?? null,
          };
        });
      if (filas.length) this.guardar(periodo, corte, filas, new Date(`${periodo}-${dia}T15:00:00`).toISOString());
    }
  }

  private guardar(periodo: string, corte: TipoCorte, filas: FilaGuardada[], fecha: string): ExportacionGuardada {
    const e: ExportacionGuardada = {
      id: crypto.randomUUID(), periodo, corte, version: this.ultimaVersion(periodo, corte) + 1,
      generadaEn: fecha, usuario: 'Contabilidad', filas, total: r2(filas.reduce((s, f) => s + f.valor, 0)),
    };
    this.exportaciones.push(e);
    return e;
  }

  private ultimaVersion(periodo: string, corte: TipoCorte): number {
    return Math.max(0, ...this.exportaciones.filter((e) => e.periodo === periodo && e.corte === corte).map((e) => e.version));
  }

  private publica(e: ExportacionGuardada): Exportacion {
    // Desactualizada: después de generarla cambió el valor del corte de alguien (control propuesto).
    const desactualizada = e.filas.some((f) => {
      const l = liquidacionesMock.porId(f.liquidacionId);
      const actual = l?.cortes.find((c) => c.corte === e.corte)?.valor;
      return !l || (l.version !== f.liquidacionVersion && actual !== f.valor) || liquidacionesMock.requiereRecalculo(l);
    });
    return {
      id: e.id, periodo: e.periodo, corte: e.corte, version: e.version, generadaEn: e.generadaEn, usuario: e.usuario,
      filas: e.filas.map(({ colaboradorId, colaborador, valor, banco, cuenta }) => ({ colaboradorId, colaborador, valor, banco, cuenta })),
      total: e.total,
      vigente: e.version === this.ultimaVersion(e.periodo, e.corte),
      desactualizada,
      nombreArchivo: `RPS_${e.periodo}_${e.corte === 'Quincena' ? 'quincena' : 'fin-de-mes'}_v${e.version}.csv`,
    };
  }
}

export const exportacionesMock = new ExportacionesMock();
