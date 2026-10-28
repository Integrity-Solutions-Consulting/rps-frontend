import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SessionService } from '../services/session.service';

/** Adjunta el JWT cuando exista. RPS aún no tiene login, así que hoy no agrega nada. */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(SessionService).token();
  if (!token || !req.url.startsWith('/api')) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
