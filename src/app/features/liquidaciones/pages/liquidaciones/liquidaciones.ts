import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
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

  constructor() {
    effect(() => {
      const periodo = this.periodo();
      untracked(() => this.cargar(periodo));
    });
    effect(() => {
      const id = this.seleccionadoId();
      untracked(() => this.cargarDetalle(id));
    });
  }

  // ── Acciones ─────────────────────────────────────────────────────────
  protected cambiarPeriodo(valor: string): void {
    if (!esPeriodoValido(valor) || valor === this.periodo()) return;
    this.seleccionadoId.set(null);
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
    if (!id) { this.detalle.set(null); return; }
    this.cargandoDetalle.set(true);
    this.errorDetalle.set(null);
    this.api.obtener(id).subscribe({
      next: (d) => { this.detalle.set(d); this.cargandoDetalle.set(false); },
      error: (e: unknown) => { this.cargandoDetalle.set(false); this.errorDetalle.set(leerErrorApi(e).mensaje); },
    });
  }

  private periodoInicial(): string {
    const p = this.ruta.snapshot.queryParamMap.get('periodo');
    return p && esPeriodoValido(p) ? p : periodoActual();
  }
}
