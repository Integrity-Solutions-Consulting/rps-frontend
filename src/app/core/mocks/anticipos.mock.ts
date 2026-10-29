import { Anticipo, CorteDisponible, CuotaAnticipo, ResumenAnticipos } from '../../features/anticipos/models/anticipo.models';
import { EventoHistorial } from '../../features/colaboradores/models/colaborador.models';
import { ETIQUETA_CORTE, TipoCorte } from '../../shared/models/corte';
import { nombrePeriodo, periodoActual } from '../../shared/utils/periodo';
import { RespuestaMock, colaboradoresMock } from './colaboradores.mock';
import { calcularColaborador, esResultado, r2 } from './calculo.mock';
import { configuracionMock } from './configuracion.mock';
import { exportacionesMock } from './exportaciones.mock';
import { TMR_PERSONAS, nombreTmr } from './tmr.mock';

/**
 * Anticipos adicionales en memoria, con las reglas de la sección 10 (RN 41 a 47).
 *
 * Saldo pendiente = cuotas que todavía no se descuentan. Aquí una cuota se da por aplicada
 * cuando su mes ya terminó; el hito real está pendiente de definir con Contabilidad.
 */

interface AnticipoGuardado extends Omit<Anticipo, 'cuotas'> {
  cuotas: { id: string; corte: TipoCorte; monto: number }[];
}

const CORTES: TipoCorte[] = ['Quincena', 'FinDeMes'];
const dinero = (v: number) => v.toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
const conflicto = (codigo: string, detail: string): RespuestaMock =>
  ({ status: 409, body: { title: 'Conflicto', status: 409, detail, codigo } });
const validacion = (codigo: string, campo: string, mensaje: string): RespuestaMock =>
  ({ status: 400, body: { title: 'One or more validation errors occurred.', status: 400, errors: { [campo]: [mensaje] }, codigo } });
/** Mayor que cero y con máximo dos decimales. */
const esMonto = (v: unknown): v is number =>
  typeof v === 'number' && v > 0 && Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

/** Mes anterior al actual, "yyyy-MM". */
function mesAnterior(): string {
  const h = new Date();
  return periodoActual(new Date(h.getFullYear(), h.getMonth() - 1, 1));
}

class AnticiposMock {
  private readonly anticipos: AnticipoGuardado[] = [];

  constructor() {
    const ana = colaboradoresMock.porTmrId('1')?.id;
    const luis = colaboradoresMock.porTmrId('2')?.id;
    // Ejemplo de los requisitos: $500 recuperados con $200 en quincena y $300 a fin de mes (RN 44).
    if (ana) {
      this.sembrar(ana, mesAnterior(), 5, 300, [['Quincena', 100], ['FinDeMes', 200]], 1460, 'Reparación de equipo.');
      this.sembrar(ana, periodoActual(), 5, 500, [['Quincena', 200], ['FinDeMes', 300]], 960, 'Anticipo adicional por gastos médicos.');
    }
    if (luis) this.sembrar(luis, periodoActual(), 8, 300, [['FinDeMes', 300]], 800, null);
  }

  // ── Para otros mocks ───────────────────────────────────────────────
  /** Cuotas de un colaborador en un mes, por corte: lo que la liquidación resta (RN 38). */
  cuotasDe(colaboradorId: string, periodo: string): Record<TipoCorte, number> {
    const suma = { Quincena: 0, FinDeMes: 0 };
    for (const a of this.anticipos.filter((x) => x.colaboradorId === colaboradorId && x.periodo === periodo))
      for (const c of a.cuotas) suma[c.corte] = r2(suma[c.corte] + c.monto);
    return suma;
  }

  eventosDe(colaboradorId: string): EventoHistorial[] {
    return this.anticipos.filter((a) => a.colaboradorId === colaboradorId).map((a) => ({
      fecha: a.registradoEn,
      tipo: 'Anticipo',
      descripcion: `Anticipo adicional de ${dinero(a.monto)}. Recuperación: ${a.cuotas.map((c) => `${ETIQUETA_CORTE[c.corte].toLowerCase()} ${dinero(c.monto)}`).join(', ')}.`,
      usuario: a.usuario,
      periodo: a.periodo,
      importe: a.monto,
      estado: a.periodo < periodoActual() ? 'Recuperado' : 'Registrado',
      enlace: { texto: 'Ver plan', ruta: '/anticipos', query: { colaborador: colaboradorId } },
    }));
  }

