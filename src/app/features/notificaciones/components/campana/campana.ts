import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificacionesService } from '../../services/notificaciones.service';
import { Notificacion } from '../../models/notificacion.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { Bandeja } from '../bandeja/bandeja';

/** Cuántas se ven en el menú desplegable; el resto, en la ventana "Ver todas". */
const EN_MENU = 5;

/**
 * Campana de la cabecera. Muestra cuántas notificaciones hay, las 5 más importantes
 * en un menú y un botón "Ver todas" que abre la ventana completa (con filtros y búsqueda).
 * Pensada para cuando haya 100 o más avisos: el menú nunca crece, la ventana pagina.
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

  protected readonly abierto = signal(false);
  protected readonly primeras = computed(() => this.notificaciones.ordenadas().slice(0, EN_MENU));
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

  protected verTodas(): void {
    this.abierto.set(false);
    this.notificaciones.abrir();
  }

  protected icono(n: Notificacion): 'alert' | 'clock' | 'info' {
    return n.severidad === 'Critica' ? 'alert' : n.severidad === 'Advertencia' ? 'clock' : 'info';
  }

  protected cerrarSiEsAfuera(evento: MouseEvent): void {
    if (this.abierto() && !this.elemento.nativeElement.contains(evento.target as Node)) this.abierto.set(false);
  }
}
