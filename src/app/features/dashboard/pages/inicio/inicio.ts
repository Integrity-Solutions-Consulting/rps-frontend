import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { PeriodoEnPantallaService } from '../../../../core/services/periodo-en-pantalla.service';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { DashboardService } from '../../services/dashboard.service';
import { IndicadoresDashboard, VencimientoContrato } from '../../models/dashboard.models';
import { LiquidacionesService } from '../../../liquidaciones/services/liquidaciones.service';
import { LiquidacionResumen, corteDe } from '../../../liquidaciones/models/liquidacion.models';
import { IntegracionTmrService } from '../../../integracion-tmr/services/integracion-tmr.service';
import { ETIQUETA_CAMBIO, detalleCambio, nombreCambio } from '../../../notificaciones/models/notificacion.models';
import { ColaboradoresService } from '../../../colaboradores/services/colaboradores.service';
import { BeCambioTmr, BeEstadoTmr } from '../../../../core/backend/backend-rps.models';
import { ColaboradorResumen } from '../../../colaboradores/models/colaborador.models';
import { mensajeError } from '../../../../core/http/mensaje-error';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';

/** Estado de cada sección: se cargan por separado para que un error no oculte lo demás. */
type Estado<T> =
  | { estado: 'cargando' }
  | { estado: 'ok'; datos: T }
  | { estado: 'error'; mensaje: string };

type ClaveGrupo = 'tmr' | 'configuracion' | 'vencidos' | 'liquidaciones';

interface ItemAtencion { id: string; titulo: string; detalle: string; ruta: unknown[]; query: Record<string, string> }

/** Un botón de "Requiere atención". Con `items` se despliega; sin ellos, el botón lleva a la pantalla. */
interface GrupoAtencion {
  clave: ClaveGrupo;
  etiqueta: string;
  descripcion: string;
  icono: IconName;
  tono: 'danger' | 'warn' | 'info';
  total: number;
  items: ItemAtencion[] | null;
  ruta: unknown[];
  query: Record<string, string>;
}

/**
 * Inicio. Todo lo que se ve viene de rps-backend:
 *   - Indicadores: GET /api/dashboard?periodo= (lógica de DashboardService del backend).
 *   - Vencimientos: GET /api/dashboard/vencimientos.
 *   - Requiere atención: cambios de TMR sin revisar, colaboradores con configuración pendiente,
 *     contratos vencidos con asignación activa y liquidaciones sin revisar.
 *   - Preparación del período: GET /api/liquidaciones?periodo= (misma lista que Liquidaciones).
 *   - Estado de TMR: GET /api/integracion-tmr/estado (RC 05).
 */
@Component({
  selector: 'app-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, RouterLink, Icon, EstadoChip],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss',
})
export class Inicio {
  private readonly api = inject(DashboardService);
  private readonly liquidaciones = inject(LiquidacionesService);
  private readonly tmr = inject(IntegracionTmrService);
  private readonly colaboradores = inject(ColaboradoresService);
  private readonly recargar$ = new BehaviorSubject<void>(undefined);

  protected readonly periodo = signal(periodoActual());
  /** El menú lateral muestra el mes elegido aquí (solo interfaz). */
  private readonly periodoEnPantalla = inject(PeriodoEnPantallaService);
  private readonly publicarPeriodo = effect(() => this.periodoEnPantalla.periodo.set(this.periodo()));
  protected readonly nombrePeriodo = computed(() => nombrePeriodo(this.periodo()));
  protected readonly corteDe = corteDe;

  // ── Llamadas al backend ─────────────────────────────────────────────
  protected readonly indicadores = this.cargar<IndicadoresDashboard>((p) => this.api.indicadores(p));
  protected readonly vencimientos = this.cargar<VencimientoContrato[]>(() => this.api.vencimientos());
  protected readonly estadoTmr = this.cargar<BeEstadoTmr>(() => this.tmr.estado());
  protected readonly cambiosTmr = this.cargar<BeCambioTmr[]>(() => this.tmr.cambiosSinRevisar());
  protected readonly pendientes = this.cargar<ColaboradorResumen[]>(() =>
    this.colaboradores.listar({ estado: 'Pendiente', activo: null }));
  /** Preparación del período: la misma lista de la pantalla Liquidaciones. */
  protected readonly preparacion = this.cargar((p) => this.liquidaciones.listar(p));

  // ── Datos para la pantalla ──────────────────────────────────────────
  protected readonly datos = computed(() => {
    const r = this.indicadores();
    return r.estado === 'ok' ? r.datos : null;
  });
  /** RN 13: primer plazo de aviso configurado (30 mientras no carga el resumen). */
  protected readonly diasPrimerAviso = computed(() => this.datos()?.contratosPorVencer.diasAviso1 ?? 30);

  protected readonly cargando = computed(() =>
    [this.indicadores(), this.vencimientos(), this.estadoTmr(), this.cambiosTmr(), this.pendientes(), this.preparacion()]
      .some((s) => s.estado === 'cargando'));

