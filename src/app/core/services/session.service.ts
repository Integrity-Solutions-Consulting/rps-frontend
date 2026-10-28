import { Injectable, computed, signal } from '@angular/core';

export interface UsuarioSesion {
  nombre: string;
  iniciales: string;
  area: string;
}

/**
 * Sesión y permisos. RPS todavía no tiene autenticación en el backend, así que la sesión
 * es fija. Cuando exista el login, aquí se guardan el usuario y el JWT (RC 01: solo
 * usuarios autorizados de Contabilidad).
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly usuario = signal<UsuarioSesion>({ nombre: 'Contabilidad CP', iniciales: 'CP', area: 'Contabilidad' });
  readonly token = signal<string | null>(null);
  readonly autenticado = computed(() => this.usuario() !== null);
}
