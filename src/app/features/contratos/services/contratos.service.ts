import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AsignacionDisponible, ContratoDetalle, ContratoResumen, EstadoContrato, RegistrarAdendaRequest,
  RegistrarContratoRequest, ResumenContratos,
} from '../models/contrato.models';

/** Llamadas a /api/contratos (endpoint propuesto; hoy responde el mock). */
@Injectable({ providedIn: 'root' })
export class ContratosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/contratos`;

  /** GET /api/contratos?estado=Vencido&tmrColaboradorId=1 · ambos filtros son opcionales */
  listar(estado: EstadoContrato | null, tmrColaboradorId: string | null = null): Observable<ContratoResumen[]> {
    let params = new HttpParams();
    if (estado) params = params.set('estado', estado);
    if (tmrColaboradorId) params = params.set('tmrColaboradorId', tmrColaboradorId);
    return this.http.get<ContratoResumen[]>(this.base, { params });
  }

  /** GET /api/contratos/resumen · contadores para las tarjetas */
  resumen(): Observable<ResumenContratos> {
    return this.http.get<ResumenContratos>(`${this.base}/resumen`);
  }

  /** GET /api/contratos/{id} */
  obtener(id: string): Observable<ContratoDetalle> {
    return this.http.get<ContratoDetalle>(`${this.base}/${id}`);
  }

  /** POST /api/contratos */
  registrar(request: RegistrarContratoRequest): Observable<ContratoDetalle> {
    return this.http.post<ContratoDetalle>(this.base, request);
  }

  /** POST /api/contratos/{id}/adendas · extiende la fecha de fin vigente (RN 10–12) */
  registrarAdenda(id: string, request: RegistrarAdendaRequest): Observable<ContratoDetalle> {
    return this.http.post<ContratoDetalle>(`${this.base}/${id}/adendas`, request);
  }

  /** GET /api/integracion-tmr/asignaciones · combinaciones colaborador + proyecto de la copia de TMR */
  asignacionesDisponibles(): Observable<AsignacionDisponible[]> {
    return this.http.get<AsignacionDisponible[]>(`${environment.apiUrl}/integracion-tmr/asignaciones`);
  }
}