  // ── Endpoints ──────────────────────────────────────────────────────
  listar(colaboradorId: string | null): RespuestaMock {
    if (!colaboradorId) return validacion('Anticipo.ColaboradorRequerido', 'colaboradorId', 'Elige un colaborador.');
    const lista = this.anticipos
      .filter((a) => a.colaboradorId === colaboradorId)
      .sort((a, b) => b.registradoEn.localeCompare(a.registradoEn))
      .map((a) => this.publico(a));
    return { status: 200, body: lista };
  }

  resumen(colaboradorId: string | null, periodo: string | null): RespuestaMock {
    if (!colaboradorId) return validacion('Anticipo.ColaboradorRequerido', 'colaboradorId', 'Elige un colaborador.');
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return validacion('Anticipo.PeriodoInvalido', 'periodo', 'Elige el mes.');
    const datos = colaboradoresMock.paraCalculo(colaboradorId);
    if (!datos) return { status: 404, body: { title: 'No encontrado', status: 404, detail: 'No existe el colaborador.', codigo: 'Colaborador.NoEncontrado' } };

    const persona = TMR_PERSONAS.find((p) => p.tmrColaboradorId === datos.tmrColaboradorId);
    const calculo = calcularColaborador(colaboradorId, periodo);
    const limitePct = configuracionMock.pctEn('LimiteAnticiposPct', periodo);
    const saldo = this.saldoPendiente(colaboradorId);
    const cuotas = this.cuotasDe(colaboradorId, periodo);

    let bloqueo: string | null = null;
    if (!datos.activo) bloqueo = 'El colaborador está desactivado en RPS.';
    else if (calculo === null) bloqueo = `No tiene proyectos con días en ${nombrePeriodo(periodo).toLowerCase()}: no hay de dónde recuperar un anticipo.`;
    else if (!esResultado(calculo)) bloqueo = `No se puede calcular su neto: ${calculo.motivo}`;
    else if (periodo < periodoActual()) bloqueo = 'Ese mes ya terminó. Los anticipos se registran para el mes en curso o los siguientes.';

    const ok = esResultado(calculo) ? calculo : null;
    const limite = ok ? r2(ok.netoReferencia * limitePct / 100) : null;
    const cortesAplican = ok ? CORTES.filter((c) => c === 'FinDeMes' || ok.frecuencia === 'DosPagos') : [];
    const cortes: CorteDisponible[] = cortesAplican.map((corte) => ({
      corte,
      base: ok!.bases[corte],
      cuotasProgramadas: cuotas[corte],
      disponible: Math.max(0, r2(ok!.bases[corte] - cuotas[corte])),
      versionExportada: exportacionesMock.versionExportada(periodo, corte, colaboradorId),
    }));

    const body: ResumenAnticipos = {
      colaboradorId,
      colaborador: nombreTmr(datos.tmrColaboradorId),
      identificacion: persona?.identificacion ?? '',
      clasificacion: datos.clasificacion,
      frecuencia: datos.frecuenciaEn(periodo),
      periodo,
      netoReferencia: ok?.netoReferencia ?? null,
      proyectos: ok?.referenciaPorProyecto ?? [],
      saldoPendiente: saldo,
      limitePct,
      limite,
      disponible: limite === null ? null : r2(limite - saldo),
      cortes,
      bloqueo,
    };
    return { status: 200, body };
  }

