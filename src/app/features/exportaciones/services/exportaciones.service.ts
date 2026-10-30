import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TipoCorte } from '../../../shared/models/corte';
import { Exportacion, GenerarExportacionRequest, PreparacionExportacion } from '../models/exportacion.models';
import { BackendRps } from '../../../core/backend/backend-rps.service';

/**
 * Archivo de pago por mes y corte, con versiones.
 * Mismas rutas en core/mocks (npm start) y en rps-backend (Features/Exportaciones/ExportacionesPago*.cs).
 * El backend aún no conoce nombres: manda el ID de TMR y aquí se reemplaza por el nombre.
 */
@Injectable({ providedIn: 'root' })
export class ExportacionesService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/exportaciones`;

  /** GET /api/exportaciones/preparacion?periodo=&corte= · valores y advertencias antes de generar (RN 53) */
  preparar(periodo: string, corte: TipoCorte): Observable<PreparacionExportacion> {
    const params = new HttpParams().set('periodo', periodo).set('corte', corte);
    return forkJoin({ p: this.http.get<PreparacionExportacion>(`${this.base}/preparacion`, { params }), nombres: this.be.nombres() }).pipe(
      map(({ p, nombres }) => ({ ...p, candidatos: p.candidatos.map((c) => ({ ...c, colaborador: this.nombre(nombres, c.tmrColaboradorId, c.colaborador) })) })));
  }

  /** GET /api/exportaciones?periodo= · versiones generadas (sin período: todas) */
  listar(periodo: string | null): Observable<Exportacion[]> {
    const params = periodo ? new HttpParams().set('periodo', periodo) : undefined;
    return forkJoin({ l: this.http.get<Exportacion[]>(this.base, { params }), nombres: this.be.nombres() }).pipe(
      map(({ l, nombres }) => l.map((e) => ({ ...e, filas: e.filas.map((f) => ({ ...f, colaborador: this.nombre(nombres, f.tmrColaboradorId, f.colaborador) })) }))));
  }

  /** POST /api/exportaciones · genera una versión nueva y guarda el archivo (RN 55) */
  generar(request: GenerarExportacionRequest): Observable<Exportacion> {
    return this.http.post<Exportacion>(this.base, request);
  }

  private nombre(nombres: Map<string, { nombres: string; apellidos: string }>, tmrId: string | undefined, actual: string): string {
    const p = tmrId ? nombres.get(tmrId) : undefined;
    return p ? `${p.nombres} ${p.apellidos}`.trim() : actual;
  }

  /** GET /api/exportaciones/{id}/archivo · descarga otra vez el mismo archivo, sin generar otra versión */
  descargar(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/archivo`, { responseType: 'blob' });
  }
}
