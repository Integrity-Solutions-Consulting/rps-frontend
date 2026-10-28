import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';
import { esApiResponse } from '../models/api-response';

/** Convierte ApiResponse<T> en T para que servicios y componentes trabajen con los datos. */
export const apiResponseInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    map((event) => {
      if (event instanceof HttpResponse && esApiResponse(event.body)) {
        return event.clone({ body: event.body.data });
      }
      return event;
    }),
  );
