import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SessionService } from '../services/session.service';

/** Rutas de /api/auth que no llevan token ni se reintentan (el backend las deja pasar sin sesión). */
const SIN_TOKEN = ['/auth/login', '/auth/refresh-token'];

/**
 * Adjunta el JWT a cada llamada a /api. Si el backend responde 401 (token vencido),
 * pide uno nuevo con el refresh token una sola vez y repite la llamada.
 * Si tampoco se puede renovar, SessionService cierra la sesión y lleva al login.
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  if (!req.url.startsWith(environment.apiUrl)) return next(req);
  const ruta = req.url.slice(environment.apiUrl.length);
  if (SIN_TOKEN.some((r) => ruta.startsWith(r))) return next(req);

  const conToken = (r: HttpRequest<unknown>, token: string | null) =>
    token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;

  return next(conToken(req, session.token())).pipe(
    catchError((error: unknown) => {
      const vencido = error instanceof HttpErrorResponse && error.status === 401 && session.autenticado()
        && !ruta.startsWith('/auth/logout');
      if (!vencido) return throwError(() => error);
      return session.renovar().pipe(
        switchMap((nuevo) => next(conToken(req, nuevo))),
        // No se pudo renovar: SessionService ya llevó al login; la pantalla recibe el 401 original.
        catchError(() => throwError(() => error)),
      );
    }),
  );
};
