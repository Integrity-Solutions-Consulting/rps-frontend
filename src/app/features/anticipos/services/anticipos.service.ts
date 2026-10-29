import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Anticipo, RegistrarAnticipoRequest, ResumenAnticipos } from '../models/anticipo.models';

/** Llamadas a /api/anticipos (endpoint propuesto; hoy responde el mock). */
@Injectable({ providedIn: 'root' })
export class AnticiposService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/anticipos`;

  /** GET /api/anticipos/resumen?colaboradorId=&periodo= · neto de referencia, saldo, límite y cortes */
  resumen(colaboradorId: string, periodo: string): Observable<ResumenAnticipos> {
    const params = new HttpParams().set('colaboradorId', colaboradorId).set('periodo', periodo);
    return this.http.get<ResumenAnticipos>(`${this.base}/resumen`, { params });
  }

  /** GET /api/anticipos?colaboradorId= · anticipos del colaborador, del más reciente al más antiguo */
  listar(colaboradorId: string): Observable<Anticipo[]> {
    return this.http.get<Anticipo[]>(this.base, { params: new HttpParams().set('colaboradorId', colaboradorId) });
  }

  /** POST /api/anticipos · valida límite, cortes y que las cuotas sumen el monto */
  registrar(request: RegistrarAnticipoRequest): Observable<Anticipo> {
    return this.http.post<Anticipo>(this.base, request);
  }
}
