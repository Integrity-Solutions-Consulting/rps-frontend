import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BackendRps } from '../../../core/backend/backend-rps.service';
import { AlertaDashboard, DashboardResumen, Periodo, VencimientoContrato } from '../models/dashboard.models';

/** Llamadas al slice Features/Dashboard del backend. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/dashboard`;

  /** GET /api/dashboard/resumen?periodo=2026-11 */
  resumen(periodo: Periodo): Observable<DashboardResumen> {
    return this.http.get<DashboardResumen>(`${this.base}/resumen`, { params: this.params(periodo) });
  }

  /**
   * GET /api/dashboard/vencimientos · contratos por vencer (30 días) y vencidos con asignación activa (RN 13 a 15).
   * La regla vive en el backend (VencimientosContratosService); aquí solo se completa el nombre de TMR.
   */
  vencimientos(_periodo: Periodo): Observable<VencimientoContrato[]> {
    if (this.be.usaMock('/dashboard/vencimientos')) return this.http.get<VencimientoContrato[]>(`${this.base}/vencimientos`);
    return forkJoin([
      this.http.get<BeVencimientoContrato[]>(`${this.base}/vencimientos`),
      this.be.nombres(),
    ]).pipe(
      map(([lista, nombres]) => lista.map((v): VencimientoContrato => ({
        contratoId: v.contratoId,
        colaboradorId: v.colaboradorId,
        tmrColaboradorId: v.tmrColaboradorId,
        colaborador: this.be.nombreDe(nombres, v.tmrColaboradorId),
        proyecto: v.proyectoNombre || 'Proyecto sin nombre',
        fechaFinVigente: v.fechaFinVigente,
        diasRestantes: v.diasRestantes,
        asignacionActiva: v.asignacionActiva,
      }))),
    );
  }

  /** GET /api/dashboard/alertas?periodo=2026-11 */
  alertas(periodo: Periodo): Observable<AlertaDashboard[]> {
    return this.http.get<AlertaDashboard[]>(`${this.base}/alertas`, { params: this.params(periodo) });
  }

  private params(periodo: Periodo): HttpParams {
    return new HttpParams().set('periodo', periodo);
  }
}

// ── Conversión desde rps-backend ──
/** Respuesta tal como la manda VencimientoContratoResponse del backend. */
interface BeVencimientoContrato {
  contratoId: string;
  colaboradorId: string;
  tmrColaboradorId: string;
  proyectoId: string;
  proyectoNombre: string;
  fechaFinVigente: string;
  diasRestantes: number;
  asignacionActiva: boolean;
}
