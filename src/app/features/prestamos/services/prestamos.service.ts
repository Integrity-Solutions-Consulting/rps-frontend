import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ActualizarPrestamo, CrearPrestamo, Prestamo, ResumenPrestamos } from '../models/prestamo.models';
import { BackendRps } from '../../../core/backend/backend-rps.service';

/** Llamadas a /api/colaboradores/{id}/prestamos (Features/Prestamos de rps-backend). */
@Injectable({ providedIn: 'root' })
export class PrestamosService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);

  private base(colaboradorId: string): string {
    return `${this.be.api}/colaboradores/${colaboradorId}/prestamos`;
  }

  /** GET .../prestamos/resumen */
  resumen(colaboradorId: string): Observable<ResumenPrestamos> {
    return this.http.get<ResumenPrestamos>(`${this.base(colaboradorId)}/resumen`);
  }

  /** GET .../prestamos (del más reciente al más antiguo). */
  listar(colaboradorId: string): Observable<Prestamo[]> {
    return this.http.get<Prestamo[]>(this.base(colaboradorId));
  }

  /** POST .../prestamos */
  registrar(colaboradorId: string, datos: CrearPrestamo): Observable<Prestamo> {
    return this.http.post<Prestamo>(this.base(colaboradorId), datos);
  }

  /** PUT .../prestamos/{id} · reemplaza monto, observaciones y plan. */
  actualizar(colaboradorId: string, prestamoId: string, datos: ActualizarPrestamo): Observable<Prestamo> {
    return this.http.put<Prestamo>(`${this.base(colaboradorId)}/${prestamoId}`, datos);
  }

  /** DELETE .../prestamos/{id} · solo si todavía no empezó a cobrarse. */
  eliminar(colaboradorId: string, prestamoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(colaboradorId)}/${prestamoId}`);
  }
}
