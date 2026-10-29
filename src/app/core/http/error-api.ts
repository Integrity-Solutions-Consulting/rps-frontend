import { HttpErrorResponse } from '@angular/common/http';
import { esApiResponse } from '../models/api-response';

/**
 * Error leído de la respuesta del backend. RPS responde los errores como ProblemDetails:
 *   404/409: { title, status, detail, codigo }
 *   400:     { title, status, errors: { campo: [mensaje] }, codigo }
 * `codigo` es estable (ej. "Colaborador.Desactivado"), así el frontend no depende del texto.
 */
export interface ErrorApi {
  status: number;
  mensaje: string;
  codigo: string | null;
  /** Mensajes por campo del formulario (errores de validación 400). */
  campos: Record<string, string>;
}

export function leerErrorApi(error: unknown): ErrorApi {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, mensaje: 'Ocurrió un error inesperado.', codigo: null, campos: {} };
  }

  const body: unknown = error.error;
  const campos: Record<string, string> = {};
  let codigo: string | null = null;
  let mensaje: string | null = null;

  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b['codigo'] === 'string') codigo = b['codigo'];

    const errores = b['errors'];
    if (errores && typeof errores === 'object') {
      for (const [campo, lista] of Object.entries(errores as Record<string, unknown>)) {
        const primero = Array.isArray(lista) ? lista[0] : lista;
        if (typeof primero === 'string') campos[normalizarCampo(campo)] = primero;
      }
    }

    if (typeof b['detail'] === 'string') mensaje = b['detail'];
    else if (esApiResponse(body) && body.message) mensaje = body.message;
    else if (Object.keys(campos).length > 0) mensaje = Object.values(campos)[0];
  }

  return { status: error.status, mensaje: mensaje ?? mensajePorEstado(error), codigo, campos };
}

/** "NumeroCuenta" o "numeroCuenta" → "numeroCuenta", para comparar con los nombres del formulario. */
function normalizarCampo(campo: string): string {
  return campo.length > 0 ? campo.charAt(0).toLowerCase() + campo.slice(1) : campo;
}

function mensajePorEstado(error: HttpErrorResponse): string {
  switch (error.status) {
    case 0:
      return 'No se pudo conectar con el backend de RPS. Verifica que esté corriendo en http://localhost:5203.';
    case 401:
      return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    case 403:
      return 'No tienes permiso para ver esta información.';
    case 404:
      return 'No se encontró lo que buscabas, o el backend todavía no tiene este endpoint.';
    case 503:
      return 'No se pudo verificar la información de TMR. No se asumen valores en cero.';
    default:
      return error.status >= 500
        ? 'El backend respondió con un error. Revisa el log del servidor.'
        : `La petición no se pudo completar (HTTP ${error.status}).`;
  }
}