  registrar(body: Record<string, unknown>): RespuestaMock {
    const colaboradorId = typeof body['colaboradorId'] === 'string' ? body['colaboradorId'] : '';
    const fecha = body['fecha'];
    const monto = body['monto'];
    const cuotasEntrada = body['cuotas'];

    if (!colaboradorId) return validacion('Anticipo.ColaboradorRequerido', 'colaboradorId', 'Elige un colaborador.');
    if (!esMonto(monto)) return validacion('Anticipo.MontoInvalido', 'monto', 'Debe ser mayor que cero y con máximo dos decimales.');
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return validacion('Anticipo.FechaInvalida', 'fecha', 'Es obligatoria.');
    if (!Array.isArray(cuotasEntrada) || cuotasEntrada.length === 0)
      return validacion('Anticipo.CuotasRequeridas', 'cuotas', 'Agrega al menos una cuota de recuperación (RN 46).');

    const cuotas: { corte: TipoCorte; monto: number }[] = [];
    for (const c of cuotasEntrada as Record<string, unknown>[]) {
      const corte = c['corte'];
      if (corte !== 'Quincena' && corte !== 'FinDeMes') return validacion('Anticipo.CorteInvalido', 'cuotas', 'Cada cuota debe indicar el corte.');
      if (!esMonto(c['monto'])) return validacion('Anticipo.CuotaInvalida', 'cuotas', 'Cada cuota debe ser mayor que cero y con máximo dos decimales (RN 47).');
      cuotas.push({ corte, monto: c['monto'] as number });
    }
    const suma = r2(cuotas.reduce((s, c) => s + c.monto, 0));
    if (suma !== r2(monto))
      return validacion('Anticipo.CuotasNoSuman', 'cuotas', `Las cuotas suman ${dinero(suma)} y el anticipo es de ${dinero(monto)}. Deben coincidir (RN 47).`);

    const periodo = fecha.slice(0, 7);
    const resumen = this.resumen(colaboradorId, periodo);
    if (resumen.status !== 200) return resumen;
    const r = resumen.body as ResumenAnticipos;
    if (r.bloqueo) return conflicto('Anticipo.NoPermitido', r.bloqueo);

    // RN 42: el saldo pendiente más el nuevo anticipo no puede superar el límite (igualdad permitida).
    if (r.limite !== null && r2(r.saldoPendiente + monto) > r.limite)
      return conflicto('Anticipo.SuperaLimite',
        `Con este anticipo los pendientes sumarían ${dinero(r2(r.saldoPendiente + monto))} y el límite es ${dinero(r.limite)} ` +
        `(${r.limitePct} % de su neto mensual). Puede pedir hasta ${dinero(Math.max(0, r.disponible ?? 0))}.`);

    // RN 47: cada corte debe alcanzar para su cuota, sin quedar en negativo.
    for (const corte of CORTES) {
      const pedido = r2(cuotas.filter((c) => c.corte === corte).reduce((s, c) => s + c.monto, 0));
      if (pedido === 0) continue;
      const info = r.cortes.find((c) => c.corte === corte);
      if (!info)
        return conflicto('Anticipo.CorteNoAplica', `${r.colaborador} cobra solo a fin de mes: no puede tener cuotas en la quincena.`);
      if (info.versionExportada)
        return conflicto('Anticipo.CorteExportado', `${ETIQUETA_CORTE[corte]} de ${nombrePeriodo(periodo).toLowerCase()} ya se exportó (versión ${info.versionExportada}). Programa la cuota en otro corte.`);
      if (pedido > info.disponible)
        return conflicto('Anticipo.SuperaCorte', `${ETIQUETA_CORTE[corte]} solo tiene ${dinero(info.disponible)} disponibles para descontar; la cuota es de ${dinero(pedido)}.`);
    }

    const nuevo = this.sembrar(colaboradorId, periodo, Number(fecha.slice(8, 10)), monto, cuotas.map((c) => [c.corte, c.monto]),
      r.netoReferencia ?? 0, typeof body['observaciones'] === 'string' && body['observaciones'].trim() ? body['observaciones'].trim().slice(0, 500) : null,
      new Date().toISOString());
    return { status: 201, body: this.publico(nuevo) };
  }

  // ── Internos ───────────────────────────────────────────────────────
  private saldoPendiente(colaboradorId: string): number {
    return r2(this.anticipos
      .filter((a) => a.colaboradorId === colaboradorId)
      .flatMap((a) => this.publico(a).cuotas)
      .filter((c) => c.estado === 'Programada')
      .reduce((s, c) => s + c.monto, 0));
  }

  private publico(a: AnticipoGuardado): Anticipo {
    const estado: CuotaAnticipo['estado'] = a.periodo < periodoActual() ? 'Aplicada' : 'Programada';
    return { ...a, cuotas: a.cuotas.map((c) => ({ ...c, estado })) };
  }

  private sembrar(
    colaboradorId: string, periodo: string, dia: number, monto: number, cuotas: [TipoCorte, number][],
    netoReferencia: number, observaciones: string | null, registradoEn?: string,
  ): AnticipoGuardado {
    const fecha = `${periodo}-${String(dia).padStart(2, '0')}`;
    const limitePct = configuracionMock.pctEn('LimiteAnticiposPct', periodo);
    const a: AnticipoGuardado = {
      id: crypto.randomUUID(), colaboradorId, fecha, periodo, monto, observaciones,
      cuotas: cuotas.map(([corte, m]) => ({ id: crypto.randomUUID(), corte, monto: m })),
      netoReferencia, limite: r2(netoReferencia * limitePct / 100),
      registradoEn: registradoEn ?? new Date(`${fecha}T11:00:00`).toISOString(),
      usuario: 'Contabilidad',
    };
    this.anticipos.push(a);
    return a;
  }
}

export const anticiposMock = new AnticiposMock();
