import { Injectable, signal } from '@angular/core';

export interface Aviso {
  id: number;
  tipo: 'error' | 'ok' | 'info';
  mensaje: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private siguienteId = 1;
  readonly avisos = signal<Aviso[]>([]);

  error(mensaje: string): void { this.agregar('error', mensaje); }
  ok(mensaje: string): void { this.agregar('ok', mensaje); }
  info(mensaje: string): void { this.agregar('info', mensaje); }

  cerrar(id: number): void {
    this.avisos.update((lista) => lista.filter((a) => a.id !== id));
  }

  private agregar(tipo: Aviso['tipo'], mensaje: string): void {
    // Evita repetir el mismo mensaje cuando fallan varias peticiones a la vez.
    if (this.avisos().some((a) => a.mensaje === mensaje)) return;
    const id = this.siguienteId++;
    this.avisos.update((lista) => [...lista, { id, tipo, mensaje }]);
    setTimeout(() => this.cerrar(id), 7000);
  }
}
