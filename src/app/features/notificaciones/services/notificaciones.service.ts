import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { IntegracionTmrService } from '../../integracion-tmr/services/integracion-tmr.service';
import { CambioTmr } from '../models/notificacion.models';

/**
 * Estado de la campana, compartido por la cabecera y la ventana "Ver todos".
 * Se vuelve a pedir al backend al cambiar de pantalla, para que esté al día.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private readonly tmr = inject(IntegracionTmrService);

  /** Cambios de TMR sin revisar, en el orden del backend (del más reciente al más antiguo). */
  readonly lista = signal<CambioTmr[]>([]);
  readonly cargando = signal(false);
  readonly error = signal(false);
  readonly ventanaAbierta = signal(false);

  readonly total = computed(() => this.lista().length);
  /** Los que el backend marca como que afectan una liquidación ya revisada. */
  readonly afectanRevisadas = computed(() => this.lista().filter((c) => c.tieneLiquidacionRevisada).length);

  constructor() {
    this.cargar();
    inject(Router).events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.cargar());
  }

  /** GET /api/integracion-tmr/cambios?revisado=false */
  cargar(): void {
    this.cargando.set(true);
    this.tmr.cambiosSinRevisar().subscribe({
      next: (l) => { this.lista.set(l); this.cargando.set(false); this.error.set(false); },
      error: () => { this.cargando.set(false); this.error.set(true); },
    });
  }

  /** POST /api/integracion-tmr/cambios/{id}/revisar */
  marcarRevisado(id: string, alTerminar?: (error: unknown) => void): void {
    this.tmr.marcarCambioRevisado(id).subscribe({
      next: () => { this.lista.update((l) => l.filter((c) => c.id !== id)); alTerminar?.(null); },
      error: (e: unknown) => alTerminar?.(e),
    });
  }

  abrir(): void {
    this.ventanaAbierta.set(true);
  }

  cerrar(): void {
    this.ventanaAbierta.set(false);
  }
}
