import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PeriodoEnPantallaService } from '../../../../core/services/periodo-en-pantalla.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { DialogoExportarPendientes } from '../../components/dialogo-exportar-pendientes/dialogo-exportar-pendientes';
import { ExportacionesService } from '../../services/exportaciones.service';
import {
  ExportacionRegistrada, FormatoExportacion, PaginaExportaciones, TipoExportacion, UltimaExportacion, VistaLiquidaciones,
} from '../../models/exportacion.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { DialogoRegenerar } from '../../components/dialogo-regenerar/dialogo-regenerar';
import { esPeriodoValido, nombrePeriodo, periodoActual, periodoDeFecha } from '../../../../shared/utils/periodo';

interface OpcionExportacion {
  /** Identifica la tarjeta (liquidaciones tiene dos: consolidado y por colaborador). */
  clave: string;
  tipo: TipoExportacion; titulo: string; detalle: string; icono: IconName; porMes: boolean;
  vista?: VistaLiquidaciones;
}

const POR_PAGINA = 20;

/** Liquidaciones del mes elegido (GET /api/dashboard?periodo=): null mientras carga o si falló. */
interface EstadoPeriodo { revisadas: number; sinRevisar: number }

/** Una exportación de liquidaciones que espera confirmar el aviso de pendientes. */
interface ExportacionPorConfirmar {
  clave: string; tipo: TipoExportacion; periodo: string | null; formato: FormatoExportacion;
  vista: VistaLiquidaciones | null; reporte: string;
}
const ETIQUETA_FORMATO: Record<FormatoExportacion, string> = { xlsx: 'Excel', pdf: 'PDF' };
/** Qué cuenta cada reporte en "Contenido" (singular y plural). */
const UNIDAD: Record<TipoExportacion, [string, string]> = {
  honorarios: ['honorario', 'honorarios'],
  liquidaciones: ['liquidación', 'liquidaciones'],
  colaboradores: ['colaborador', 'colaboradores'],
};

/**
 * Exportaciones: reportes en Excel y PDF de liquidaciones, honorarios y colaboradores (/api/exportaciones)
 * y el historial "Exportaciones recientes": qué ya salió del mes, quién lo generó y si los datos cambiaron.
 * Query param: ?periodo=2026-11 (llega desde Inicio y Liquidaciones).
 */
