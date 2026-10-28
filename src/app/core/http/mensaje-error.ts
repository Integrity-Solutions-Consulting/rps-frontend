import { HttpErrorResponse } from '@angular/common/http';
import { esApiResponse } from '../models/api-response';

/** Traduce un error HTTP a un mensaje que Contabilidad pueda entender. */
export function mensajeError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return 'Ocurrió un error inesperado.';

  if (esApiResponse(error.error) && error.error.message) return error.error.message;

  switch (error.status) {
    case 0:
      return 'No se pudo conectar con el backend de RPS. Verifica que esté corriendo en http://localhost:5203.';
    case 401:
      return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    case 403:
      return 'No tienes permiso para ver esta información.';
    case 404:
      return `El backend todavía no tiene este endpoint (${error.url ?? 'sin URL'}).`;
    case 503:
      return 'No se pudo verificar la información de TMR. No se asumen valores en cero.';
    default:
      return error.status >= 500
        ? 'El backend respondió con un error. Revisa el log del servidor.'
        : `La petición no se pudo completar (HTTP ${error.status}).`;
  }
}
