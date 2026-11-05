import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NotificacionesService } from '../../services/notificaciones.service';
import { ETIQUETA_CAMBIO, detalleCambio, nombreCambio } from '../../models/notificacion.models';
import { NotificationService } from '../../../../core/services/notification.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { nombrePeriodo, periodoDeFecha } from '../../../../shared/utils/periodo';

const POR_PAGINA = 20;

/**
 * Ventana con todos los cambios de TMR sin revisar ("Ver todos" de la campana).
 * Cada uno se puede marcar como revisado (POST /api/integracion-tmr/cambios/{id}/revisar).
 * Se cierra con Esc, con la X o haciendo clic fuera.
 */
@Component({
  selector: 'app-bandeja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Icon, EstadoChip],
  templateUrl: './bandeja.html',
  styleUrl: './bandeja.scss',
  host: { '(document:keydown.escape)': 'cerrar()' },
})
export class Bandeja {
  protected readonly servicio = inject(NotificacionesService);
  private readonly avisos = inject(NotificationService);

  protected readonly etiqueta = ETIQUETA_CAMBIO;
  protected readonly nombre = nombreCambio;
  protected readonly detalle = detalleCambio;
  protected readonly mes = (fecha: string) => nombrePeriodo(periodoDeFecha(fecha));
  protected readonly pagina = signal(1);
  protected readonly guardando = signal<string | null>(null);

  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.servicio.total() / POR_PAGINA)));
  protected readonly visibles = computed(() => {
    const inicio = (Math.min(this.pagina(), this.totalPaginas()) - 1) * POR_PAGINA;
    return this.servicio.lista().slice(inicio, inicio + POR_PAGINA);
  });
  protected readonly rango = computed(() => {
    const total = this.servicio.total();
    const desde = total === 0 ? 0 : (Math.min(this.pagina(), this.totalPaginas()) - 1) * POR_PAGINA + 1;
    return { desde, hasta: Math.min(desde + POR_PAGINA - 1, total), total };
  });

  constructor() {
    // Si al marcar revisados se vacía la última página, se vuelve a la anterior.
    effect(() => {
      const total = this.totalPaginas();
      untracked(() => { if (this.pagina() > total) this.pagina.set(total); });
    });
  }

  protected cerrar(): void {
    this.servicio.cerrar();
  }

  protected marcarRevisado(id: string): void {
    this.guardando.set(id);
    this.servicio.marcarRevisado(id, (e) => {
      this.guardando.set(null);
      if (e) this.avisos.error(leerErrorApi(e).mensaje);
    });
  }
}
