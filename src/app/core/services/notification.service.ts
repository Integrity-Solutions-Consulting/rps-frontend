import { Injectable, signal } from '@angular/core';

/** Botón dentro del aviso, por ejemplo "Deshacer". */
export interface AccionAviso {
  texto: string;
  ejecutar: () => void;
}

export interface Aviso {
  id: number;
  tipo: 'error' | 'ok' | 'info';
  mensaje: string;
  accion: AccionAviso | null;
  /** Milisegundos que el aviso queda visible (la barra de tiempo usa este valor). */
  duracion: number;
}

const DURACION_NORMAL = 7000;
/** Con "Deshacer" se da más tiempo para reaccionar. */
const DURACION_CON_ACCION = 10000;

/**
 * Avisos breves en la esquina inferior derecha (los muestra core/layout/app-layout).
 *   avisos.ok('Guardado.')
 *   avisos.ok('Se canceló el cambio.', { texto: 'Deshacer', ejecutar: () => this.restaurar(id) })
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private siguienteId = 1;
  readonly avisos = signal<Aviso[]>([]);

  error(mensaje: string): void { this.agregar('error', mensaje, null); }
  ok(mensaje: string, accion: AccionAviso | null = null): void { this.agregar('ok', mensaje, accion); }
  info(mensaje: string, accion: AccionAviso | null = null): void { this.agregar('info', mensaje, accion); }

  cerrar(id: number): void {
    this.avisos.update((lista) => lista.filter((a) => a.id !== id));
  }

  /** Ejecuta la acción del aviso (por ejemplo, deshacer) y lo cierra para que no se pulse dos veces. */
  ejecutar(aviso: Aviso): void {
    this.cerrar(aviso.id);
    aviso.accion?.ejecutar();
  }

  private agregar(tipo: Aviso['tipo'], mensaje: string, accion: AccionAviso | null): void {
    // Evita repetir el mismo mensaje cuando fallan varias peticiones a la vez.
    if (this.avisos().some((a) => a.mensaje === mensaje)) return;
    const id = this.siguienteId++;
    const duracion = accion ? DURACION_CON_ACCION : DURACION_NORMAL;
    this.avisos.update((lista) => [...lista, { id, tipo, mensaje, accion, duracion }]);
    setTimeout(() => this.cerrar(id), duracion);
  }
}
