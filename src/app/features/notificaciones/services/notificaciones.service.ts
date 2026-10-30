import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, forkJoin } from 'rxjs';
import { BackendRps } from '../../../core/backend/backend-rps.service';
import { environment } from '../../../../environments/environment';
import { Notificacion, PESO_SEVERIDAD, TipoNotificacion } from '../models/notificacion.models';
import { periodoActual } from '../../../shared/utils/periodo';

/**
 * Estado de la bandeja de notificaciones, compartido por la campana de la cabecera y por
 * cualquier pantalla que quiera abrir la ventana con un filtro (por ejemplo Liquidaciones).
 * Se vuelve a pedir al backend cada vez que se cambia de pantalla, para que esté al día.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/notificaciones`;
  private readonly be = inject(BackendRps);

  readonly lista = signal<Notificacion[]>([]);
  readonly cargando = signal(false);
  readonly error = signal(false);

  /** Ventana con todas las notificaciones: abierta o cerrada, y con qué filtro empieza. */
  readonly ventanaAbierta = signal(false);
  readonly filtroInicial = signal<TipoNotificacion | null>(null);

  readonly ordenadas = computed(() =>
    [...this.lista()].sort((a, b) =>
      PESO_SEVERIDAD[a.severidad] - PESO_SEVERIDAD[b.severidad] || b.fecha.localeCompare(a.fecha)));
  readonly total = computed(() => this.lista().length);
  readonly criticas = computed(() => this.lista().filter((n) => n.severidad === 'Critica').length);

  constructor() {
    this.cargar();
    inject(Router).events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.cargar());
  }

  /** GET /api/notificaciones?periodo=2026-10 */
  cargar(): void {
    this.cargando.set(true);
    forkJoin({
      l: this.http.get<Notificacion[]>(this.base, { params: new HttpParams().set('periodo', periodoActual()) }),
      nombres: this.be.nombres(),
    }).subscribe({
      next: ({ l, nombres }) => {
        // El backend manda "ID TMR x"; si la copia de TMR tiene a la persona, se muestra su nombre.
        this.lista.set(l.map((n) => {
          const p = n.tmrColaboradorId ? nombres.get(n.tmrColaboradorId) : undefined;
          return p ? { ...n, colaborador: `${p.nombres} ${p.apellidos}`.trim() } : n;
        }));
        this.cargando.set(false);
        this.error.set(false);
      },
      error: () => { this.cargando.set(false); this.error.set(true); },
    });
  }

  /** Abre la ventana con todas las notificaciones; con `tipo` empieza filtrada. */
  abrir(tipo: TipoNotificacion | null = null): void {
    this.filtroInicial.set(tipo);
    this.ventanaAbierta.set(true);
  }

  cerrar(): void {
    this.ventanaAbierta.set(false);
  }
}
