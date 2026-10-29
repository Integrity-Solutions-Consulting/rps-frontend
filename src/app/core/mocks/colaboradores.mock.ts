import {
  Clasificacion, ColaboradorDetalle, ColaboradorResumen, CuentaBancaria, ETIQUETA_CLASIFICACION, ETIQUETA_FRECUENCIA,
  EstadoConfiguracion, EventoHistorial, Frecuencia, FrecuenciaVigencia, TipoEvento,
} from '../../features/colaboradores/models/colaborador.models';

/**
 * Copia en memoria de Features/Colaboradores del backend, con sus mismas reglas y códigos de error.
 * Responde objetos directos y errores ProblemDetails, igual que la API real.
 * Además guarda un historial de movimientos para la pestaña Historial (endpoint propuesto).
 * Los cambios se pierden al recargar la página.
 */

export interface RespuestaMock {
  status: number;
  body: unknown;
}

interface CuentaGuardada extends CuentaBancaria {
  activa: boolean;
  registradaEn: string;
}

interface Registro {
  colaborador: ColaboradorResumen;
  frecuencias: FrecuenciaVigencia[];
  cuentas: CuentaGuardada[];
  eventos: EventoHistorial[];
}

const USUARIO = 'Contabilidad';
const ahora = () => new Date().toISOString();

function mesActual(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
}

