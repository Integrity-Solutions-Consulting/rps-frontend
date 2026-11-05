import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificacionesService } from '../../services/notificaciones.service';
import { ETIQUETA_CAMBIO, detalleCambio, nombreCambio } from '../../models/notificacion.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { Bandeja } from '../bandeja/bandeja';

/** Cuántos se ven en el menú desplegable; el resto, en la ventana "Ver todos". */
const EN_MENU = 5;

/**
 * Campana de la cabecera: cuántos cambios de TMR faltan revisar, los 5 más recientes
 * y "Ver todos", que abre la ventana con todos y el botón "Marcar revisado".
 */
@Component({
  selector: 'app-campana',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Bandeja],
  templateUrl: './campana.html',
  styleUrl: './campana.scss',
  host: {
    '(document:click)': 'cerrarSiEsAfuera($event)',
    '(document:keydown.escape)': 'abierto.set(false)',
  },
})
export class Campana {
  protected readonly notificaciones = inject(NotificacionesService);
  private readonly elemento = inject(ElementRef<HTMLElement>);

  protected readonly etiqueta = ETIQUETA_CAMBIO;
  protected readonly nombre = nombreCambio;
  protected readonly detalle = detalleCambio;
  protected readonly abierto = signal(false);
  protected readonly primeros = computed(() => this.notificaciones.lista().slice(0, EN_MENU));
  protected readonly restantes = computed(() => Math.max(0, this.notificaciones.total() - EN_MENU));
  /** "99+" para que el número no rompa el círculo. */
  protected readonly insignia = computed(() => {
    const t = this.notificaciones.total();
    return t > 99 ? '99+' : String(t);
  });

  protected alternar(): void {
    this.abierto.update((v) => !v);
    if (this.abierto()) this.notificaciones.cargar();
  }

  protected verTodos(): void {
    this.abierto.set(false);
    this.notificaciones.abrir();
  }

  protected cerrarSiEsAfuera(evento: MouseEvent): void {
    if (this.abierto() && !this.elemento.nativeElement.contains(evento.target as Node)) this.abierto.set(false);
  }
}
