import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { catchError, filter, of, startWith, switchMap } from 'rxjs';
import { MENU } from '../../navigation/menu';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionService } from '../../services/session.service';
import { ColaboradoresService } from '../../../features/colaboradores/services/colaboradores.service';

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Icon],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  protected readonly menu = MENU;
  protected readonly session = inject(SessionService);
  private readonly colaboradores = inject(ColaboradoresService);

  /** "nov 2026": solo para mostrar el mes en curso. */
  protected readonly mesActual = new Date().toLocaleDateString('es-EC', { month: 'short', year: 'numeric' }).replace('.', '');

  /**
   * Pendientes de configuración: el backend filtra (GET /api/colaboradores?estado=Pendiente&activo=true);
   * aquí solo se muestra cuántos devolvió. Se vuelve a pedir al cambiar de pantalla para no quedar desactualizado.
   */
  protected readonly pendientes = signal(0);

  constructor() {
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      switchMap(() => this.colaboradores.listar({ estado: 'Pendiente', activo: true }).pipe(catchError(() => of([])))),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe((lista) => this.pendientes.set(lista.length));
  }
}
