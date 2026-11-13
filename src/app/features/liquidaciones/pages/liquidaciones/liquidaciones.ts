import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { PeriodoEnPantallaService } from '../../../../core/services/periodo-en-pantalla.service';
import { DatePipe } from '@angular/common';
import { catchError, forkJoin, of } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { LiquidacionesService } from '../../services/liquidaciones.service';
import {
  LiquidacionDetalle, LiquidacionResumen, LiquidacionesPeriodo, corteDe,
} from '../../models/liquidacion.models';
import { ETIQUETA_MODALIDAD } from '../../../honorarios/models/honorario.models';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { IndicadoresDashboard } from '../../../dashboard/models/dashboard.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { PestanaUi, UiTabPanel, UiTabs } from '../../../../shared/components/ui-tabs/ui-tabs';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { ETIQUETA_CORTE, rangoCorte } from '../../../../shared/models/corte';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';
import { DialogoCalcular, ResumenAntesDeCalcular } from '../../components/dialogo-calcular/dialogo-calcular';
import { DialogoRevisar } from '../../components/dialogo-revisar/dialogo-revisar';

type Vista = 'resumen' | 'cortes';
type FiltroRevision = 'todas' | 'porRevisar';

/** "Acuña" → "acuna": la búsqueda no distingue tildes ni mayúsculas (igual que app-buscador). */
const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Suma de importes en centavos, para que el total no arrastre decimales de coma flotante. */
const sumar = (valores: number[]): number => valores.reduce((t, v) => t + Math.round(v * 100), 0) / 100;

/**
 * Liquidaciones del mes, como las calcula rps-backend.
 * Lista a la izquierda y, al elegir a alguien, su detalle a la derecha:
 * proyecto por proyecto (días, impuestos, neto), cortes y "Revisado para envío".
 * Indicadores: GET /api/dashboard (los mismos números que Inicio).
 * Query params: ?periodo=2026-11 y ?liquidacion=<id> (llegan desde Inicio o el historial del colaborador).
 */
