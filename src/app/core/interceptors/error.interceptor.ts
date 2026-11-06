import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';
import { mensajeError } from '../http/mensaje-error';

/**
 * Errores comunes: los de conexión (0) y de permisos (403) se avisan en un mensaje global.
 * El 401 (sesión vencida) no: lo resuelve authTokenInterceptor renovando el token o llevando al login.
 * El resto se deja pasar para que cada pantalla muestre el error en su propia sección.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && [0, 403].includes(error.status)) {
        notifications.error(mensajeError(error));
      }
      return throwError(() => error);
    }),
  );
};
