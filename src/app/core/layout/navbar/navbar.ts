import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { SessionService } from '../../services/session.service';
import { Icon } from '../../../shared/components/icon/icon';
import { Campana } from '../../../features/notificaciones/components/campana/campana';

@Component({
  selector: 'app-navbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Campana],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
  host: { '(document:keydown.escape)': 'menuAbierto.set(false)' },
})
export class Navbar {
  protected readonly session = inject(SessionService);
  /** El menú lateral está oculto en escritorio: se muestra el botón para volver a abrirlo. */
  readonly menuOculto = input(false);
  readonly toggleMenu = output<void>();
  protected readonly menuAbierto = signal(false);

  /** POST /api/auth/logout y vuelta al login. */
  protected salir(): void {
    this.menuAbierto.set(false);
    this.session.cerrarSesion();
  }
}
