import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { LiquidacionDetalle, LiquidacionResumen, LiquidacionesPeriodo } from '../models/liquidacion.models';

/** Llamadas a /api/liquidaciones (endpoint propuesto; hoy responde el mock). */
@Injectable({ providedIn: 'root' })
export class LiquidacionesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/liquidaciones`;

  /** GET /api/liquidaciones?periodo=2026-11 · lo último calculado del mes */
  listar(periodo: string): Observable<LiquidacionesPeriodo> {
    return this.http.get<LiquidacionesPeriodo>(this.base, { params: new HttpParams().set('periodo', periodo) });
  }

  /** POST /api/liquidaciones/calcular · calcula o recalcula el mes; guarda una versión nueva solo si algo cambió */
  calcular(periodo: string): Observable<LiquidacionesPeriodo> {
    return this.http.post<LiquidacionesPeriodo>(`${this.base}/calcular`, { periodo });
  }

  /** GET /api/liquidaciones/{id} · desglose por proyecto, impuestos y cortes */
  obtener(id: string): Observable<LiquidacionDetalle> {
    return this.http.get<LiquidacionDetalle>(`${this.base}/${id}`);
  }

  /** PUT /api/liquidaciones/{id}/revisado · casilla "Revisado para envío" (RN 49) */
  marcarRevisado(id: string, revisado: boolean): Observable<LiquidacionResumen> {
    return this.http.put<LiquidacionResumen>(`${this.base}/${id}/revisado`, { revisado });
  }
}
