import {
  CambioParametro, ClaveParametro, Configuracion, PARAMETROS, ParametroVigente,
} from '../../features/configuracion/models/configuracion.models';
import { RespuestaMock } from './colaboradores.mock';
import { periodoActual, periodoSiguiente } from '../../shared/utils/periodo';

/**
 * Parámetros de Configuración en memoria. Cada cambio crea una vigencia desde un mes;
 * el valor anterior no se borra, así los cálculos viejos se pueden explicar (RN 29).
 *
 * Reglas de vigencia:
 *   - Alertas de vencimiento: rigen de inmediato (no cambian importes).
 *   - Límite de anticipos y reglas tributarias: rigen desde el mes siguiente.
 */

interface Vigencia {
  clave: ClaveParametro;
  valores: number[];
  /** "yyyy-MM" */
  vigenteDesde: string;
  registradoEn: string;
  usuario: string;
}

const CLAVES = Object.keys(PARAMETROS) as ClaveParametro[];
const INMEDIATOS: ClaveParametro[] = ['AlertasDias'];

const validacion = (codigo: string, campo: string, mensaje: string): RespuestaMock =>
  ({ status: 400, body: { title: 'One or more validation errors occurred.', status: 400, errors: { [campo]: [mensaje] }, codigo } });

class ConfiguracionMock {
  private readonly vigencias: Vigencia[] = [];
  private readonly cambios: CambioParametro[] = [];
  private bancos = [
    'Banco Pichincha', 'Banco Guayaquil', 'Produbanco', 'Banco del Pacífico', 'Banco Bolivariano',
    'Banco Internacional', 'Banco de Loja', 'Cooperativa JEP',
  ];

  constructor() {
    // Mismos valores e historial que el mockup de Configuración y la sección 7 de los requisitos.
    this.sembrar('AlertasDias', [30, 15, 5], '2025-01', null);
    this.sembrar('AlertasDias', [30, 15, 7], '2025-03', [30, 15, 5]);
    this.sembrar('LimiteAnticiposPct', [80], '2025-01', null);
    this.sembrar('LimiteAnticiposPct', [100], '2025-02', [80]);
    this.sembrar('IvaPct', [15], '2025-01', null);
    this.sembrar('RetencionFuentePct', [10], '2025-01', null);
    this.sembrar('RetencionIvaProfesionalPct', [100], '2025-01', null);
    this.sembrar('RetencionIvaJuniorPct', [70], '2025-01', null);
  }

  // ── Para otros mocks ───────────────────────────────────────────────
  /** Valor que rige en un mes "yyyy-MM". */
  valorEn(clave: ClaveParametro, periodo: string): number[] {
    return this.vigenteEn(clave, periodo)?.valores ?? [];
  }

  /** Porcentaje que rige en un mes, como número (15 → 15). */
  pctEn(clave: ClaveParametro, periodo: string): number {
    return this.valorEn(clave, periodo)[0] ?? 0;
  }

  /** Plazos de alerta que rigen hoy, de mayor a menor. */
  alertasDias(): number[] {
    return this.valorEn('AlertasDias', periodoActual());
  }

  listaBancos(): string[] {
    return [...this.bancos];
  }

  // ── Endpoints ──────────────────────────────────────────────────────
  obtener(): RespuestaMock {
    const body: Configuracion = {
      capacidades: { vigencias: true, alertas: true, bancos: true },
      parametros: CLAVES.map((c) => this.parametro(c)),
      bancos: this.listaBancos(),
      historial: [...this.cambios].sort((a, b) => b.registradoEn.localeCompare(a.registradoEn)),
    };
    return { status: 200, body };
  }

