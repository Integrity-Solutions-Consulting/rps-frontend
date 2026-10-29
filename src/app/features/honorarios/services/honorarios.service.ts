import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { HonorarioProyecto, HonorarioVigencia, ProgramarHonorarioRequest } from '../models/honorario.models';

/** Llamadas a /api/honorarios (endpoint propuesto; hoy responde el mock). */
@Injectable({ providedIn: 'root' })
export class HonorariosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/honorarios`;

  /** GET /api/honorarios?tmrColaboradorId=1 · un registro por proyecto asignado en TMR */
  porColaborador(tmrColaboradorId: string): Observable<HonorarioProyecto[]> {
    return this.http.get<HonorarioProyecto[]>(this.base, { params: new HttpParams().set('tmrColaboradorId', tmrColaboradorId) });
  }

  /** POST /api/honorarios · registra o programa un honorario desde un mes (RN 19) */
  programar(request: ProgramarHonorarioRequest): Observable<HonorarioVigencia> {
    return this.http.post<HonorarioVigencia>(this.base, request);
  }

  /** DELETE /api/honorarios/{id} · solo vigencias de meses que aún no empiezan */
  cancelarProgramado(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
