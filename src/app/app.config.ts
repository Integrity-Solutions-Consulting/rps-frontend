import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsEc from '@angular/common/locales/es-EC';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { mockApiInterceptor } from './core/interceptors/mock-api.interceptor';
import { authTokenInterceptor } from './core/interceptors/auth-token.interceptor';
import { apiResponseInterceptor } from './core/interceptors/api-response.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

registerLocaleData(localeEsEc);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'es-EC' },
    // Orden de ejecución en la petición: error → token → desempaquetar ApiResponse → mock.
    // El mock va al final para que la respuesta simulada pase por los mismos interceptores
    // que la del backend real.
    provideHttpClient(
      withInterceptors([errorInterceptor, authTokenInterceptor, apiResponseInterceptor, mockApiInterceptor]),
    ),
  ],
};