  cambiar(clave: string, body: Record<string, unknown>): RespuestaMock {
    if (!CLAVES.includes(clave as ClaveParametro))
      return { status: 404, body: { title: 'No encontrado', status: 404, detail: `No existe el parámetro '${clave}'.`, codigo: 'Configuracion.ParametroNoEncontrado' } };
    const c = clave as ClaveParametro;
    const valores = body['valores'];
    if (!Array.isArray(valores) || valores.length === 0 || !valores.every((v) => typeof v === 'number' && Number.isFinite(v)))
      return validacion('Configuracion.ValoresRequeridos', 'valores', 'Escribe al menos un valor.');

    let limpios = valores as number[];
    if (c === 'AlertasDias') {
      if (limpios.length > 5) return validacion('Configuracion.DemasiadasAlertas', 'valores', 'Máximo 5 plazos de alerta.');
      if (!limpios.every((d) => Number.isInteger(d) && d >= 1 && d <= 365))
        return validacion('Configuracion.DiasInvalidos', 'valores', 'Cada plazo debe ser un número entero entre 1 y 365 días.');
      limpios = [...new Set(limpios)].sort((a, b) => b - a);
    } else {
      const v = limpios[0];
      const max = 100;
      const min = c === 'LimiteAnticiposPct' ? 1 : 0;
      if (limpios.length !== 1 || v < min || v > max || Math.round(v * 100) !== v * 100)
        return validacion('Configuracion.PorcentajeInvalido', 'valores', `Debe ser un porcentaje entre ${min} y ${max}, con máximo dos decimales.`);
      limpios = [v];
    }

    const desde = INMEDIATOS.includes(c) ? periodoActual() : periodoSiguiente();
    const anterior = this.vigenteEn(c, desde)?.valores ?? null;
    if (anterior && anterior.join() === limpios.join())
      return { status: 409, body: { title: 'Conflicto', status: 409, detail: 'El valor nuevo es igual al que ya rige.', codigo: 'Configuracion.SinCambios' } };

    // Si ya había un cambio para ese mismo mes, se reemplaza (todavía no ha regido).
    const mismoMes = this.vigencias.findIndex((x) => x.clave === c && x.vigenteDesde === desde);
    if (mismoMes >= 0) this.vigencias.splice(mismoMes, 1);
    this.sembrar(c, limpios, desde, this.vigenteEn(c, desde)?.valores ?? null, new Date().toISOString());
    return { status: 200, body: this.parametro(c) };
  }

  cancelarProgramado(clave: string): RespuestaMock {
    const i = this.vigencias.findIndex((x) => x.clave === clave && x.vigenteDesde > periodoActual());
    if (i < 0)
      return { status: 404, body: { title: 'No encontrado', status: 404, detail: 'No hay un cambio programado para este parámetro.', codigo: 'Configuracion.SinProgramado' } };
    const [v] = this.vigencias.splice(i, 1);
    this.cambios.push({
      clave: v.clave, anterior: v.valores, nuevo: this.vigenteEn(v.clave, v.vigenteDesde)?.valores ?? [],
      vigenteDesde: v.vigenteDesde, registradoEn: new Date().toISOString(), usuario: 'Contabilidad',
    });
    return { status: 204, body: null };
  }

  guardarBancos(body: Record<string, unknown>): RespuestaMock {
    const lista = body['bancos'];
    if (!Array.isArray(lista) || !lista.every((b) => typeof b === 'string'))
      return validacion('Configuracion.BancosInvalidos', 'bancos', 'Envía la lista de bancos.');
    const limpios = [...new Set((lista as string[]).map((b) => b.trim()).filter(Boolean))];
    if (limpios.length === 0) return validacion('Configuracion.BancosVacios', 'bancos', 'Debe quedar al menos un banco.');
    if (limpios.some((b) => b.length > 100)) return validacion('Configuracion.BancoLargo', 'bancos', 'Cada nombre debe tener máximo 100 caracteres.');
    this.bancos = limpios;
    return { status: 200, body: this.listaBancos() };
  }

  // ── Internos ───────────────────────────────────────────────────────
  private vigenteEn(clave: ClaveParametro, periodo: string): Vigencia | null {
    return this.vigencias
      .filter((v) => v.clave === clave && v.vigenteDesde <= periodo)
      .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0] ?? null;
  }

  private parametro(clave: ClaveParametro): ParametroVigente {
    const actual = this.vigenteEn(clave, periodoActual());
    const programado = this.vigencias
      .filter((v) => v.clave === clave && v.vigenteDesde > periodoActual())
      .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))[0] ?? null;
    return {
      clave,
      valores: actual?.valores ?? [],
      vigenteDesde: actual?.vigenteDesde ?? periodoActual(),
      programado: programado ? { valores: programado.valores, vigenteDesde: programado.vigenteDesde } : null,
      aplicaDesde: INMEDIATOS.includes(clave) ? 'Inmediato' : 'SiguienteMes',
    };
  }

  private sembrar(clave: ClaveParametro, valores: number[], vigenteDesde: string, anterior: number[] | null, registradoEn?: string): void {
    const fecha = registradoEn ?? new Date(`${vigenteDesde}-01T09:00:00`).toISOString();
    this.vigencias.push({ clave, valores, vigenteDesde, registradoEn: fecha, usuario: 'Contabilidad' });
    this.cambios.push({ clave, anterior, nuevo: valores, vigenteDesde, registradoEn: fecha, usuario: 'Contabilidad' });
  }
}

export const configuracionMock = new ConfiguracionMock();
