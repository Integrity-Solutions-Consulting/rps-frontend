import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { IndicadoresDashboard, Periodo, VencimientoContrato } from '../models/dashboard.models';
import { diaUno } from '../../../core/backend/backend-rps.service';

/** Llamadas al slice Features/Dashboard de rps-backend. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/dashboard`;

  /**
   * GET /api/dashboard?periodo=2026-11-01 · colaboradores, honorarios, liquidaciones, anticipos y
   * contratos por vencer. El período filtra solo honorarios y liquidaciones (así lo hace el backend).
   */
  indicadores(periodo: Periodo): Observable<IndicadoresDashboard> {
    return this.http.get<IndicadoresDashboard>(this.base, { params: new HttpParams().set('periodo', diaUno(periodo)) });
  }

  /** GET /api/dashboard/vencimientos · por vencer en 30 días y vencidos con asignación activa (RN 13 a 15). */
  vencimientos(): Observable<VencimientoContrato[]> {
    return this.http.get<BeVencimientoContrato[]>(`${this.base}/vencimientos`).pipe(
      map((lista) => lista.map((v): VencimientoContrato => ({
        contratoId: v.contratoId,
        colaboradorId: v.colaboradorId,
        tmrColaboradorId: v.tmrColaboradorId,
        colaborador: `${v.nombres ?? ''} ${v.apellidos ?? ''}`.trim() || `ID TMR ${v.tmrColaboradorId}`,
        proyectoId: v.proyectoId,
        proyecto: v.proyectoNombre || 'Proyecto sin nombre',
        fechaFinVigente: v.fechaFinVigente,
        diasRestantes: v.diasRestantes,
        asignacionActiva: v.asignacionActiva,
      }))),
    );
  }
}

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