@Component({
  selector: 'app-liquidaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Icon, EstadoChip, DineroPipe, UiTabs, UiTabPanel, DialogoCalcular, DialogoRevisar],
  templateUrl: './liquidaciones.html',
  styleUrl: './liquidaciones.scss',
})
export class Liquidaciones {
  private readonly api = inject(LiquidacionesService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tablero = inject(DashboardService);

  protected readonly etiquetaCorte = ETIQUETA_CORTE;
  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;
  protected readonly corteDe = corteDe;
  protected readonly rangoCorte = rangoCorte;

  // ── Estado de la pantalla ────────────────────────────────────────────
  protected readonly periodo = signal(this.periodoInicial());
  /** El menú lateral muestra el mes elegido aquí (solo interfaz). */
  private readonly periodoEnPantalla = inject(PeriodoEnPantallaService);
  private readonly publicarPeriodo = effect(() => this.periodoEnPantalla.periodo.set(this.periodo()));
  protected readonly vista = signal<Vista>('resumen');
  protected readonly vistas: PestanaUi<Vista>[] = [
    { id: 'resumen', titulo: 'Resumen mensual' },
    { id: 'cortes', titulo: 'Por corte' },
  ];
  protected readonly datos = signal<LiquidacionesPeriodo | null>(null);
  protected readonly indicadores = signal<IndicadoresDashboard | null>(null);
  protected readonly cargando = signal(true);
  protected readonly calculando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly seleccionadoId = signal<string | null>(this.ruta.snapshot.queryParamMap.get('liquidacion'));
  protected readonly detalle = signal<LiquidacionDetalle | null>(null);
  protected readonly cargandoDetalle = signal(false);
  protected readonly errorDetalle = signal<string | null>(null);
  protected readonly guardandoRevision = signal(false);

  protected readonly nombreMes = computed(() => nombrePeriodo(this.periodo()));
  protected readonly filas = computed(() => this.datos()?.filas ?? []);

  // ── Herramientas de revisión: búsqueda, filtro y selección (solo en pantalla) ──
  protected readonly busqueda = signal('');
  protected readonly filtroRevision = signal<FiltroRevision>('todas');
  /** IDs elegidos con las casillas. Solo cuentan los que siguen por revisar y se ven en la tabla. */
  private readonly seleccion = signal<ReadonlySet<string>>(new Set());

  /** Filas que coinciden con la búsqueda (nombre o identificación), en el orden de la tabla. */
  private readonly filasBuscadas = computed(() => {
    const palabras = normalizar(this.busqueda()).split(/\s+/).filter(Boolean);
    if (!palabras.length) return this.filas();
    return this.filas().filter((l) => {
      const texto = normalizar(`${l.colaborador} ${l.identificacion} ${l.tmrColaboradorId}`);
      return palabras.every((p) => texto.includes(p));
    });
  });
  protected readonly filasVisibles = computed(() =>
    this.filtroRevision() === 'porRevisar' ? this.filasBuscadas().filter((l) => !l.revisado) : this.filasBuscadas());
  protected readonly hayFiltros = computed(() => this.busqueda().trim() !== '' || this.filtroRevision() !== 'todas');
  protected readonly totalPorRevisar = computed(() => this.filas().filter((l) => !l.revisado).length);

  private readonly pendientesVisibles = computed(() => this.filasVisibles().filter((l) => !l.revisado));
  protected readonly seleccionadas = computed(() => this.pendientesVisibles().filter((l) => this.seleccion().has(l.id)));
  protected readonly netoSeleccionado = computed(() => sumar(this.seleccionadas().map((l) => l.netoConsolidado)));
  protected readonly todasSeleccionadas = computed(() =>
    this.pendientesVisibles().length > 0 && this.seleccionadas().length === this.pendientesVisibles().length);
  protected readonly algunasSeleccionadas = computed(() => this.seleccionadas().length > 0 && !this.todasSeleccionadas());
  protected readonly haySeleccionables = computed(() => this.pendientesVisibles().length > 0);

  /** Totales de lo que muestra la tabla (respetan búsqueda y filtro). Solo suma lo que ya calculó el backend. */
  protected readonly totales = computed(() => {
    const filas = this.filasVisibles();
    const de = (corte: 'Quincena' | 'FinDeMes', campo: 'descuento' | 'valor') =>
      sumar(filas.map((l) => corteDe(l, corte)?.[campo] ?? 0));
    return {
      neto: sumar(filas.map((l) => l.netoConsolidado)),
      descQuincena: de('Quincena', 'descuento'), valorQuincena: de('Quincena', 'valor'),
      descFinDeMes: de('FinDeMes', 'descuento'), valorFinDeMes: de('FinDeMes', 'valor'),
    };
  });

  /**
   * Siguiente liquidación por revisar después de la abierta (según el orden y la búsqueda de la tabla);
   * si no hay más abajo, vuelve a la primera pendiente. null si no queda ninguna.
   */
  protected readonly siguientePendiente = computed<LiquidacionResumen | null>(() => {
    const lista = this.filasBuscadas();
    const actual = this.seleccionadoId();
    const desde = lista.findIndex((l) => l.id === actual);
    const orden = desde < 0 ? lista : [...lista.slice(desde + 1), ...lista.slice(0, desde)];
    return orden.find((l) => !l.revisado && l.id !== actual) ?? null;
  });

  /** Lector de pantalla: cuántas hay elegidas (vacío cuando ninguna; la región existe siempre). */
  protected readonly anuncioSeleccion = computed(() => {
    const n = this.seleccionadas().length;
    return n === 0 ? '' : `${n} ${n === 1 ? 'liquidación seleccionada' : 'liquidaciones seleccionadas'} para revisar.`;
  });
  /**
   * Lector de pantalla: aviso corto al abrir un detalle desde la tabla. Con "Siguiente por revisar" no se usa,
   * porque el foco ya va al nombre y se leería dos veces.
   */
  protected readonly anuncioDetalle = signal('');

  /** Al saltar a la siguiente, el foco va al título del detalle (el botón pulsado desaparece). */
  private readonly tituloDetalle = viewChild<ElementRef<HTMLElement>>('tituloDetalle');
  private enfocarDetalle = false;

  // ── Confirmaciones (Calcular y Revisar) ──────────────────────────────
  protected readonly confirmandoCalculo = signal(false);
  /** Liquidaciones por marcar como revisadas: hoy una (la del detalle); la revisión múltiple pasará varias. */
  protected readonly porRevisar = signal<LiquidacionResumen[]>([]);

  /** Lo que la pantalla ya tiene cargado: indicadores de Inicio y la lista del mes. Sin llamadas nuevas. */
  protected readonly resumenCalculo = computed<ResumenAntesDeCalcular>(() => {
    const i = this.indicadores();
    const filas = this.filas();
    return {
      configurados: i?.colaboradores.configurados ?? null,
      sinConfigurar: i?.colaboradores.pendientes ?? null,
      yaCalculadas: filas.length,
      revisadas: filas.filter((l) => l.revisado).length,
    };
  });

  /** Estado vacío: si faltan colaboradores por configurar (o no hay ninguno), la acción principal lleva a Colaboradores. */
  protected readonly faltaConfigurar = computed(() => {
    const i = this.indicadores();
    return !!i && (i.colaboradores.pendientes > 0 || i.colaboradores.configurados === 0);
  });

  constructor() {
    effect(() => {
      const periodo = this.periodo();
      untracked(() => this.cargar(periodo));
    });
    effect(() => {
      const id = this.seleccionadoId();
      untracked(() => this.cargarDetalle(id));
    });
    effect(() => {
      const titulo = this.tituloDetalle();
      const det = this.detalle();
      if (titulo && det && det.id === this.seleccionadoId() && this.enfocarDetalle) {
        this.enfocarDetalle = false;
        queueMicrotask(() => titulo.nativeElement.focus());
      }
    });
  }

  // ── Acciones ─────────────────────────────────────────────────────────
  protected cambiarPeriodo(valor: string): void {
    if (!esPeriodoValido(valor) || valor === this.periodo()) return;
    this.seleccionadoId.set(null);
    this.seleccion.set(new Set());
    this.periodo.set(valor);
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: { periodo: valor } });
  }

  /** Botones "Calcular": primero el resumen previo; el cálculo solo sale al confirmar. */
  protected pedirCalculo(): void {
    this.confirmandoCalculo.set(true);
  }

  /** Pide al backend generar honorarios y liquidaciones del mes y muestra lo que respondió. */
  protected calcular(): void {
    this.calculando.set(true);
    this.error.set(null);
    this.api.calcular(this.periodo()).subscribe({
      next: (r) => {
        this.calculando.set(false);
        this.confirmandoCalculo.set(false);
        this.avisos.ok(`${this.nombreMes()}: ${r.liquidacionesGeneradas} liquidación(es) nueva(s), `
          + `${r.honorariosGenerados} honorario(s) generado(s), ${r.honorariosOmitidos} ya existían.`);
        this.cargar(this.periodo());
        this.cargarDetalle(this.seleccionadoId());
      },
      // La ventana queda abierta con el error en un aviso: se puede reintentar o cancelar.
      error: (e: unknown) => { this.calculando.set(false); this.avisos.error(leerErrorApi(e).mensaje); },
    });
  }

  protected reintentar(): void {
    this.cargar(this.periodo());
  }

  protected elegir(l: LiquidacionResumen): void {
    this.seleccionadoId.set(this.seleccionadoId() === l.id ? null : l.id);
  }

  /** Enter o Espacio sobre la fila (no sobre su casilla) abre o cierra el detalle. */
  protected teclaFila(evento: Event, l: LiquidacionResumen): void {
    if (evento.target !== evento.currentTarget) return;
    evento.preventDefault();
    this.elegir(l);
  }

  protected irASiguiente(): void {
    const sig = this.siguientePendiente();
    if (!sig) return;
    this.enfocarDetalle = true;
    this.seleccionadoId.set(sig.id);
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtroRevision.set('todas');
  }

  // ── Selección para revisar varias ────────────────────────────────────
  protected estaSeleccionada(l: LiquidacionResumen): boolean {
    return this.seleccion().has(l.id);
  }

  protected alternarSeleccion(l: LiquidacionResumen): void {
    if (l.revisado) return;
    this.seleccion.update((s) => {
      const nueva = new Set(s);
      if (nueva.has(l.id)) nueva.delete(l.id); else nueva.add(l.id);
      return nueva;
    });
  }

  /** Casilla del encabezado: elige o quita todas las pendientes que se ven. */
  protected alternarTodas(): void {
    const ids = this.pendientesVisibles().map((l) => l.id);
    const quitar = this.todasSeleccionadas();
    this.seleccion.update((s) => {
      const nueva = new Set(s);
      for (const id of ids) { if (quitar) nueva.delete(id); else nueva.add(id); }
      return nueva;
    });
  }

  protected limpiarSeleccion(): void {
    this.seleccion.set(new Set());
  }

  /** Botón "Marcar revisada para envío": abre la confirmación (la marca es definitiva). */
  protected pedirRevision(lista: LiquidacionResumen[]): void {
    const pendientes = lista.filter((l) => !l.revisado);
    if (pendientes.length) this.porRevisar.set(pendientes);
  }

  protected cancelarRevision(): void {
    if (!this.guardandoRevision()) this.porRevisar.set([]);
  }

  /**
   * POST /api/liquidaciones/{id}/revisar por cada liquidación confirmada (hoy una). El backend no tiene cómo quitar
   * la marca. Si falla, la ventana queda abierta con el error en un aviso.
   */
  protected confirmarRevision(): void {
    const lista = this.porRevisar();
    if (!lista.length || this.guardandoRevision()) return;
    this.guardandoRevision.set(true);
    forkJoin(lista.map((l) => this.api.marcarRevisado(l.id))).subscribe({
      next: () => {
        this.guardandoRevision.set(false);
        this.porRevisar.set([]);
        this.seleccion.update((s) => new Set([...s].filter((id) => !lista.some((l) => l.id === id))));
        this.avisos.ok(lista.length === 1
          ? `Liquidación de ${lista[0].colaborador} marcada como revisada para envío.`
          : `${lista.length} liquidaciones marcadas como revisadas para envío.`);
        this.cargar(this.periodo());
        this.cargarDetalle(this.seleccionadoId());
      },
      error: (e: unknown) => {
        this.guardandoRevision.set(false);
        this.avisos.error(leerErrorApi(e).mensaje);
        // Con varias, alguna pudo quedar marcada: se recarga para no mostrar un estado viejo.
        if (lista.length > 1) this.cargar(this.periodo());
      },
    });
  }

  // ── Presentación ─────────────────────────────────────────────────────
  protected iniciales(nombre: string): string {
    return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }


  // ── Carga ────────────────────────────────────────────────────────────
  private cargar(periodo: string): void {
    this.cargando.set(true);
    this.error.set(null);
    this.tablero.indicadores(periodo).pipe(catchError(() => of(null))).subscribe((i) => this.indicadores.set(i));
    this.api.listar(periodo).subscribe({
      next: (d) => { this.datos.set(d); this.cargando.set(false); },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }

  private cargarDetalle(id: string | null): void {
    if (!id) { this.detalle.set(null); this.anuncioDetalle.set(''); return; }
    this.cargandoDetalle.set(true);
    this.errorDetalle.set(null);
    this.api.obtener(id).subscribe({
      next: (d) => {
        // Solo al abrir otro colaborador: recargar el mismo (tras revisarlo) ya lo avisa el mensaje de éxito.
        if (this.detalle()?.id !== d.id) this.anuncioDetalle.set(this.enfocarDetalle ? ''
          : `Detalle de ${d.colaborador} abierto, ${d.revisado ? 'revisada para envío' : 'por revisar'}. Está después de la tabla.`);
        this.detalle.set(d);
        this.cargandoDetalle.set(false);
      },
      error: (e: unknown) => { this.cargandoDetalle.set(false); this.errorDetalle.set(leerErrorApi(e).mensaje); },
    });
  }

  private periodoInicial(): string {
    const p = this.ruta.snapshot.queryParamMap.get('periodo');
    return p && esPeriodoValido(p) ? p : periodoActual();
  }
}
