import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, map, of, startWith, switchMap } from 'rxjs';

import { ColaboradoresService } from '../../services/colaboradores.service';
import { Clasificacion, ColaboradorResumen, ETIQUETA_CLASIFICACION } from '../../models/colaborador.models';
import { identificacionEnmascarada } from '../../../integracion-tmr/models/tmr.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';

type Carga<T> = { estado: 'cargando' } | { estado: 'ok'; datos: T } | { estado: 'error'; mensaje: string };

/**
 * Ventana "Pendientes de configuración" (desde "Requieren atención" en Colaboradores).
 * GET /api/colaboradores?estado=Pendiente&activo=true&busqueda=… filtra en el backend; el tipo de servicio
 * lo filtra ColaboradoresService.listar sobre la respuesta (el backend no tiene ese filtro).
 * Aquí solo se muestra la lista en páginas de 6.
 */
@Component({
  selector: 'app-dialogo-pendientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Icon, UiDialog],
  templateUrl: './dialogo-pendientes.html',
  styleUrl: './dialogo-pendientes.scss',
})
export class DialogoPendientes {
  private readonly api = inject(ColaboradoresService);
  readonly cerrar = output<void>();

  protected readonly etiquetaClasificacion = ETIQUETA_CLASIFICACION;
  protected readonly busqueda = signal('');
  protected readonly tipo = signal<Clasificacion | ''>('');

  private readonly filtros = computed(() => ({
    estado: 'Pendiente' as const,
    activo: true,
    busqueda: this.busqueda(),
    clasificacion: this.tipo() || null,
  }));

  protected readonly carga = toSignal(
    toObservable(this.filtros).pipe(
      debounceTime(250),
      switchMap((f) =>
        this.api.listar(f).pipe(
          map((datos): Carga<ColaboradorResumen[]> => ({ estado: 'ok', datos })),
          catchError((e: unknown) => of<Carga<ColaboradorResumen[]>>({ estado: 'error', mensaje: leerErrorApi(e).mensaje })),
          startWith<Carga<ColaboradorResumen[]>>({ estado: 'cargando' }),
        ),
      ),
    ),
    { initialValue: { estado: 'cargando' } as Carga<ColaboradorResumen[]> },
  );

  protected readonly filas = computed(() => {
    const c = this.carga();
    if (c.estado !== 'ok') return [];
    return c.datos.map((x) => ({
      id: x.id,
      nombre: `${x.nombres ?? ''} ${x.apellidos ?? ''}`.trim() || `ID TMR ${x.tmrColaboradorId}`,
      identificacion: x.identificacion ? identificacionEnmascarada(x.identificacion) : '—',
      tmr: x.tmrColaboradorId,
      tipo: x.clasificacion ? ETIQUETA_CLASIFICACION[x.clasificacion] : 'Sin tipo de servicio',
    }));
  });

  // ── Páginas de 6 ───────────────────────────────────────────────────
  private readonly porPagina = 6;
  protected readonly pagina = signal(1);
  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.filas().length / this.porPagina)));
  protected readonly paginaActual = computed(() => Math.min(this.pagina(), this.totalPaginas()));
  protected readonly filasPagina = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.porPagina;
    return this.filas().slice(inicio, inicio + this.porPagina);
  });
  protected readonly rango = computed(() => {
    const total = this.filas().length;
    const desde = total === 0 ? 0 : (this.paginaActual() - 1) * this.porPagina + 1;
    return { desde, hasta: Math.min(desde + this.porPagina - 1, total), total };
  });
  /** Botones compactos: primera, última, la actual y sus vecinas; null = "…". */
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

  constructor() {
    // Al buscar o cambiar el tipo se vuelve a la primera página.
    effect(() => {
      this.filtros();
      untracked(() => this.pagina.set(1));
    });
  }

  protected iniciales(nombre: string): string {
    return nombre.startsWith('ID TMR') ? '?' : nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }
}
