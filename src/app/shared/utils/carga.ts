import { OperatorFunction, filter, scan } from 'rxjs';

/** Lo mínimo que tiene el estado de una carga: 'cargando' | 'ok' (con datos) | 'error'. */
interface ConEstado { estado: string }

/**
 * Al cambiar un filtro (o pulsar Actualizar) no se vuelve a 'cargando' si ya había datos: se
 * mantienen los anteriores con `actualizando: true` hasta que llega la respuesta nueva. Así la
 * pantalla no se vacía ni "se recarga entera"; solo la primera carga muestra el esqueleto.
 * Se pone justo después del switchMap que hace la petición.
 */
export function conservarDatosAlRecargar<C extends ConEstado>(): OperatorFunction<C, C> {
  return (fuente) =>
    fuente.pipe(
      scan<C, C | null>(
        (anterior, actual) =>
          actual.estado === 'cargando' && anterior?.estado === 'ok'
            ? ({ ...anterior, actualizando: true } as C)
            : actual,
        null,
      ),
      filter((c): c is C => c !== null),
    );
}

/** true si el estado viene de conservarDatosAlRecargar y hay una petición nueva en curso. */
export function estaActualizando(c: ConEstado): boolean {
  return (c as { actualizando?: boolean }).actualizando === true;
}