function mesRelativo(meses: number): string {
  const h = new Date();
  const d = new Date(h.getFullYear(), h.getMonth() + meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** "2026-11-01" → "noviembre 2026" para los textos del historial. */
function mesEnTexto(fecha: string): string {
  const [a, m] = fecha.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
}

// ── Respuestas de error con el mismo formato que ResultadoHttp.AHttp ──
function noEncontrado(codigo: string, detalle: string): RespuestaMock {
  return { status: 404, body: { title: 'No encontrado', status: 404, detail: detalle, codigo } };
}
function conflicto(codigo: string, detalle: string): RespuestaMock {
  return { status: 409, body: { title: 'Conflicto', status: 409, detail: detalle, codigo } };
}
function validacion(codigo: string, campo: string, mensaje: string): RespuestaMock {
  return {
    status: 400,
    body: { title: 'One or more validation errors occurred.', status: 400, errors: { [campo]: [mensaje] }, codigo },
  };
}
const ok = (body: unknown, status = 200): RespuestaMock => ({ status, body });

const DESACTIVADO = () =>
  conflicto('Colaborador.Desactivado', 'El colaborador está desactivado. Actívalo antes de modificar su configuración.');

class ColaboradoresMock {
  private readonly registros = new Map<string, Registro>();

  constructor() {
    this.sembrar('1', 'Profesional', [['DosPagos', mesRelativo(-9)]], { banco: 'Banco Pichincha', tipo: 'Ahorros', numero: '****4521' }, 300);
    this.sembrar('2', 'Junior', [['FinDeMes', mesRelativo(-7)], ['DosPagos', mesRelativo(1)]], { banco: 'Banco Guayaquil', tipo: 'Corriente', numero: '****8830' }, 240);
    this.sembrar('4', 'Profesional', [], null, 200);
    this.sembrar('10', null, [['DosPagos', mesRelativo(-6)]], null, 190);
    const inactivo = this.sembrar('9', 'Profesional', [['FinDeMes', mesRelativo(-20)]], { banco: 'Produbanco', tipo: 'Ahorros', numero: '****1207' }, 600);
    inactivo.colaborador.activo = false;
    this.evento(inactivo, 'Estado', 'Colaborador desactivado: terminó su asignación en TMR.', new Date(2026, 0, 5).toISOString());
  }

  /** Para otros mocks: el colaborador de RPS vinculado a un ID de TMR. */
  porTmrId(tmrId: string): { id: string; activo: boolean } | null {
    const r = [...this.registros.values()].find((x) => x.colaborador.tmrColaboradorId === tmrId);
    return r ? { id: r.colaborador.id, activo: r.colaborador.activo } : null;
  }

  /** Para otros mocks: el ID de TMR de un colaborador de RPS. */
  tmrIdDe(id: string): string | null {
    return this.registros.get(id)?.colaborador.tmrColaboradorId ?? null;
  }

  // ── Endpoints ──────────────────────────────────────────────────────
  listar(estado: string | null, activo: string | null): RespuestaMock {
    const lista = [...this.registros.values()]
      .map((r) => ({ ...r.colaborador }))
      .filter((c) => !estado || c.estadoConfiguracion === estado)
      .filter((c) => activo === null || String(c.activo) === activo)
      .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
    return ok(lista);
  }

  obtener(id: string): RespuestaMock {
    const r = this.registros.get(id);
    return r ? ok(this.detalle(r)) : this.noExiste(id);
  }

  crear(body: { tmrColaboradorId?: string | null; clasificacion?: Clasificacion | null }): RespuestaMock {
    const tmrId = body.tmrColaboradorId?.trim() ?? '';
    if (!tmrId || tmrId.length > 50)
      return validacion('Colaborador.TmrIdInvalido', 'tmrColaboradorId', 'Es obligatorio y debe tener máximo 50 caracteres.');
    if ([...this.registros.values()].some((r) => r.colaborador.tmrColaboradorId === tmrId))
      return conflicto('Colaborador.TmrDuplicado', `Ya existe un colaborador con TmrColaboradorId '${tmrId}'.`);
    const r = this.sembrar(tmrId, body.clasificacion ?? null, [], null, 0);
    return ok(this.detalle(r), 201);
  }

  actualizarClasificacion(id: string, clasificacion: Clasificacion | null): RespuestaMock {
    const r = this.registros.get(id);
    if (!r) return this.noExiste(id);
    if (!r.colaborador.activo) return DESACTIVADO();
    r.colaborador.clasificacion = clasificacion;
    this.recalcular(r);
    this.evento(r, 'Clasificación', clasificacion ? `Clasificación: ${ETIQUETA_CLASIFICACION[clasificacion]}.` : 'Clasificación eliminada.');
    return ok(this.detalle(r));
  }

  cambiarActivo(id: string, activo: boolean): RespuestaMock {
    const r = this.registros.get(id);
    if (!r) return this.noExiste(id);
    if (r.colaborador.activo !== activo) {
      r.colaborador.activo = activo;
      r.colaborador.actualizadoEn = ahora();
      this.evento(r, 'Estado', activo ? 'Colaborador activado.' : 'Colaborador desactivado. Su historial se conserva.');
    }
    return ok(this.detalle(r));
  }

  listarFrecuencias(id: string): RespuestaMock {
    const r = this.registros.get(id);
    if (!r) return this.noExiste(id);
    return ok([...r.frecuencias].sort((a, b) => b.vigenteDesdeMes.localeCompare(a.vigenteDesdeMes)));
  }

  registrarFrecuencia(id: string, body: { frecuencia?: Frecuencia | null; vigenteDesdeMes?: string | null }): RespuestaMock {
    const v = this.validarFrecuencia(body);
    if ('status' in v) return v;
    const r = this.registros.get(id);
    if (!r) return this.noExiste(id);
    if (!r.colaborador.activo) return DESACTIVADO();
    if (r.frecuencias.some((f) => f.vigenteDesdeMes === v.mes))
      return conflicto('Colaborador.FrecuenciaDuplicada', `El colaborador ya tiene una frecuencia registrada desde ${v.mes}.`);
    const nueva: FrecuenciaVigencia = { id: crypto.randomUUID(), frecuencia: v.frecuencia, vigenteDesdeMes: v.mes };
    r.frecuencias.push(nueva);
    this.recalcular(r);
    this.evento(r, 'Frecuencia', `Frecuencia "${ETIQUETA_FRECUENCIA[v.frecuencia]}" desde ${mesEnTexto(v.mes)}.`);
    return ok(nueva, 201);
  }

  editarFrecuencia(id: string, frecuenciaId: string, body: { frecuencia?: Frecuencia | null; vigenteDesdeMes?: string | null }): RespuestaMock {
    const v = this.validarFrecuencia(body);
    if ('status' in v) return v;
    if (v.mes <= mesActual())
      return validacion('Colaborador.VigenteDesdeMesNoFuturo', 'vigenteDesdeMes', 'Al editar, el nuevo mes debe ser posterior al mes actual.');
    const r = this.registros.get(id);
    if (!r) return this.noExiste(id);
    if (!r.colaborador.activo) return DESACTIVADO();
    const f = r.frecuencias.find((x) => x.id === frecuenciaId);
    if (!f) return this.frecuenciaNoExiste(frecuenciaId);
    if (f.vigenteDesdeMes <= mesActual()) return this.noModificable();
    if (r.frecuencias.some((x) => x.vigenteDesdeMes === v.mes && x.id !== frecuenciaId))
      return conflicto('Colaborador.FrecuenciaDuplicada', `El colaborador ya tiene una frecuencia registrada desde ${v.mes}.`);
    f.frecuencia = v.frecuencia;
    f.vigenteDesdeMes = v.mes;
    r.colaborador.actualizadoEn = ahora();
    this.evento(r, 'Frecuencia', `Frecuencia programada corregida: "${ETIQUETA_FRECUENCIA[v.frecuencia]}" desde ${mesEnTexto(v.mes)}.`);
    return ok({ ...f });
  }

  eliminarFrecuencia(id: string, frecuenciaId: string): RespuestaMock {
    const r = this.registros.get(id);
    if (!r) return this.noExiste(id);
    if (!r.colaborador.activo) return DESACTIVADO();
    const f = r.frecuencias.find((x) => x.id === frecuenciaId);
    if (!f) return this.frecuenciaNoExiste(frecuenciaId);
    if (f.vigenteDesdeMes <= mesActual()) return this.noModificable();
    r.frecuencias = r.frecuencias.filter((x) => x.id !== frecuenciaId);
    this.recalcular(r);
    this.evento(r, 'Frecuencia', `Se canceló la frecuencia programada para ${mesEnTexto(f.vigenteDesdeMes)}.`);
    return ok(null, 204);
  }

  registrarCuenta(id: string, body: { banco?: string | null; tipoCuenta?: string | null; numeroCuenta?: string | null }): RespuestaMock {
    const numero = body.numeroCuenta?.trim() ?? '';
    if (!numero || numero.length > 30 || !/^\d+$/.test(numero))
      return validacion('Colaborador.NumeroCuentaInvalido', 'numeroCuenta', 'Es obligatorio, solo dígitos y máximo 30 caracteres.');
    const banco = body.banco?.trim() ?? '';
    if (banco.length > 100) return validacion('Colaborador.BancoInvalido', 'banco', 'Debe tener máximo 100 caracteres.');
    const tipo = body.tipoCuenta?.trim() ?? '';
    if (tipo.length > 20) return validacion('Colaborador.TipoCuentaInvalido', 'tipoCuenta', 'Debe tener máximo 20 caracteres.');
    const r = this.registros.get(id);
    if (!r) return this.noExiste(id);
    if (!r.colaborador.activo) return DESACTIVADO();
    r.cuentas.forEach((c) => (c.activa = false));
    const cuenta: CuentaGuardada = {
      id: crypto.randomUUID(), banco: banco || null, tipoCuenta: tipo || null,
      numeroCuentaEnmascarado: numero.length <= 4 ? '*'.repeat(numero.length) : `****${numero.slice(-4)}`,
      activa: true, registradaEn: ahora(),
    };
    r.cuentas.push(cuenta);
    this.recalcular(r);
    this.evento(r, 'Cuenta bancaria', `Cuenta ${cuenta.numeroCuentaEnmascarado}${cuenta.banco ? ' en ' + cuenta.banco : ''} registrada. La anterior queda como historial.`);
    return ok(this.sinInterno(cuenta));
  }

  /** GET /api/colaboradores/{id}/historial (propuesto). Solo los movimientos propios del colaborador. */
  historial(id: string): EventoHistorial[] | null {
    return this.registros.get(id)?.eventos ?? null;
  }

  // ── Reglas internas (mismas que ColaboradorEstado y ConstruirDetalleAsync) ──
  private recalcular(r: Registro): void {
    const configurado = r.colaborador.clasificacion !== null && r.frecuencias.length > 0 && r.cuentas.some((c) => c.activa);
    r.colaborador.estadoConfiguracion = (configurado ? 'Configurado' : 'Pendiente') as EstadoConfiguracion;
    r.colaborador.actualizadoEn = ahora();
  }

  private detalle(r: Registro): ColaboradorDetalle {
    const vigente = [...r.frecuencias]
      .filter((f) => f.vigenteDesdeMes <= mesActual())
      .sort((a, b) => b.vigenteDesdeMes.localeCompare(a.vigenteDesdeMes))[0] ?? null;
    const cuenta = r.cuentas.find((c) => c.activa) ?? null;
    return {
      ...r.colaborador,
      frecuenciaVigente: vigente ? { ...vigente } : null,
      cuentaBancaria: cuenta ? this.sinInterno(cuenta) : null,
    };
  }

  private sinInterno(c: CuentaGuardada): CuentaBancaria {
    return { id: c.id, banco: c.banco, tipoCuenta: c.tipoCuenta, numeroCuentaEnmascarado: c.numeroCuentaEnmascarado };
  }

  private evento(r: Registro, tipo: TipoEvento, descripcion: string, fecha: string = ahora()): void {
    r.eventos.push({ fecha, tipo, descripcion, usuario: USUARIO });
  }

  private validarFrecuencia(body: { frecuencia?: Frecuencia | null; vigenteDesdeMes?: string | null }):
    { frecuencia: Frecuencia; mes: string } | RespuestaMock {
    if (!body.frecuencia)
      return validacion('Colaborador.FrecuenciaRequerida', 'frecuencia', 'Es obligatoria (DosPagos o FinDeMes).');
    if (!body.vigenteDesdeMes || !/^\d{4}-\d{2}-01$/.test(body.vigenteDesdeMes))
      return validacion('Colaborador.VigenteDesdeMesInvalido', 'vigenteDesdeMes', 'Es obligatoria y debe ser el primer día del mes (ej. 2026-11-01).');
    return { frecuencia: body.frecuencia, mes: body.vigenteDesdeMes };
  }

  private noExiste(id: string) {
    return noEncontrado('Colaborador.NoEncontrado', `No existe un colaborador con id '${id}'.`);
  }
  private frecuenciaNoExiste(id: string) {
    return noEncontrado('Colaborador.FrecuenciaNoEncontrada', `El colaborador no tiene una frecuencia con id '${id}'.`);
  }
  private noModificable() {
    return conflicto('Colaborador.FrecuenciaNoModificable', 'Solo se pueden editar o eliminar frecuencias de meses que aún no empiezan.');
  }

  /** Crea un colaborador de ejemplo con sus eventos, como si se hubiera registrado hace `haceDias` días. */
  private sembrar(
    tmrId: string, clasificacion: Clasificacion | null, frecuencias: [Frecuencia, string][],
    cuenta: { banco: string; tipo: string; numero: string } | null, haceDias: number,
  ): Registro {
    const id = crypto.randomUUID();
    const creado = new Date(Date.now() - haceDias * 86_400_000).toISOString();
    const despues = (dias: number) => new Date(Date.now() - (haceDias - dias) * 86_400_000).toISOString();
    const r: Registro = {
      colaborador: {
        id, tmrColaboradorId: tmrId, clasificacion, estadoConfiguracion: 'Pendiente',
        activo: true, creadoEn: creado, actualizadoEn: creado,
      },
      frecuencias: frecuencias.map(([frecuencia, vigenteDesdeMes]) => ({ id: crypto.randomUUID(), frecuencia, vigenteDesdeMes })),
      cuentas: cuenta
        ? [{ id: crypto.randomUUID(), banco: cuenta.banco, tipoCuenta: cuenta.tipo, numeroCuentaEnmascarado: cuenta.numero, activa: true, registradaEn: despues(2) }]
        : [],
      eventos: [],
    };
    this.registros.set(id, r);

    this.evento(r, 'Vinculación', `Vinculado en RPS con el ID de TMR ${tmrId}.`, creado);
    if (clasificacion) this.evento(r, 'Clasificación', `Clasificación: ${ETIQUETA_CLASIFICACION[clasificacion]}.`, despues(1));
    r.frecuencias.forEach((f, i) =>
      this.evento(r, 'Frecuencia', `Frecuencia "${ETIQUETA_FRECUENCIA[f.frecuencia]}" desde ${mesEnTexto(f.vigenteDesdeMes)}.`, despues(1 + i)));
    if (cuenta) this.evento(r, 'Cuenta bancaria', `Cuenta ${cuenta.numero} en ${cuenta.banco} registrada.`, despues(2));

    const configurado = clasificacion !== null && r.frecuencias.length > 0 && r.cuentas.length > 0;
    r.colaborador.estadoConfiguracion = configurado ? 'Configurado' : 'Pendiente';
    r.colaborador.actualizadoEn = r.cuentas[0]?.registradaEn ?? creado;
    return r;
  }
}

export const colaboradoresMock = new ColaboradoresMock();
