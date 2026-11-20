import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { SessionService } from '../services/session.service';
import { NotificationService } from '../services/notification.service';

/** Todas las pantallas piden sesión; sin ella se va al login y luego se vuelve a la misma ruta. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(SessionService).autenticado()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { volver: state.url } });
};

/**
 * El módulo solo se abre si el rol tiene ese permiso (Configuración > Roles). Si no, vuelve a Inicio.
 * Si los permisos todavía no se pidieron (p. ej. al recargar la página), los pide primero.
 */
export const permisoGuard = (modulo: string, nombre: string): CanActivateFn => () => {
  const session = inject(SessionService);
  const router = inject(Router);
  const avisos = inject(NotificationService);
  const decidir = (permisos: string[] | null) => {
    if (permisos?.includes(modulo)) return true;
    avisos.error(`Tu rol no tiene permiso para entrar a ${nombre}.`);
    return router.createUrlTree(['/inicio']);
  };
  const actuales = session.permisos();
  if (actuales) return decidir(actuales);
  return session.cargarPermisos().pipe(map(decidir), catchError(() => of(decidir(null))));
};

/** El login no se muestra si ya hay sesión. */
export const soloSinSesionGuard: CanActivateFn = () =>
  inject(SessionService).autenticado() ? inject(Router).createUrlTree(['/inicio']) : true;
