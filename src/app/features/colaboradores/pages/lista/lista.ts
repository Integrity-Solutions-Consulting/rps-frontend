import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { ColaboradoresService } from '../../services/colaboradores.service';
import { Clasificacion, ColaboradorResumen, ETIQUETA_CLASIFICACION, EstadoConfiguracion } from '../../models/colaborador.models';
import { IntegracionTmrService } from '../../../integracion-tmr/services/integracion-tmr.service';
import { TmrColaborador, identificacionEnmascarada, nombreCompleto } from '../../../integracion-tmr/models/tmr.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';

type Carga<T> = { estado: 'cargando' } | { estado: 'ok'; datos: T } | { estado: 'error'; mensaje: string };
type FiltroActivo = 'activos' | 'inactivos' | 'todos';

/** Fila de la tabla: datos de RPS + nombre e identificación de la copia de TMR. */
interface FilaColaborador extends ColaboradorResumen {
  nombre: string;
  identificacion: string;
}

/**
 * Lista de colaboradores.
 *   - Configuración (clasificación, estado) → /api/colaboradores (backend real de RPS)
 *   - Nombre e identificación                → /api/integracion-tmr/colaboradores (copia de TMR; hoy de ejemplo)
 * RPS no da de alta personas (RN 03): "Vincular" elige a alguien que ya existe en TMR.
 */
@Component({
  selector: 'app-colaboradores-lista',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, Icon, EstadoChip],
  templateUrl: './lista.html',
  styleUrl: './lista.scss',
})
export class ColaboradoresLista {
  private readonly api = inject(ColaboradoresService);
  private readonly tmrApi = inject(IntegracionTmrService);
  private readonly router = inject(Router);
  private readonly recargar$ = new BehaviorSubject<void>(undefined);

  protected readonly etiquetaClasificacion = ETIQUETA_CLASIFICACION;
  protected readonly clasificaciones: Clasificacion[] = ['Profesional', 'Junior'];

  // ── Filtros: estado y activo los resuelve el backend; la búsqueda es local ──
  protected readonly filtroEstado = signal<EstadoConfiguracion | ''>('');
  protected readonly filtroActivo = signal<FiltroActivo>('activos');
  protected readonly busqueda = signal('');

  private readonly filtros = computed(() => ({
    estado: this.filtroEstado() || null,
    activo: this.filtroActivo() === 'todos' ? null : this.filtroActivo() === 'activos',
  }));

  protected readonly carga = toSignal(
    combineLatest([toObservable(this.filtros), this.recargar$]).pipe(
      switchMap(([f]) =>
        this.api.listar(f).pipe(
          map((datos): Carga<ColaboradorResumen[]> => ({ estado: 'ok', datos })),
          catchError((e: unknown) => of<Carga<ColaboradorResumen[]>>({ estado: 'error', mensaje: leerErrorApi(e).mensaje })),
          startWith<Carga<ColaboradorResumen[]>>({ estado: 'cargando' }),
        ),
      ),
    ),
    { initialValue: { estado: 'cargando' } as Carga<ColaboradorResumen[]> },
  );

  /** Personas de TMR. Si la copia de TMR no responde, la lista se muestra igual con el ID. */
  protected readonly personasTmr = toSignal(
    this.recargar$.pipe(switchMap(() => this.tmrApi.colaboradores().pipe(catchError(() => of<TmrColaborador[]>([]))))),
    { initialValue: [] as TmrColaborador[] },
  );

  private readonly porTmrId = computed(() => new Map(this.personasTmr().map((p) => [p.tmrColaboradorId, p])));

  private readonly todos = computed<FilaColaborador[]>(() => {
    const c = this.carga();
    if (c.estado !== 'ok') return [];
    return c.datos.map((x) => {
      const p = this.porTmrId().get(x.tmrColaboradorId);
      return {
        ...x,
        nombre: p ? nombreCompleto(p) : `ID TMR ${x.tmrColaboradorId}`,
        identificacion: p ? identificacionEnmascarada(p.identificacion) : '—',
      };
    });
  });

  protected readonly filas = computed(() => {
    const t = this.busqueda().trim().toLowerCase();
    if (!t) return this.todos();
    return this.todos().filter((c) => {
      const p = this.porTmrId().get(c.tmrColaboradorId);
      return `${c.nombre} ${p?.identificacion ?? ''} ${c.tmrColaboradorId}`.toLowerCase().includes(t);
    });
  });

  protected readonly conteo = computed(() => {
    const lista = this.todos();
    return {
      total: lista.length,
      pendientes: lista.filter((c) => c.estadoConfiguracion === 'Pendiente').length,
      configurados: lista.filter((c) => c.estadoConfiguracion === 'Configurado').length,
    };
  });

  // ── Vincular colaborador de TMR ───────────────────────────────────
  protected readonly vinculando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly nuevoTmrId = signal('');
  protected readonly nuevaClasificacion = signal<Clasificacion | ''>('');
  protected readonly errorVincular = signal<string | null>(null);
  protected readonly errorCampoTmr = signal<string | null>(null);

  /** Personas de TMR que todavía no están en RPS (la lista solo trae los filtrados, por eso se consulta "todos"). */
  protected readonly sinVincular = toSignal(
    combineLatest([toObservable(this.vinculando), this.recargar$]).pipe(
      switchMap(([abierto]) => abierto
        ? this.api.listar({ estado: null, activo: null }).pipe(catchError(() => of<ColaboradorResumen[]>([])))
        : of<ColaboradorResumen[]>([])),
      map((vinculados) => {
        const ids = new Set(vinculados.map((v) => v.tmrColaboradorId));
        return this.personasTmr().filter((p) => !ids.has(p.tmrColaboradorId) && p.activo);
      }),
    ),
    { initialValue: [] as TmrColaborador[] },
  );

  protected readonly nombreCompleto = nombreCompleto;

  protected abrirVincular(): void {
    this.nuevoTmrId.set('');
    this.nuevaClasificacion.set('');
    this.errorVincular.set(null);
    this.errorCampoTmr.set(null);
    this.vinculando.set(true);
  }

  protected vincular(): void {
    const tmrId = this.nuevoTmrId().trim();
    if (!tmrId) {
      this.errorCampoTmr.set('Elige la persona de TMR.');
      return;
    }
    this.guardando.set(true);
    this.errorVincular.set(null);
    this.errorCampoTmr.set(null);

    this.api.crear({ tmrColaboradorId: tmrId, clasificacion: this.nuevaClasificacion() || null }).subscribe({
      next: (c) => {
        this.guardando.set(false);
        this.vinculando.set(false);
        void this.router.navigate(['/colaboradores', c.id]);
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        if (err.campos['tmrColaboradorId']) this.errorCampoTmr.set(err.campos['tmrColaboradorId']);
        else this.errorVincular.set(err.mensaje);
      },
    });
  }

  protected actualizar(): void {
    this.recargar$.next();
  }

  protected limpiarFiltros(): void {
    this.filtroEstado.set('');
    this.filtroActivo.set('activos');
    this.busqueda.set('');
  }

  protected iniciales(nombre: string): string {
    return nombre.startsWith('ID TMR') ? '?' : nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }
}
