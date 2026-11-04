import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { DashboardService } from '../../services/dashboard.service';
import { LiquidacionesService } from '../../../liquidaciones/services/liquidaciones.service';
import { LiquidacionResumen } from '../../../liquidaciones/models/liquidacion.models';
import {
  AlertaDashboard, DashboardResumen, Severidad, TipoAlerta, VencimientoContrato,
} from '../../models/dashboard.models';
import { mensajeError } from '../../../../core/http/mensaje-error';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';

/** Estado de cada sección: se cargan por separado para que un error no oculte lo demás. */
type Estado<T> =
  | { estado: 'cargando' }
  | { estado: 'ok'; datos: T }
  | { estado: 'error'; mensaje: string };

/** Botones de Alertas: título y frase corta de cada tipo (detalle en docs/GUIA-FRONTEND.md, "Pantalla de Inicio"). */
const TIPOS_ALERTA: Record<TipoAlerta, { etiqueta: string; descripcion: string; icono: IconName }> = {
  CambioTmr: { etiqueta: 'Cambios de TMR', descripcion: 'Cambios que afectan la liquidación', icono: 'sync' },
  Asignacion: { etiqueta: 'Contrato vencido con proyecto activo', descripcion: 'Continúan en el proyecto sin renovación', icono: 'users' },
  Documentacion: { etiqueta: 'Documento pendiente', descripcion: 'Sin documento tributario del mes', icono: 'file' },
  DatosIncompletos: { etiqueta: 'Datos incompletos', descripcion: 'Falta cuenta bancaria u honorario', icono: 'sliders' },
  Anticipo: { etiqueta: 'Anticipos', descripcion: 'Cuotas que se descuentan este mes', icono: 'card' },
};

/** Un botón de Alertas: todas las alertas de un tipo, con el color de la más grave. */
interface GrupoAlertas {
  tipo: TipoAlerta;
  etiqueta: string;
  descripcion: string;
  icono: IconName;
  tono: 'danger' | 'warn' | 'info';
  total: number;
  alertas: AlertaDashboard[];
}

const ORDEN_SEVERIDAD: Record<Severidad, number> = { Critica: 0, Advertencia: 1, Info: 2 };

@Component({
  selector: 'app-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink, Icon, EstadoChip],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss',
})
export class Inicio {
  private readonly api = inject(DashboardService);
  private readonly liquidaciones = inject(LiquidacionesService);
  private readonly recargar$ = new BehaviorSubject<void>(undefined);

  protected readonly periodo = signal(periodoActual());
  protected readonly nombrePeriodo = computed(() => nombrePeriodo(this.periodo()));
  protected readonly tiposAlerta = TIPOS_ALERTA;

  // ── Llamadas al backend ─────────────────────────────────────────────
  protected readonly resumen = this.cargar((p) => this.api.resumen(p));
  protected readonly vencimientos = this.cargar((p) => this.api.vencimientos(p));
  protected readonly alertas = this.cargar((p) => this.api.alertas(p));
  /** Preparación del período: las mismas liquidaciones de la pantalla Liquidaciones (mock o backend real). */
  protected readonly preparacion = this.cargar((p) => this.liquidaciones.listar(p));

  // ── Datos derivados ─────────────────────────────────────────────────
  protected readonly datos = computed<DashboardResumen | null>(() => {
    const r = this.resumen();
    return r.estado === 'ok' ? r.datos : null;
  });

  protected readonly cargando = computed(() =>
    [this.resumen(), this.vencimientos(), this.alertas(), this.preparacion()].some((s) => s.estado === 'cargando'),
  );

  protected readonly avanceRevision = computed(() => {
    const d = this.datos();
    if (!d || d.liquidaciones.total === 0) return 0;
    return Math.round((d.liquidaciones.revisadas / d.liquidaciones.total) * 100);
  });

  protected readonly listaVencimientos = computed<VencimientoContrato[]>(() => {
    const v = this.vencimientos();
    return v.estado === 'ok' ? [...v.datos].sort((a, b) => a.diasRestantes - b.diasRestantes) : [];
  });

  protected readonly porVencer = computed(() => this.listaVencimientos().filter((v) => v.diasRestantes >= 0).length);
  protected readonly vencidos = computed(() => this.listaVencimientos().filter((v) => v.diasRestantes < 0).length);

  /** Tipo de alerta abierto en el panel (uno a la vez), o null si todos están cerrados. */
  protected readonly abierto = signal<TipoAlerta | null>(null);

  private readonly listaAlertas = computed<AlertaDashboard[]>(() => {
    const a = this.alertas();
    return a.estado === 'ok'
      ? [...a.datos].sort((x, y) => ORDEN_SEVERIDAD[x.severidad] - ORDEN_SEVERIDAD[y.severidad])
      : [];
  });

