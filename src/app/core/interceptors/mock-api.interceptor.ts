import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { delay, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { mockAlertas, mockResumen, mockVencimientos } from '../mocks/dashboard.mock';

/**
 * Responde con datos de ejemplo cuando environment.useMocks es true (`npm start`).
 * Devuelve la misma envoltura ApiResponse que el backend, así el resto de la app
 * no cambia al conectar el backend real.
 */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.useMocks || !req.url.startsWith(environment.apiUrl)) return next(req);

  const ruta = req.url.slice(environment.apiUrl.length);
  const periodo = req.params.get('periodo') ?? '';

  const responder = <T>(data: T) =>
    of(new HttpResponse<ApiResponse<T>>({
      status: 200,
      url: req.url,
      body: { success: true, statusCode: 200, message: 'OK', data },
    })).pipe(delay(350));

  switch (ruta) {
    case '/dashboard/resumen': return responder(mockResumen(periodo));
    case '/dashboard/vencimientos': return responder(mockVencimientos());
    case '/dashboard/alertas': return responder(mockAlertas(periodo));
    default:
      return throwError(() => new HttpErrorResponse({ status: 404, url: req.url, statusText: 'Sin mock' }));
  }
};
