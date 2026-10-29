import { EventoHistorial } from '../../features/colaboradores/models/colaborador.models';
import {
  DocumentoMensual, ETIQUETA_TIPO_DOCUMENTO, FilaDocumento, TipoDocumento,
} from '../../features/documentos/models/documento.models';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../shared/utils/periodo';
import { hoy } from '../../shared/utils/fechas';
import { RespuestaMock, colaboradoresMock } from './colaboradores.mock';
import { r2 } from './calculo.mock';
import { liquidacionesMock } from './liquidaciones.mock';
import { nombreTmr } from './tmr.mock';

/**
 * Documentos tributarios mensuales (sección 8): uno por colaborador y mes (RN 32),
 * con el detalle de qué proyectos y valores cubre (RN 34). El detalle sale de la liquidación,
 * por eso se pide calcular el mes antes de registrar el documento.
 * El archivo adjunto queda fuera hasta definir dónde se guardan los archivos.
 */

interface DocumentoGuardado extends DocumentoMensual {
  anteriores: Omit<DocumentoMensual, 'correcciones'>[];
}

const NUMERO_SRI = /^\d{3}-\d{3}-\d{9}$/;
const conflicto = (codigo: string, detail: string): RespuestaMock =>
  ({ status: 409, body: { title: 'Conflicto', status: 409, detail, codigo } });
const validacion = (codigo: string, campo: string, mensaje: string): RespuestaMock =>
  ({ status: 400, body: { title: 'One or more validation errors occurred.', status: 400, errors: { [campo]: [mensaje] }, codigo } });

function mesAnterior(): string {
  const h = new Date();
  return periodoActual(new Date(h.getFullYear(), h.getMonth() - 1, 1));
}

class DocumentosMock {
  private readonly documentos: DocumentoGuardado[] = [];
  private sembrado = false;

  // ── Para otros mocks ───────────────────────────────────────────────
  tieneDocumento(colaboradorId: string, periodo: string): boolean {
    this.asegurarDatos();
    return this.documentos.some((d) => d.colaboradorId === colaboradorId && d.periodo === periodo);
  }

  eventosDe(colaboradorId: string): EventoHistorial[] {
    this.asegurarDatos();
    return this.documentos.filter((d) => d.colaboradorId === colaboradorId).map((d) => ({
      fecha: d.registradoEn,
      tipo: 'Documento',
      descripcion: `${ETIQUETA_TIPO_DOCUMENTO[d.tipo]} ${d.numero} de ${nombrePeriodo(d.periodo).toLowerCase()}` +
        (d.correcciones ? ` (corregido ${d.correcciones} ${d.correcciones === 1 ? 'vez' : 'veces'}).` : '.'),
      usuario: d.usuario,
      periodo: d.periodo,
      importe: r2(d.detalle.reduce((s, x) => s + x.importe, 0)),
      estado: d.correcciones ? 'Corregido' : 'Registrado',
      enlace: { texto: 'Ver documento', ruta: '/documentos', query: { periodo: d.periodo, colaborador: colaboradorId } },
    }));
  }

  // ── Endpoints ──────────────────────────────────────────────────────
  listar(periodo: string | null): RespuestaMock {
    if (!periodo || !esPeriodoValido(periodo)) return validacion('Documento.PeriodoInvalido', 'periodo', 'Elige el mes.');
    this.asegurarDatos();
    const filas = new Map<string, FilaDocumento>();
    for (const l of liquidacionesMock.delPeriodo(periodo)) {
      filas.set(l.colaboradorId, {
        colaboradorId: l.colaboradorId, colaborador: l.resultado.colaborador, periodo,
        totalCalculado: r2(l.resultado.proyectos.reduce((s, p) => s + p.totalDocumento, 0)),
        proyectos: l.resultado.proyectos.map((p) => ({ tmrProyectoId: p.tmrProyectoId, proyecto: p.proyecto, importe: p.totalDocumento })),
        documento: null,
      });
    }
    for (const d of this.documentos.filter((x) => x.periodo === periodo)) {
      const fila = filas.get(d.colaboradorId) ?? {
        colaboradorId: d.colaboradorId, colaborador: this.nombre(d.colaboradorId), periodo, totalCalculado: null, proyectos: [], documento: null,
      };
      fila.documento = this.publico(d);
      filas.set(d.colaboradorId, fila);
    }
    return { status: 200, body: [...filas.values()].sort((a, b) => a.colaborador.localeCompare(b.colaborador)) };
  }

  registrar(body: Record<string, unknown>): RespuestaMock {
    const v = this.validar(body);
    if ('status' in v) return v;
    if (this.documentos.some((d) => d.colaboradorId === v.colaboradorId && d.periodo === v.periodo))
      return conflicto('Documento.Duplicado', `${this.nombre(v.colaboradorId)} ya tiene documento de ${nombrePeriodo(v.periodo).toLowerCase()}. Es uno por mes (RN 32): usa "Corregir".`);
    const nuevo: DocumentoGuardado = {
      id: crypto.randomUUID(), ...v, registradoEn: new Date().toISOString(), usuario: 'Contabilidad', correcciones: 0, anteriores: [],
    };
    this.documentos.push(nuevo);
    return { status: 201, body: this.publico(nuevo) };
  }

