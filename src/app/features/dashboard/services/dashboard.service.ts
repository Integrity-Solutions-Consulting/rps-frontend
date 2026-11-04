import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BackendRps } from '../../../core/backend/backend-rps.service';
import { IntegracionTmrService } from '../../integracion-tmr/services/integracion-tmr.service';
import { AlertaDashboard, DashboardResumen, Periodo, VencimientoContrato } from '../models/dashboard.models';

/** Llamadas al slice Features/Dashboard del backend. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly tmr = inject(IntegracionTmrService);
  private readonly base = `${environment.apiUrl}/dashboard`;

  /** GET /api/dashboard/resumen?periodo=2026-11 */
  resumen(periodo: Periodo): Observable<DashboardResumen> {
    const resumen = this.http.get<DashboardResumen>(`${this.base}/resumen`, { params: this.params(periodo) });
    if (!this.tmr.conBackend) return resumen;
    // El resumen sigue de ejemplo, pero el estado de TMR ya es real (RC 05, RN 50):
    // GET /api/integracion-tmr/estado y GET /api/integracion-tmr/cambios?revisado=false.
    return forkJoin({
      r: resumen,
      estado: this.tmr.estado().pipe(catchError(() => of(null))),
      cambios: this.tmr.cambiosSinRevisar().pipe(catchError(() => of(0))),
    }).pipe(map(({ r, estado, cambios }) => ({
      ...r,
      avisosTmrPendientes: cambios,
      origenTmr: {
        disponible: !!estado && !!estado.ultimaSincronizacion && !estado.desactualizada,
        ultimaConsulta: estado?.ultimaSincronizacion ?? null,
      },
    })));
  }

  /**
   * GET /api/dashboard/vencimientos · contratos por vencer (30 días) y vencidos con asignación activa (RN 13 a 15).
   * La regla vive en el backend (VencimientosContratosService); los nombres ya vienen de la copia de TMR.
   */
  vencimientos(_periodo: Periodo): Observable<VencimientoContrato[]> {
    if (this.be.usaMock('/dashboard/vencimientos')) return this.http.get<VencimientoContrato[]>(`${this.base}/vencimientos`);
    return this.http.get<BeVencimientoContrato[]>(`${this.base}/vencimientos`).pipe(
      map((lista) => lista.map((v): VencimientoContrato => ({
        contratoId: v.contratoId,
        colaboradorId: v.colaboradorId,
        tmrColaboradorId: v.tmrColaboradorId,
        colaborador: `${v.nombres ?? ''} ${v.apellidos ?? ''}`.trim() || `ID TMR ${v.tmrColaboradorId}`,
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
  nombres: string | null;
  apellidos: string | null;
  proyectoId: string;
  proyectoNombre: string;
  fechaFinVigente: string;
  diasRestantes: number;
  asignacionActiva: boolean;
}
