import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AlertaDashboard, DashboardResumen, Periodo, VencimientoContrato } from '../models/dashboard.models';

/** Llamadas al slice Features/Dashboard del backend. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/dashboard`;

  /** GET /api/dashboard/resumen?periodo=2026-11 */
  resumen(periodo: Periodo): Observable<DashboardResumen> {
    return this.http.get<DashboardResumen>(`${this.base}/resumen`, { params: this.params(periodo) });
  }

  /** GET /api/dashboard/vencimientos?periodo=2026-11 · contratos dentro del mayor umbral de alerta y vencidos */
  vencimientos(periodo: Periodo): Observable<VencimientoContrato[]> {
    return this.http.get<VencimientoContrato[]>(`${this.base}/vencimientos`, { params: this.params(periodo) });
  }

  /** GET /api/dashboard/alertas?periodo=2026-11 */
  alertas(periodo: Periodo): Observable<AlertaDashboard[]> {
    return this.http.get<AlertaDashboard[]>(`${this.base}/alertas`, { params: this.params(periodo) });
  }

  private params(periodo: Periodo): HttpParams {
    return new HttpParams().set('periodo', periodo);
  }
}
