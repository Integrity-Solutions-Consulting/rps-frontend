import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TmrColaborador, TmrColaboradorDetalle } from '../models/tmr.models';

/**
 * Lectura de la copia de TMR que mantiene el backend (módulo Integración TMR).
 * Endpoints propuestos; hoy responden los datos de ejemplo de core/mocks/tmr.mock.ts.
 */
@Injectable({ providedIn: 'root' })
export class IntegracionTmrService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/integracion-tmr`;

  /** GET /api/integracion-tmr/colaboradores · nombres e identificación para las listas */
  colaboradores(): Observable<TmrColaborador[]> {
    return this.http.get<TmrColaborador[]>(`${this.base}/colaboradores`);
  }

  /** GET /api/integracion-tmr/colaboradores/{tmrColaboradorId} · datos generales y asignaciones */
  colaborador(tmrColaboradorId: string): Observable<TmrColaboradorDetalle> {
    return this.http.get<TmrColaboradorDetalle>(`${this.base}/colaboradores/${encodeURIComponent(tmrColaboradorId)}`);
  }
}
