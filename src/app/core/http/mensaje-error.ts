import { leerErrorApi } from './error-api';

/** Traduce un error HTTP a un mensaje que Contabilidad pueda entender. */
export function mensajeError(error: unknown): string {
  return leerErrorApi(error).mensaje;
}
