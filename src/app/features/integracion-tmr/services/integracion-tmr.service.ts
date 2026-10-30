import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TmrColaborador, TmrColaboradorDetalle } from '../models/tmr.models';
import { BackendRps } from '../../../core/backend/backend-rps.service';
import { BeAsignacion } from '../../../core/backend/backend-rps.models';

/**
 * Datos de la persona y sus proyectos.
 *   - Nombre, identificación, correo: /api/integracion-tmr (copia de TMR; hoy datos de ejemplo de core/mocks/tmr.mock.ts).
 *   - Proyectos asignados: con el backend real salen de rps-backend (/api/colaboradores/{id}/asignaciones,
 *     cargados a mano en RPS hasta que TMR los envíe); con npm start, de core/mocks/tmr.mock.ts.
 */
@Injectable({ providedIn: 'root' })
export class IntegracionTmrService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/integracion-tmr`;

  /** GET /api/integracion-tmr/colaboradores · nombres e identificación para las listas */
  colaboradores(): Observable<TmrColaborador[]> {
    return this.http.get<TmrColaborador[]>(`${this.base}/colaboradores`);
  }

  /** Datos generales + proyectos de una persona, por su ID de TMR. */
  colaborador(tmrColaboradorId: string): Observable<TmrColaboradorDetalle> {
    const persona = this.http.get<TmrColaboradorDetalle>(`${this.base}/colaboradores/${encodeURIComponent(tmrColaboradorId)}`);
    if (this.be.usaMock('/colaboradores')) return persona;

    // Backend real: la persona puede no estar en la copia de TMR de ejemplo; los proyectos vienen de RPS.
    const sinDatos: TmrColaboradorDetalle = {
      tmrColaboradorId, nombres: `ID TMR ${tmrColaboradorId}`, apellidos: '', identificacion: '', correo: null,
      activo: true, ultimaSincronizacion: new Date().toISOString(), asignaciones: [],
    };
    return forkJoin({
      p: persona.pipe(catchError(() => of(sinDatos))),
      asignaciones: this.be.idRps(tmrColaboradorId).pipe(
        switchMap((id) => this.http.get<BeAsignacion[]>(`${this.be.api}/colaboradores/${id}/asignaciones`)),
        catchError(() => of<BeAsignacion[]>([])),
      ),
    }).pipe(map(({ p, asignaciones }) => ({
      ...p,
      asignaciones: asignaciones.map((a) => ({
        tmrAsignacionId: a.id, tmrProyectoId: a.proyectoId, proyecto: a.proyectoNombre, cliente: null,
        fechaAsignacion: a.fechaInicio, fechaFinAsignacion: a.fechaSalida,
      })),
    })));
  }
}
