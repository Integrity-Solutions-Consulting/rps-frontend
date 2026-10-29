import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TipoCorte } from '../../../shared/models/corte';
import { Exportacion, GenerarExportacionRequest, PreparacionExportacion } from '../models/exportacion.models';

/** Llamadas a /api/exportaciones (endpoint propuesto; hoy responde el mock). */
@Injectable({ providedIn: 'root' })
export class ExportacionesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/exportaciones`;

  /** GET /api/exportaciones/preparacion?periodo=&corte= · valores y advertencias antes de generar (RN 53) */
  preparar(periodo: string, corte: TipoCorte): Observable<PreparacionExportacion> {
    const params = new HttpParams().set('periodo', periodo).set('corte', corte);
    return this.http.get<PreparacionExportacion>(`${this.base}/preparacion`, { params });
  }

  /** GET /api/exportaciones?periodo= · versiones generadas (sin período: todas) */
  listar(periodo: string | null): Observable<Exportacion[]> {
    const params = periodo ? new HttpParams().set('periodo', periodo) : undefined;
    return this.http.get<Exportacion[]>(this.base, { params });
  }

  /** POST /api/exportaciones · genera una versión nueva y guarda el archivo (RN 55) */
  generar(request: GenerarExportacionRequest): Observable<Exportacion> {
    return this.http.post<Exportacion>(this.base, request);
  }

  /** GET /api/exportaciones/{id}/archivo · descarga otra vez el mismo archivo, sin generar otra versión */
  descargar(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/archivo`, { responseType: 'blob' });
  }
}
