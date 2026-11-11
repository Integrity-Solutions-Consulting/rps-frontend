import { NotificationService } from '../../../../core/services/notification.service';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, combineLatest, debounceTime, map, of, startWith, switchMap } from 'rxjs';

import { ColaboradoresService } from '../../services/colaboradores.service';
import { ColaboradorResumen, ETIQUETA_CLASIFICACION, EstadoConfiguracion } from '../../models/colaborador.models';
import { IntegracionTmrService } from '../../../integracion-tmr/services/integracion-tmr.service';
import { identificacionEnmascarada } from '../../../integracion-tmr/models/tmr.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';

type Carga<T> = { estado: 'cargando' } | { estado: 'ok'; datos: T } | { estado: 'error'; mensaje: string };
type FiltroActivo = 'activos' | 'inactivos' | 'todos';

/** Fila de la tabla: lo que manda el backend + nombre e identificación listos para mostrar. */
interface FilaColaborador extends ColaboradorResumen {
  nombre: string;
  identificacion: string;
}

/**
 * Lista de colaboradores: GET /api/colaboradores (filtros de estado, activo y búsqueda los resuelve el backend).
 * Las personas llegan de TMR con "Sincronizar con TMR" (POST /api/integracion-tmr/sincronizar).
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
  private readonly avisos = inject(NotificationService);
  private readonly recargar$ = new BehaviorSubject<void>(undefined);

  protected readonly etiquetaClasificacion = ETIQUETA_CLASIFICACION;

  // ── Filtros: los resuelve el backend ──
  protected readonly filtroEstado = signal<EstadoConfiguracion | ''>('');
  protected readonly filtroActivo = signal<FiltroActivo>('todos');
  protected readonly busqueda = signal('');

  private readonly filtros = computed(() => ({
    estado: this.filtroEstado() || null,
    activo: this.filtroActivo() === 'todos' ? null : this.filtroActivo() === 'activos',
    busqueda: this.busqueda(),
  }));

  protected readonly carga = toSignal(
    combineLatest([toObservable(this.filtros).pipe(debounceTime(250)), this.recargar$]).pipe(
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

  protected readonly filas = computed<FilaColaborador[]>(() => {
    const c = this.carga();
    if (c.estado !== 'ok') return [];
    return c.datos.map((x) => ({
      ...x,
      nombre: `${x.nombres ?? ''} ${x.apellidos ?? ''}`.trim() || `ID TMR ${x.tmrColaboradorId}`,
      identificacion: x.identificacion ? identificacionEnmascarada(x.identificacion) : '—',
    }));
  });

  protected readonly conteo = computed(() => {
    const lista = this.filas();
    return {
      total: lista.length,
      pendientes: lista.filter((c) => c.estadoConfiguracion === 'Pendiente').length,
      configurados: lista.filter((c) => c.estadoConfiguracion === 'Configurado').length,
    };
  });

  // ── Paginación: 6 por página ──────────────────────────────────────────
  private readonly porPagina = 6;
  protected readonly pagina = signal(1);
  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.filas().length / this.porPagina)));
  /** Página que se muestra: nunca pasa de la última (por ejemplo, si al recargar hay menos colaboradores). */
  protected readonly paginaActual = computed(() => Math.min(this.pagina(), this.totalPaginas()));
  /**
   * Botones de página compactos: primera, última, la actual y sus vecinas; null marca un salto ("…").
   * Nunca más de 7 posiciones: 1 … 4 [5] 6 … 23 · [1] 2 3 4 5 … 23 · 1 … 19 20 21 22 [23].
   */
  protected readonly numerosPagina = computed<(number | null)[]>(() => {
    const total = this.totalPaginas();
    const actual = this.paginaActual();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const visibles = new Set([1, total, actual - 1, actual, actual + 1]);
    if (actual <= 4) [2, 3, 4, 5].forEach((n) => visibles.add(n));
    if (actual >= total - 3) [total - 4, total - 3, total - 2, total - 1].forEach((n) => visibles.add(n));
    const orden = [...visibles].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const resultado: (number | null)[] = [];
    orden.forEach((n, i) => {
      const previo = orden[i - 1];
      if (previo !== undefined && n - previo === 2) resultado.push(previo + 1);
      else if (previo !== undefined && n - previo > 2) resultado.push(null);
      resultado.push(n);
    });
    return resultado;
  });
  protected readonly filasPagina = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.filas().slice(inicio, inicio + this.porPagina);
  });
  protected readonly rango = computed(() => {
    const total = this.filas().length;
    const desde = total === 0 ? 0 : (this.paginaActual() - 1) * this.porPagina + 1;
    return { desde, hasta: Math.min(desde + this.porPagina - 1, total) };
  });

  constructor() {
    // Al cambiar filtros o búsqueda se vuelve a la primera página.
    effect(() => {
      this.filtros();
      untracked(() => this.pagina.set(1));
    });
  }

  // ── Sincronizar con TMR ─────────────────────────────────────────────
  protected readonly sincronizando = signal(false);

  /** POST /api/integracion-tmr/sincronizar. TMR caído → 503; otra sincronización en curso → 409. */
  protected sincronizar(): void {
    this.sincronizando.set(true);
    this.tmrApi.sincronizar().subscribe({
      next: (r) => {
        this.sincronizando.set(false);
        const nuevos = r.colaboradores.creados;
        const omitidas = r.asignacionesOmitidas.length;
        this.avisos.ok(`TMR sincronizado: ${nuevos} colaborador${nuevos === 1 ? '' : 'es'} nuevo${nuevos === 1 ? '' : 's'}, `
          + `${r.colaboradores.actualizados} actualizado${r.colaboradores.actualizados === 1 ? '' : 's'}`
          + (r.cambiosDetectados ? `, ${r.cambiosDetectados} cambio(s) por revisar` : '')
          + (omitidas ? `. ${omitidas} asignación(es) no se copiaron.` : '.'));
        this.recargar$.next();
      },
      error: (e: unknown) => {
        this.sincronizando.set(false);
        this.avisos.error(leerErrorApi(e).mensaje);
      },
    });
  }

  protected actualizar(): void {
    this.recargar$.next();
  }

  protected limpiarFiltros(): void {
    this.filtroEstado.set('');
    this.filtroActivo.set('todos');
    this.busqueda.set('');
  }

  protected iniciales(nombre: string): string {
    return nombre.startsWith('ID TMR') ? '?' : nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }
}