  protected readonly gruposAlertas = computed<GrupoAlertas[]>(() => {
    const grupos = new Map<TipoAlerta, AlertaDashboard[]>();
    // listaAlertas ya viene ordenada por severidad: la primera de cada grupo es la más grave.
    for (const a of this.listaAlertas()) grupos.set(a.tipo, [...(grupos.get(a.tipo) ?? []), a]);
    return [...grupos.entries()]
      .map(([tipo, alertas]): GrupoAlertas => ({
        tipo, alertas, total: alertas.length, tono: this.tonoSeveridad(alertas[0].severidad), ...TIPOS_ALERTA[tipo],
      }))
      .sort((x, y) =>
        ORDEN_SEVERIDAD[x.alertas[0].severidad] - ORDEN_SEVERIDAD[y.alertas[0].severidad] || y.total - x.total);
  });

  protected readonly totalAlertas = computed(() => this.listaAlertas().length);

  // ── Preparación del período (10 por página, como Contratos) ──────────
  protected readonly filasPreparacion = computed<LiquidacionResumen[]>(() => {
    const p = this.preparacion();
    return p.estado === 'ok' ? p.datos.filas : [];
  });
  private readonly porPagina = 10;
  protected readonly paginaPreparacion = signal(1);
  protected readonly totalPaginasPreparacion = computed(() =>
    Math.max(1, Math.ceil(this.filasPreparacion().length / this.porPagina)));
  protected readonly numerosPaginaPreparacion = computed(() =>
    Array.from({ length: this.totalPaginasPreparacion() }, (_, i) => i + 1));
  protected readonly filasPreparacionPagina = computed(() => {
    const inicio = (Math.min(this.paginaPreparacion(), this.totalPaginasPreparacion()) - 1) * this.porPagina;
    return this.filasPreparacion().slice(inicio, inicio + this.porPagina);
  });
  protected readonly rangoPreparacion = computed(() => {
    const total = this.filasPreparacion().length;
    const desde = total === 0 ? 0 : (Math.min(this.paginaPreparacion(), this.totalPaginasPreparacion()) - 1) * this.porPagina + 1;
    return { desde, hasta: Math.min(desde + this.porPagina - 1, total) };
  });

  // ── Acciones ────────────────────────────────────────────────────────
  protected cambiarPeriodo(valor: string): void {
    if (esPeriodoValido(valor) && valor !== this.periodo()) {
      this.abierto.set(null);
      this.paginaPreparacion.set(1);
      this.periodo.set(valor);
    }
  }

  protected alternar(tipo: TipoAlerta): void {
    this.abierto.update((actual) => (actual === tipo ? null : tipo));
  }

  protected actualizar(): void {
    this.recargar$.next();
  }

  // ── Presentación ────────────────────────────────────────────────────
  /** Cuotas de anticipos adicionales de todos los cortes del mes (RN 38). */
  protected descuentoDe(l: LiquidacionResumen): number {
    return l.cortes.reduce((t, c) => t + c.descuento, 0);
  }

  /** Lo que irá en los archivos de pago del mes: neto menos anticipos. */
  protected valorDe(l: LiquidacionResumen): number {
    return l.cortes.reduce((t, c) => t + c.valor, 0);
  }

  protected tonoVencimiento(v: VencimientoContrato): TonoChip {
    if (v.diasRestantes < 0) return 'danger';
    if (v.diasRestantes <= 7) return 'danger';
    if (v.diasRestantes <= 15) return 'warn';
    return 'info';
  }

  protected textoVencimiento(v: VencimientoContrato): string {
    if (v.diasRestantes < 0) return `Vencido hace ${-v.diasRestantes} d`;
    if (v.diasRestantes === 0) return 'Vence hoy';
    return `${v.diasRestantes} días`;
  }

  private tonoSeveridad(s: Severidad): 'danger' | 'warn' | 'info' {
    return s === 'Critica' ? 'danger' : s === 'Advertencia' ? 'warn' : 'info';
  }

  /**
   * Convierte una llamada en una señal con su estado. Se repite al cambiar el período
   * o al pulsar Actualizar, y cancela la petición anterior si sigue en curso.
   */
  private cargar<T>(llamada: (periodo: string) => Observable<T>) {
    const inicial: Estado<T> = { estado: 'cargando' };
    return toSignal(
      combineLatest([toObservable(this.periodo), this.recargar$]).pipe(
        switchMap(([periodo]) =>
          llamada(periodo).pipe(
            map((datos): Estado<T> => ({ estado: 'ok', datos })),
            catchError((e: unknown) => of<Estado<T>>({ estado: 'error', mensaje: mensajeError(e) })),
            startWith(inicial),
          ),
        ),
      ),
      { initialValue: inicial },
    );
  }
}
