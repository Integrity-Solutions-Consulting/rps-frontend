import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { catchError, filter, of, startWith, switchMap } from 'rxjs';
import { MENU } from '../../navigation/menu';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionService } from '../../services/session.service';
import { ColaboradoresService } from '../../../features/colaboradores/services/colaboradores.service';
import { PeriodoEnPantallaService } from '../../services/periodo-en-pantalla.service';

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

  /**
   * "nov 2026": el mes que está viendo el usuario. Sigue al selector de período de Inicio, Liquidaciones,
   * Exportaciones o Anticipos; en las demás pantallas queda el último mes elegido.
   */
  private readonly periodoEnPantalla = inject(PeriodoEnPantallaService);
  protected readonly mesActual = computed(() => {
    const [anio, mes] = this.periodoEnPantalla.periodo().split('-').map(Number);
    return new Date(anio, mes - 1, 1).toLocaleDateString('es-EC', { month: 'short', year: 'numeric' }).replace('.', '');
  });

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
