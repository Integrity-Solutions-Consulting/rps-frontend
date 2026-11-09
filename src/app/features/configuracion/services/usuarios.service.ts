import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { leerErrorApi } from '../../../core/http/error-api';
import { ROL_ADMINISTRADOR, ROL_ADMINISTRADOR_CONTABLE, RolSistema, UsuarioSistema } from '../models/accesos.models';

/** UsuarioAdminResponse de rps-backend (GET /api/usuarios). */
interface UsuarioAdminApi {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  creadoEn: string;
  roles: string[];
}

export interface CrearUsuarioRequest {
  email: string;
  nombre: string;
  password: string;
  rol: RolSistema;
}

/**
 * Usuarios de RPS. Las reglas viven en rps-backend:
 *  - GET   /api/usuarios               lista (Administrador y Administrador Contable)
 *  - PATCH /api/usuarios/{id}/estado   activar/desactivar (valida quién puede tocar a quién)
 *  - PUT   /api/usuarios/{id}/rol      cambiar rol (solo Administrador)
 *  - POST  /api/auth/register          crear usuario (solo Administrador)
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/usuarios`;

  private readonly datos = signal<UsuarioSistema[]>([]);

  readonly usuarios = computed(() => this.datos());
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.http.get<UsuarioAdminApi[]>(this.base).subscribe({
      next: (lista) => { this.datos.set(lista.map(convertir)); this.cargando.set(false); },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }

  cambiarEstado(id: string, activo: boolean): Observable<UsuarioSistema> {
    return this.http.patch<UsuarioAdminApi>(`${this.base}/${id}/estado`, { activo }).pipe(
      map(convertir),
      tap((u) => this.datos.update((lista) => lista.map((x) => (x.id === u.id ? u : x)))),
    );
  }

  cambiarRol(id: string, rol: RolSistema): Observable<UsuarioSistema> {
    return this.http.put<UsuarioAdminApi>(`${this.base}/${id}/rol`, { rol }).pipe(
      map(convertir),
      tap((u) => this.datos.update((lista) => lista.map((x) => (x.id === u.id ? u : x)))),
    );
  }

  crear(request: CrearUsuarioRequest): Observable<void> {
    return this.http.post<unknown>(`${environment.apiUrl}/auth/register`, request).pipe(
      tap(() => this.cargar()),
      map(() => undefined),
    );
  }
}

/** Rol principal: el de mayor nivel; si no tiene uno inicial, el primero. */
function convertir(u: UsuarioAdminApi): UsuarioSistema {
  const rol = [ROL_ADMINISTRADOR, ROL_ADMINISTRADOR_CONTABLE].find((r) => u.roles.includes(r)) ?? u.roles[0] ?? 'Sin rol activo';
  return { id: u.id, nombre: u.nombre, email: u.email, rol, activo: u.activo, creadoEn: u.creadoEn };
}
