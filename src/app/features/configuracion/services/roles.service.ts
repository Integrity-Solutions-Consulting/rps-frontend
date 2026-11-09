import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { leerErrorApi } from '../../../core/http/error-api';
import { ModuloPermiso, RolSistemaDetalle } from '../models/accesos.models';

/**
 * Roles de RPS. Las reglas viven en rps-backend (RolesService):
 *  - GET   /api/roles                 roles que el usuario en sesión puede administrar
 *  - GET   /api/roles/asignables      roles activos para crear usuarios
 *  - POST  /api/roles                 crear rol (solo Administrador)
 *  - PUT   /api/roles/{id}/permisos   guardar permisos
 *  - PATCH /api/roles/{id}/estado     activar/desactivar
 */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/roles`;

  readonly roles = signal<RolSistemaDetalle[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.http.get<RolSistemaDetalle[]>(this.base).subscribe({
      next: (lista) => { this.roles.set(lista); this.cargando.set(false); },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }

  asignables(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/asignables`);
  }

  crear(nombre: string, permisos: ModuloPermiso[]): Observable<RolSistemaDetalle> {
    return this.http.post<RolSistemaDetalle>(this.base, { nombre, permisos }).pipe(
      tap((r) => this.roles.update((lista) => [...lista, r].sort((a, b) => a.nombre.localeCompare(b.nombre)))),
    );
  }

  actualizarPermisos(id: string, permisos: ModuloPermiso[]): Observable<RolSistemaDetalle> {
    return this.http.put<RolSistemaDetalle>(`${this.base}/${id}/permisos`, { permisos }).pipe(tap((r) => this.reemplazar(r)));
  }

  cambiarEstado(id: string, activo: boolean): Observable<RolSistemaDetalle> {
    return this.http.patch<RolSistemaDetalle>(`${this.base}/${id}/estado`, { activo }).pipe(tap((r) => this.reemplazar(r)));
  }

  private reemplazar(r: RolSistemaDetalle): void {
    this.roles.update((lista) => lista.map((x) => (x.id === r.id ? r : x)));
  }
}
