import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TmrColaborador, TmrColaboradorDetalle } from '../models/tmr.models';
import { BackendRps, aTmrColaborador } from '../../../core/backend/backend-rps.service';
import { BeAsignacion, BeCambioTmr, BeColaborador, BeEstadoTmr, BeSincronizacionTmr } from '../../../core/backend/backend-rps.models';

/**
 * Datos de TMR que usa RPS (solo lectura, RN 01). rps-backend copia TMR en sus tablas con la
 * sincronización (Features/IntegracionTmr):
 *   - nombre, identificación y correo: GET /api/colaboradores;
 *   - proyectos de la persona: GET /api/colaboradores/{id}/asignaciones;
 *   - sincronizar, estado y cambios detectados: /api/integracion-tmr.
 */
@Injectable({ providedIn: 'root' })
export class IntegracionTmrService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/integracion-tmr`;

  /** Personas de TMR con nombre e identificación, para las listas. */
  colaboradores(): Observable<TmrColaborador[]> {
    return this.be.colaboradores().pipe(map((l) => l.map(aTmrColaborador)));
  }

  /** Datos generales + proyectos de una persona, por su ID de TMR. */
  colaborador(tmrColaboradorId: string): Observable<TmrColaboradorDetalle> {
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

  /** GET /api/integracion-tmr/cambios?revisado=false · cambios detectados en TMR que Contabilidad no revisó (RN 50). */
  cambiosSinRevisar(): Observable<BeCambioTmr[]> {
    return this.http.get<BeCambioTmr[]>(`${this.base}/cambios`, { params: { revisado: 'false' } });
  }

  /** POST /api/integracion-tmr/cambios/{id}/revisar */
  marcarCambioRevisado(id: string): Observable<BeCambioTmr> {
    return this.http.post<BeCambioTmr>(`${this.base}/cambios/${id}/revisar`, null);
  }

  private detalle(c: BeColaborador, asignaciones: BeAsignacion[]): TmrColaboradorDetalle {
    return {
      ...aTmrColaborador(c),
      nombres: c.nombres || `ID TMR ${c.tmrColaboradorId}`,
      // El backend marca las asignaciones que ya no vienen de TMR; no se muestran como proyectos actuales (RN 22).
      asignaciones: asignaciones.filter((a) => !a.eliminadaEnOrigen).map((a) => ({
        tmrAsignacionId: a.id, tmrProyectoId: a.proyectoId, proyecto: a.proyectoNombre, cliente: null,
        fechaAsignacion: a.fechaInicio, fechaFinAsignacion: a.fechaSalida,
      })),
    };
  }
}
