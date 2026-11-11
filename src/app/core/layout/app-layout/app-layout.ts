import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { Sidebar } from '../sidebar/sidebar';
import { Navbar } from '../navbar/navbar';
import { NotificationService } from '../../services/notification.service';
import { Icon } from '../../../shared/components/icon/icon';

@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, Navbar, Icon],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.scss',
})
export class AppLayout {
  protected readonly notifications = inject(NotificationService);
  protected readonly menuAbierto = signal(false);
  /** Escritorio: el usuario ocultó el menú lateral. Se recuerda en este navegador. */
  protected readonly menuOculto = signal(leerMenuOculto());

  constructor() {
    // En pantallas pequeñas el menú se cierra al navegar.
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.menuAbierto.set(false));
  }

  /** Botón de la barra superior: en móvil abre/cierra el panel; en escritorio muestra/oculta el menú. */
  protected alternarMenu(): void {
    if (esPantallaPequena()) this.menuAbierto.set(!this.menuAbierto());
    else this.guardarMenuOculto(!this.menuOculto());
  }

  /** Botón "Ocultar menú" del propio menú lateral. */
  protected ocultarMenu(): void {
    if (esPantallaPequena()) this.menuAbierto.set(false);
    else this.guardarMenuOculto(true);
  }

  private guardarMenuOculto(valor: boolean): void {
    this.menuOculto.set(valor);
    try { localStorage.setItem(CLAVE_MENU_OCULTO, valor ? '1' : '0'); } catch { /* sin almacenamiento: solo dura la sesión */ }
  }
}

const CLAVE_MENU_OCULTO = 'rps.menuOculto';

function leerMenuOculto(): boolean {
  try { return localStorage.getItem(CLAVE_MENU_OCULTO) === '1'; } catch { return false; }
}

function esPantallaPequena(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches;
}
