import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TmrColaborador, TmrColaboradorDetalle } from '../models/tmr.models';
import { BackendRps, aTmrColaborador } from '../../../core/backend/backend-rps.service';
import { BeAsignacion, BeColaborador, BeEstadoTmr, BeSincronizacionTmr } from '../../../core/backend/backend-rps.models';

/**
 * Datos de TMR que usa RPS (solo lectura, RN 01).
 *   - Backend real: rps-backend copia TMR en sus tablas con la sincronización (Features/IntegracionTmr).
 *     Nombre, identificación y correo vienen en GET /api/colaboradores; los proyectos en
 *     GET /api/colaboradores/{id}/asignaciones. Sincronizar: POST /api/integracion-tmr/sincronizar.
 *   - npm start: core/mocks/tmr.mock.ts (/integracion-tmr/colaboradores y /colaboradores/{id}).
 */
@Injectable({ providedIn: 'root' })
export class IntegracionTmrService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/integracion-tmr`;

  /** true con el backend real: los datos de TMR ya están en rps-backend (no hay "vincular" a mano). */
  get conBackend(): boolean {
    return !this.be.usaMock('/integracion-tmr');
  }

  /** Personas de TMR con nombre e identificación, para las listas. */
  colaboradores(): Observable<TmrColaborador[]> {
    if (this.conBackend) return this.be.colaboradores().pipe(map((l) => l.map(aTmrColaborador)));
    return this.http.get<TmrColaborador[]>(`${this.base}/colaboradores`);
  }

  /** Datos generales + proyectos de una persona, por su ID de TMR. */
  colaborador(tmrColaboradorId: string): Observable<TmrColaboradorDetalle> {
    if (!this.conBackend)
      return this.http.get<TmrColaboradorDetalle>(`${this.base}/colaboradores/${encodeURIComponent(tmrColaboradorId)}`);

    return this.be.colaboradores().pipe(
      switchMap((lista) => {
        const c = lista.find((x) => x.tmrColaboradorId === tmrColaboradorId);
        if (!c) return this.be.error(404, 'Colaborador.NoVinculado', 'La persona no está en RPS.');
        return this.http.get<BeAsignacion[]>(`${this.be.api}/colaboradores/${c.id}/asignaciones`).pipe(
          catchError(() => of<BeAsignacion[]>([])),
          map((asignaciones) => this.detalle(c, asignaciones)),
        );
      }),
    );
  }

  /** POST /api/integracion-tmr/sincronizar · copia ahora colaboradores, proyectos y asignaciones de TMR. */
  sincronizar(): Observable<BeSincronizacionTmr> {
    return this.http.post<BeSincronizacionTmr>(`${this.base}/sincronizar`, null);
  }

  /** GET /api/integracion-tmr/estado · última sincronización y si está desactualizada (RC 05). */
  estado(): Observable<BeEstadoTmr> {
    return this.http.get<BeEstadoTmr>(`${this.base}/estado`);
  }

  /** GET /api/integracion-tmr/cambios?revisado=false · cuántos cambios de TMR faltan revisar (RN 50). */
  cambiosSinRevisar(): Observable<number> {
    return this.http.get<unknown[]>(`${this.base}/cambios`, { params: { revisado: 'false' } }).pipe(map((l) => l.length));
  }

  private detalle(c: BeColaborador, asignaciones: BeAsignacion[]): TmrColaboradorDetalle {
    return {
      ...aTmrColaborador(c),
      nombres: c.nombres || `ID TMR ${c.tmrColaboradorId}`,
      // Las asignaciones que ya no vienen de TMR no cuentan para cálculos nuevos (RN 22).
      asignaciones: asignaciones.filter((a) => !a.eliminadaEnOrigen).map((a) => ({
        tmrAsignacionId: a.id, tmrProyectoId: a.proyectoId, proyecto: a.proyectoNombre, cliente: null,
        fechaAsignacion: a.fechaInicio, fechaFinAsignacion: a.fechaSalida,
      })),
    };
  }
}