  corregir(id: string, body: Record<string, unknown>): RespuestaMock {
    this.asegurarDatos();
    const d = this.documentos.find((x) => x.id === id);
    if (!d) return { status: 404, body: { title: 'No encontrado', status: 404, detail: 'No existe ese documento.', codigo: 'Documento.NoEncontrado' } };
    const v = this.validar({ ...body, colaboradorId: d.colaboradorId, periodo: d.periodo }, d.id);
    if ('status' in v) return v;
    const { anteriores, correcciones, ...actual } = d;
    d.anteriores = [...anteriores, actual];
    Object.assign(d, v, { registradoEn: new Date().toISOString(), correcciones: correcciones + 1 });
    return { status: 200, body: this.publico(d) };
  }

  // ── Internos ───────────────────────────────────────────────────────
  private validar(body: Record<string, unknown>, idActual?: string):
    Omit<DocumentoMensual, 'id' | 'registradoEn' | 'usuario' | 'correcciones'> | RespuestaMock {
    this.asegurarDatos();
    const colaboradorId = typeof body['colaboradorId'] === 'string' ? body['colaboradorId'] : '';
    const periodo = typeof body['periodo'] === 'string' ? body['periodo'] : '';
    const tipo = body['tipo'];
    const numero = typeof body['numero'] === 'string' ? body['numero'].trim() : '';
    const fecha = body['fechaEmision'];

    if (!colaboradorId) return validacion('Documento.ColaboradorRequerido', 'colaboradorId', 'Elige un colaborador.');
    if (!esPeriodoValido(periodo)) return validacion('Documento.PeriodoInvalido', 'periodo', 'Elige el mes.');
    if (tipo !== 'Factura' && tipo !== 'NotaDeVenta') return validacion('Documento.TipoRequerido', 'tipo', 'Elige factura o nota de venta.');
    if (!NUMERO_SRI.test(numero)) return validacion('Documento.NumeroInvalido', 'numero', 'Usa el formato 001-001-000001234.');
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return validacion('Documento.FechaInvalida', 'fechaEmision', 'Es obligatoria.');
    if (fecha > hoy()) return validacion('Documento.FechaFutura', 'fechaEmision', 'No puede ser una fecha futura.');

    const liquidacion = liquidacionesMock.delPeriodo(periodo).find((l) => l.colaboradorId === colaboradorId);
    if (!liquidacion)
      return conflicto('Documento.SinLiquidacion', `Primero calcula la liquidación de ${nombrePeriodo(periodo).toLowerCase()}: de ahí sale qué proyectos y valores cubre el documento.`);
    if (this.documentos.some((d) => d.id !== idActual && d.colaboradorId === colaboradorId && d.numero === numero))
      return conflicto('Documento.NumeroRepetido', `El número ${numero} ya está registrado para este colaborador en otro mes.`);

    return {
      colaboradorId, periodo, tipo: tipo as TipoDocumento, numero, fechaEmision: fecha,
      observaciones: typeof body['observaciones'] === 'string' && body['observaciones'].trim() ? body['observaciones'].trim().slice(0, 500) : null,
      detalle: liquidacion.resultado.proyectos.map((p) => ({ tmrProyectoId: p.tmrProyectoId, proyecto: p.proyecto, importe: p.totalDocumento })),
    };
  }

  private asegurarDatos(): void {
    if (this.sembrado) return;
    this.sembrado = true;
    const ana = colaboradoresMock.porTmrId('1')?.id;
    const luis = colaboradoresMock.porTmrId('2')?.id;
    const semillas: [string | undefined, string, TipoDocumento, string, number][] = [
      [ana, mesAnterior(), 'Factura', '001-001-000001198', 26],
      [luis, mesAnterior(), 'NotaDeVenta', '002-001-000000541', 27],
      [ana, periodoActual(), 'Factura', '001-001-000001234', 13],
    ];
    for (const [id, periodo, tipo, numero, dia] of semillas) {
      if (!id) continue;
      const l = liquidacionesMock.delPeriodo(periodo).find((x) => x.colaboradorId === id);
      if (!l) continue;
      const fecha = `${periodo}-${String(dia).padStart(2, '0')}`;
      this.documentos.push({
        id: crypto.randomUUID(), colaboradorId: id, periodo, tipo, numero, fechaEmision: fecha, observaciones: null,
        detalle: l.resultado.proyectos.map((p) => ({ tmrProyectoId: p.tmrProyectoId, proyecto: p.proyecto, importe: p.totalDocumento })),
        registradoEn: new Date(`${fecha}T12:00:00`).toISOString(), usuario: 'Contabilidad', correcciones: 0, anteriores: [],
      });
    }
  }

  private nombre(colaboradorId: string): string {
    const tmrId = colaboradoresMock.tmrIdDe(colaboradorId);
    return tmrId ? nombreTmr(tmrId) : 'Colaborador';
  }

  private publico(d: DocumentoGuardado): DocumentoMensual {
    const { anteriores: _, ...resto } = d;
    return { ...resto, detalle: d.detalle.map((x) => ({ ...x })) };
  }
}

export const documentosMock = new DocumentosMock();