@Component({
  selector: 'app-exportaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Icon, EstadoChip, DineroPipe, DialogoRegenerar, DialogoExportarPendientes],
  templateUrl: './exportaciones.html',
  styleUrl: './exportaciones.scss',
})
export class Exportaciones {
  private readonly api = inject(ExportacionesService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly periodo = signal(this.periodoInicial());
  /** El menú lateral muestra el mes elegido aquí (solo interfaz). */
  private readonly periodoEnPantalla = inject(PeriodoEnPantallaService);
  private readonly publicarPeriodo = effect(() => this.periodoEnPantalla.periodo.set(this.periodo()));
  protected readonly nombreMes = computed(() => nombrePeriodo(this.periodo()));

  protected cambiarPeriodo(valor: string): void {
    if (esPeriodoValido(valor)) this.periodo.set(valor);
  }

  // ── Reportes (Excel y PDF) ────────────────────────────────
  protected readonly todosLosMeses = signal(false);
  /** Mes de las exportaciones de esta pantalla: "yyyy-MM" o null con "Todos los meses". */
  private readonly periodoElegido = computed(() => (this.todosLosMeses() ? null : this.periodo()));
  /**
   * Descargas en curso, una por botón ("liquidaciones-consolidado-pdf", "honorarios-xlsx", "fila-<id>"…). Cada botón
   * solo se bloquea mientras genera su propio archivo; los demás siguen disponibles.
   */
  protected readonly descargando = signal<ReadonlySet<string>>(new Set());

  protected generando(o: OpcionExportacion, formato: FormatoExportacion): boolean {
    return this.descargando().has(`${o.clave}-${formato}`);
  }

  protected readonly opciones: OpcionExportacion[] = [
    { clave: 'liquidaciones-consolidado', tipo: 'liquidaciones', vista: 'consolidado', titulo: 'Liquidaciones · Consolidado', detalle: 'Todos los colaboradores en una sola tabla: neto consolidado, quincena, fin de mes, cuotas de anticipos, a pagar y totales.', icono: 'calculator', porMes: true },
    { clave: 'liquidaciones-colaborador', tipo: 'liquidaciones', vista: 'porColaborador', titulo: 'Liquidaciones · Por colaborador', detalle: 'Un solo archivo con el detalle de cada colaborador: sus honorarios (proporcional, IVA, retenciones, neto) y sus cortes (base, cuotas de anticipos, valor preparado).', icono: 'users', porMes: true },
    { clave: 'honorarios', tipo: 'honorarios', titulo: 'Honorarios', detalle: 'Honorarios calculados por proyecto (o por contrato), con impuestos, retenciones y totales.', icono: 'cash', porMes: true },
    { clave: 'colaboradores', tipo: 'colaboradores', titulo: 'Colaboradores', detalle: 'Colaboradores registrados en RPS: identificación, clasificación, frecuencia y estado.', icono: 'users', porMes: false },
  ];

  // ── Estado del mes (liquidaciones calculadas y revisadas) ─────────
  private readonly tablero = inject(DashboardService);
  protected readonly estadoPeriodo = signal<EstadoPeriodo | null>(null);
  protected readonly cargandoEstado = signal(false);
  protected readonly errorEstado = signal(false);

  protected readonly calculadas = computed(() => {
    const e = this.estadoPeriodo();
    return e ? e.revisadas + e.sinRevisar : null;
  });
  /** Liquidaciones del mes elegido que faltan revisar (0 con "Todos los meses" o si no se sabe). */
  protected readonly sinRevisar = computed(() => (this.todosLosMeses() ? 0 : this.estadoPeriodo()?.sinRevisar ?? 0));
  /** El mes elegido no tiene liquidaciones: las exportaciones de liquidaciones no tienen qué exportar. Solo si se sabe. */
  protected readonly mesSinCalcular = computed(() => !this.todosLosMeses() && this.calculadas() === 0);

  /** Solo las tarjetas de liquidaciones dependen del cálculo del mes; las demás nunca se bloquean. */
  protected bloqueada(o: OpcionExportacion): boolean {
    return o.tipo === 'liquidaciones' && this.mesSinCalcular();
  }

  private cargarEstado(periodo: string): void {
    this.cargandoEstado.set(true);
    this.errorEstado.set(false);
    this.tablero.indicadores(periodo).pipe(catchError(() => of(null))).subscribe((i) => {
      this.cargandoEstado.set(false);
      // Si falla, no se bloquea nada ni se avisa de pendientes que no se conocen.
      this.errorEstado.set(i === null);
      this.estadoPeriodo.set(i ? { revisadas: i.liquidaciones.revisadas, sinRevisar: i.liquidaciones.sinRevisar } : null);
    });
  }

  protected reintentarEstado(): void {
    this.cargarEstado(this.periodo());
  }

  // ── Aviso antes de exportar liquidaciones con pendientes de revisión (no bloquea) ──
  protected readonly porConfirmar = signal<ExportacionPorConfirmar | null>(null);

  protected descargar(o: OpcionExportacion, formato: FormatoExportacion): void {
    if (this.bloqueada(o)) return;
    const pedido: ExportacionPorConfirmar = {
      clave: `${o.clave}-${formato}`, tipo: o.tipo, periodo: this.periodoElegido(), formato, vista: o.vista ?? null,
      reporte: `${o.titulo} (${ETIQUETA_FORMATO[formato]})`,
    };
    if (o.tipo === 'liquidaciones' && this.sinRevisar() > 0) { this.porConfirmar.set(pedido); return; }
    this.generar(pedido.clave, pedido.tipo, pedido.periodo, pedido.formato, pedido.vista);
  }

  protected confirmarExportacion(): void {
    const p = this.porConfirmar();
    this.porConfirmar.set(null);
    if (p) this.generar(p.clave, p.tipo, p.periodo, p.formato, p.vista);
  }

  /** POST de la descarga; al terminar bien, el backend ya la registró: se actualizan el historial y las tarjetas. */
  private generar(clave: string, tipo: TipoExportacion, periodo: string | null, formato: FormatoExportacion, vista: VistaLiquidaciones | null): void {
    if (this.descargando().has(clave)) return;
    this.descargando.update((s) => new Set(s).add(clave));
    const terminar = () => this.descargando.update((s) => { const n = new Set(s); n.delete(clave); return n; });
    this.api.descargar(tipo, periodo, formato, vista).subscribe({
      next: (archivo) => {
        terminar();
        descargarBlob(archivo.nombre, archivo.contenido);
        this.recargarRegistro();
      },
      error: (e: unknown) => { terminar(); this.avisos.error(leerErrorApi(e).mensaje); },
    });
  }

  // ── Última exportación de cada tarjeta (GET .../ultimas) ──────────
  /** null mientras carga o si falló: no se sabe, así que la tarjeta no afirma nada. */
  protected readonly ultimas = signal<UltimaExportacion[] | null>(null);

  protected ultimaDe(o: OpcionExportacion): UltimaExportacion | null {
    return this.ultimas()?.find((u) => u.tipo === o.tipo && (u.vista ?? null) === (o.vista ?? null)) ?? null;
  }

  private cargarUltimas(periodo: string | null): void {
    this.ultimas.set(null);
    this.api.ultimas(periodo).subscribe({
      next: (l) => this.ultimas.set(l),
      // Es una ayuda: si falla, las tarjetas siguen funcionando sin esa línea (no se dice "todavía no se exporta").
      error: () => this.ultimas.set(null),
    });
  }

  // ── Exportaciones recientes (GET .../historial) ───────────────────
  protected readonly todosLosPeriodos = signal(false);
  protected readonly filtroTipo = signal<TipoExportacion | null>(null);
  protected readonly pagina = signal(1);
  protected readonly historial = signal<PaginaExportaciones | null>(null);
  protected readonly cargandoHistorial = signal(false);
  protected readonly errorHistorial = signal<string | null>(null);
  /** Exportación cuyos datos cambiaron y que se quiere volver a generar (abre la confirmación). */
  protected readonly porRegenerar = signal<ExportacionRegistrada | null>(null);

  /** Título del historial: el mes elegido, "todos los meses" o todo. */
  protected readonly alcanceHistorial = computed(() => {
    if (this.todosLosPeriodos()) return 'Todos los períodos';
    const p = this.periodoElegido();
    return p ? nombrePeriodo(p) : 'Todos los meses';
  });

  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil((this.historial()?.total ?? 0) / POR_PAGINA)));
  protected readonly rango = computed(() => {
    const h = this.historial();
    if (!h || h.total === 0) return null;
    const desde = (h.pagina - 1) * h.tamano + 1;
    return { desde, hasta: Math.min(desde + h.items.length - 1, h.total), total: h.total };
  });

  constructor() {
    // Estado del mes: al cambiar de mes (con "Todos los meses" la línea explica que se ve por mes).
    effect(() => {
      const periodo = this.periodo();
      untracked(() => this.cargarEstado(periodo));
    });
    // Mes o filtros nuevos: se vuelve a la primera página y se recargan historial y tarjetas.
    effect(() => {
      const periodo = this.periodoElegido();
      const todos = this.todosLosPeriodos();
      const tipo = this.filtroTipo();
      untracked(() => {
        this.pagina.set(1);
        this.cargarHistorial(periodo, todos, tipo, 1);
        this.cargarUltimas(periodo);
      });
    });
  }

  protected cambiarTipo(valor: string): void {
    this.filtroTipo.set(valor === 'honorarios' || valor === 'liquidaciones' || valor === 'colaboradores' ? valor : null);
  }

  protected irAPagina(n: number): void {
    if (n < 1 || n > this.totalPaginas() || n === this.pagina()) return;
    this.pagina.set(n);
    this.cargarHistorial(this.periodoElegido(), this.todosLosPeriodos(), this.filtroTipo(), n);
  }

  protected reintentarHistorial(): void {
    this.cargarHistorial(this.periodoElegido(), this.todosLosPeriodos(), this.filtroTipo(), this.pagina());
  }

  private recargarRegistro(): void {
    this.cargarHistorial(this.periodoElegido(), this.todosLosPeriodos(), this.filtroTipo(), this.pagina());
    this.cargarUltimas(this.periodoElegido());
    // Otra persona pudo revisar o calcular mientras tanto: el estado del mes se refresca con cada exportación.
    this.cargarEstado(this.periodo());
  }

  private cargarHistorial(periodo: string | null, todos: boolean, tipo: TipoExportacion | null, pagina: number): void {
    this.cargandoHistorial.set(true);
    this.errorHistorial.set(null);
    this.api.historial({ periodo, todos, tipo, pagina, tamano: POR_PAGINA }).subscribe({
      next: (h) => { this.historial.set(h); this.cargandoHistorial.set(false); },
      error: (e: unknown) => { this.cargandoHistorial.set(false); this.errorHistorial.set(leerErrorApi(e).mensaje); },
    });
  }

  /**
   * "Volver a generar": mismo reporte, formato y mes. Si los datos cambiaron se confirma (y esa ventana también avisa
   * de pendientes de revisión); si no, pero es de liquidaciones del mes elegido con pendientes, se avisa igual.
   */
  protected regenerar(x: ExportacionRegistrada): void {
    if (x.datosCambiaron === true) { this.porRegenerar.set(x); return; }
    if (this.pendientesDe(x) > 0) {
      this.porConfirmar.set({
        clave: `fila-${x.id}`, tipo: x.tipo, periodo: x.periodo ? periodoDeFecha(x.periodo) : null, formato: x.formato,
        vista: x.vista, reporte: `${this.nombreReporte(x)} (${ETIQUETA_FORMATO[x.formato]})`,
      });
      return;
    }
    this.generarDe(x);
  }

  /** Pendientes de revisión que aplican a una fila: solo liquidaciones del mes que muestra la línea de estado. */
  protected pendientesDe(x: ExportacionRegistrada): number {
    if (x.tipo !== 'liquidaciones' || !x.periodo || periodoDeFecha(x.periodo) !== this.periodo()) return 0;
    return this.estadoPeriodo()?.sinRevisar ?? 0;
  }

  protected confirmarRegenerar(): void {
    const x = this.porRegenerar();
    this.porRegenerar.set(null);
    if (x) this.generarDe(x);
  }

  private generarDe(x: ExportacionRegistrada): void {
    this.generar(`fila-${x.id}`, x.tipo, x.periodo ? periodoDeFecha(x.periodo) : null, x.formato, x.vista);
  }

  protected regenerandoFila(x: ExportacionRegistrada): boolean {
    return this.descargando().has(`fila-${x.id}`);
  }

  // ── Textos de cada fila ───────────────────────────────────────────
  protected nombreReporte(x: { tipo: TipoExportacion; vista: VistaLiquidaciones | null }): string {
    if (x.tipo === 'liquidaciones') return `Liquidaciones · ${x.vista === 'porColaborador' ? 'Por colaborador' : 'Consolidado'}`;
    return x.tipo === 'honorarios' ? 'Honorarios' : 'Colaboradores';
  }

  protected formato(f: FormatoExportacion): string {
    return ETIQUETA_FORMATO[f];
  }

  protected periodoDe(x: ExportacionRegistrada): string {
    if (x.tipo === 'colaboradores') return 'Sin mes';
    return x.periodo ? nombrePeriodo(periodoDeFecha(x.periodo)) : 'Todos los meses';
  }

  protected cantidad(x: ExportacionRegistrada): string {
    const [uno, varios] = UNIDAD[x.tipo];
    return `${x.registros} ${x.registros === 1 ? uno : varios}`;
  }

  protected estadoDatos(x: ExportacionRegistrada): { texto: string; tono: TonoChip; ayuda: string } {
    if (x.datosCambiaron === true) return { texto: 'Cambiaron', tono: 'warn', ayuda: 'Los datos de este reporte cambiaron desde esta exportación.' };
    if (x.datosCambiaron === false) return { texto: 'Sin cambios', tono: 'ok', ayuda: 'Los datos de este reporte son los mismos que se exportaron.' };
    return { texto: 'No se pudo comprobar', tono: 'neutral', ayuda: 'No se pudo comparar con los datos actuales.' };
  }

  protected alcanceDe(x: ExportacionRegistrada): string {
    return this.periodoDe(x).toLowerCase();
  }

  private periodoInicial(): string {
    const p = this.ruta.snapshot.queryParamMap.get('periodo');
    return p && esPeriodoValido(p) ? p : periodoActual();
  }
}

function descargarBlob(nombre: string, contenido: Blob): void {
  const url = URL.createObjectURL(contenido);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
