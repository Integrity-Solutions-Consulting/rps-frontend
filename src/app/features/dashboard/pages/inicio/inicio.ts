import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { DashboardService } from '../../services/dashboard.service';
import {
  AlertaDashboard, CorteResumen, DashboardResumen, Severidad, TipoAlerta, VencimientoContrato,
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

const TIPOS_ALERTA: Record<TipoAlerta, { etiqueta: string; icono: IconName }> = {
  CambioTmr: { etiqueta: 'Cambios de TMR', icono: 'sync' },
  Asignacion: { etiqueta: 'Asignación', icono: 'users' },
  Documentacion: { etiqueta: 'Documentación', icono: 'file' },
  DatosIncompletos: { etiqueta: 'Datos incompletos', icono: 'sliders' },
  Anticipo: { etiqueta: 'Anticipos', icono: 'card' },
};

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
  private readonly recargar$ = new BehaviorSubject<void>(undefined);

  protected readonly periodo = signal(periodoActual());
  protected readonly nombrePeriodo = computed(() => nombrePeriodo(this.periodo()));
  protected readonly tiposAlerta = TIPOS_ALERTA;

  // ── Llamadas al backend ─────────────────────────────────────────────
  protected readonly resumen = this.cargar((p) => this.api.resumen(p));
  protected readonly vencimientos = this.cargar((p) => this.api.vencimientos(p));
  protected readonly alertas = this.cargar((p) => this.api.alertas(p));

  // ── Datos derivados ─────────────────────────────────────────────────
  protected readonly datos = computed<DashboardResumen | null>(() => {
    const r = this.resumen();
    return r.estado === 'ok' ? r.datos : null;
  });

  protected readonly cargando = computed(() =>
    [this.resumen(), this.vencimientos(), this.alertas()].some((s) => s.estado === 'cargando'),
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

  protected readonly filtroAlerta = signal<TipoAlerta | 'Todas'>('Todas');

  private readonly listaAlertas = computed<AlertaDashboard[]>(() => {
    const a = this.alertas();
    return a.estado === 'ok'
      ? [...a.datos].sort((x, y) => ORDEN_SEVERIDAD[x.severidad] - ORDEN_SEVERIDAD[y.severidad])
      : [];
  });

  protected readonly conteoAlertas = computed(() => {
    const conteo = new Map<TipoAlerta, number>();
    for (const a of this.listaAlertas()) conteo.set(a.tipo, (conteo.get(a.tipo) ?? 0) + 1);
    return [...conteo.entries()].map(([tipo, total]) => ({ tipo, total, ...TIPOS_ALERTA[tipo] }));
  });

  protected readonly alertasFiltradas = computed(() => {
    const f = this.filtroAlerta();
    return f === 'Todas' ? this.listaAlertas() : this.listaAlertas().filter((a) => a.tipo === f);
  });

  protected readonly totalAlertas = computed(() => this.listaAlertas().length);

  // ── Acciones ────────────────────────────────────────────────────────
  protected cambiarPeriodo(valor: string): void {
    if (esPeriodoValido(valor) && valor !== this.periodo()) {
      this.filtroAlerta.set('Todas');
      this.periodo.set(valor);
    }
  }

  protected actualizar(): void {
    this.recargar$.next();
  }

  // ── Presentación ────────────────────────────────────────────────────
  protected etiquetaCorte(c: CorteResumen): string {
    return c.corte === 'Quincena' ? 'Quincena (1–15)' : 'Fin de mes (16–fin)';
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

  protected tonoSeveridad(s: Severidad): TonoChip {
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
