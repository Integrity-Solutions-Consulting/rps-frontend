import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../services/session.service';

/** Todas las pantallas piden sesión; sin ella se va al login y luego se vuelve a la misma ruta. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(SessionService).autenticado()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { volver: state.url } });
};

/** El login no se muestra si ya hay sesión. */
export const soloSinSesionGuard: CanActivateFn = () =>
  inject(SessionService).autenticado() ? inject(Router).createUrlTree(['/inicio']) : true;