  protected readonly totalLiquidaciones = computed(() => {
    const d = this.datos();
    return d ? d.liquidaciones.revisadas + d.liquidaciones.sinRevisar : 0;
  });

  protected readonly avanceRevision = computed(() => {
    const d = this.datos();
    const total = this.totalLiquidaciones();
    return d && total > 0 ? Math.round((d.liquidaciones.revisadas / total) * 100) : 0;
  });

  protected readonly listaVencimientos = computed<VencimientoContrato[]>(() => {
    const v = this.vencimientos();
    return v.estado === 'ok' ? v.datos : [];
  });

  /** Estado de TMR (RC 05): se avisa si nunca se sincronizó o si el backend lo marca como desactualizado. */
  protected readonly avisoTmr = computed<string | null>(() => {
    const e = this.estadoTmr();
    if (e.estado === 'error') return 'No se pudo consultar el estado de la sincronización con TMR.';
    if (e.estado !== 'ok') return null;
    if (!e.datos.ultimaSincronizacion) return 'Todavía no se ha sincronizado con TMR.';
    if (e.datos.desactualizada) return 'La copia de TMR está desactualizada.';
    return null;
  });

  // ── Requiere atención ───────────────────────────────────────────────
  /** Grupo abierto (uno a la vez), o null si todos están cerrados. */
  protected readonly abierto = signal<ClaveGrupo | null>(null);

  protected readonly grupos = computed<GrupoAtencion[]>(() => {
    const grupos: GrupoAtencion[] = [];

    const cambios = this.cambiosTmr();
    if (cambios.estado === 'ok' && cambios.datos.length) {
      grupos.push({
        clave: 'tmr', etiqueta: 'Cambios de TMR', descripcion: 'Detectados en la sincronización y sin revisar', icono: 'sync',
        tono: cambios.datos.some((c) => c.tieneLiquidacionRevisada) ? 'danger' : 'warn', total: cambios.datos.length,
        items: cambios.datos.map((c) => ({
          id: c.id, titulo: nombreCambio(c), detalle: `${ETIQUETA_CAMBIO[c.tipo]}${detalleCambio(c) ? ' · ' + detalleCambio(c) : ''}`,
          ruta: ['/colaboradores', c.colaboradorId], query: { tab: 'proyectos' },
        })),
        ruta: [], query: {},
      });
    }

    const pendientes = this.pendientes();
    if (pendientes.estado === 'ok' && pendientes.datos.length) {
      grupos.push({
        clave: 'configuracion', etiqueta: 'Configuración pendiente', descripcion: 'Falta tipo de servicio, frecuencia o cuenta bancaria',
        icono: 'sliders', tono: 'warn', total: pendientes.datos.length,
        items: pendientes.datos.map((c) => ({
          id: c.id, titulo: `${c.nombres ?? ''} ${c.apellidos ?? ''}`.trim() || `ID TMR ${c.tmrColaboradorId}`,
          detalle: c.activo ? 'Activo' : 'Desactivado', ruta: ['/colaboradores', c.id], query: { tab: 'condiciones' },
        })),
        ruta: [], query: {},
      });
    }

    // El backend devuelve en "vencimientos" los vencidos que siguen con la asignación activa.
    const vencidos = this.listaVencimientos().filter((v) => v.diasRestantes < 0);
    if (vencidos.length) {
      grupos.push({
        clave: 'vencidos', etiqueta: 'Contrato vencido con proyecto activo', descripcion: 'Siguen asignados en TMR sin renovación',
        icono: 'users', tono: 'danger', total: vencidos.length,
        items: vencidos.map((v) => ({
          id: v.contratoId, titulo: v.colaborador, detalle: `${v.proyecto} · venció el ${v.fechaFinVigente}`,
          ruta: ['/contratos'], query: { colaborador: v.tmrColaboradorId, contrato: v.contratoId },
        })),
        ruta: [], query: {},
      });
    }

    const d = this.datos();
    if (d && d.liquidaciones.sinRevisar > 0) {
      grupos.push({
        clave: 'liquidaciones', etiqueta: 'Liquidaciones sin revisar', descripcion: `De ${this.nombrePeriodo()}`,
        icono: 'calculator', tono: 'info', total: d.liquidaciones.sinRevisar, items: null,
        ruta: ['/liquidaciones'], query: { periodo: this.periodo() },
      });
    }

    return grupos;
  });

  protected readonly totalAtencion = computed(() => this.grupos().reduce((t, g) => t + g.total, 0));

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

  protected alternar(clave: ClaveGrupo): void {
    this.abierto.update((actual) => (actual === clave ? null : clave));
  }

  protected actualizar(): void {
    this.recargar$.next();
  }

  // ── Presentación ────────────────────────────────────────────────────
  protected tonoVencimiento(v: VencimientoContrato): TonoChip {
    return v.diasRestantes < 0 ? 'danger' : 'warn';
  }

  protected textoVencimiento(v: VencimientoContrato): string {
    if (v.diasRestantes < 0) return `Vencido hace ${-v.diasRestantes} d`;
    if (v.diasRestantes === 0) return 'Vence hoy';
    return `${v.diasRestantes} días`;
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
