import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Anticipo, CuotaPlan, ResumenAnticipos } from '../models/anticipo.models';
import { BackendRps, diaUno } from '../../../core/backend/backend-rps.service';
import { BeAnticipo } from '../../../core/backend/backend-rps.models';
import { SessionService } from '../../../core/services/session.service';

/** Llamadas a /api/colaboradores/{id}/anticipos (Features/Anticipos de rps-backend). */
@Injectable({ providedIn: 'root' })
export class AnticiposService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly sesion = inject(SessionService);

  private base(colaboradorId: string): string {
    return `${this.be.api}/colaboradores/${colaboradorId}/anticipos`;
  }

  /** GET .../anticipos/resumen?periodo=2026-11-01 */
  resumen(colaboradorId: string, periodo: string): Observable<ResumenAnticipos> {
    return this.http.get<ResumenAnticipos>(`${this.base(colaboradorId)}/resumen`,
      { params: new HttpParams().set('periodo', diaUno(periodo)) });
  }

  /** GET .../anticipos (el backend los ordena del más reciente al más antiguo). */
  listar(colaboradorId: string): Observable<Anticipo[]> {
    return this.http.get<BeAnticipo[]>(this.base(colaboradorId)).pipe(
      map((lista) => lista.map((a): Anticipo => ({
        id: a.id, colaboradorId: a.colaboradorId, fecha: a.fecha, monto: a.monto, observaciones: a.observaciones,
        saldoPendiente: a.saldoPendiente, creadoEn: a.creadoEn,
        creadoPorMi: a.creadoPor === this.sesion.usuario()?.id,
        cuotas: a.cuotas.map((c) => ({ id: c.id, periodo: c.periodo, corte: c.corte, importe: c.importe })),
      }))),
    );
  }

  /** POST .../anticipos · { monto, observaciones } */
  registrar(colaboradorId: string, monto: number | null, observaciones: string | null): Observable<BeAnticipo> {
    return this.http.post<BeAnticipo>(this.base(colaboradorId), { monto, observaciones });
  }

  /** PUT .../anticipos/{id}/plan · reemplaza el plan completo. */
  registrarPlan(colaboradorId: string, anticipoId: string, cuotas: CuotaPlan[]): Observable<BeAnticipo> {
    return this.http.put<BeAnticipo>(`${this.base(colaboradorId)}/${anticipoId}/plan`, { cuotas });
  }

  /** DELETE .../anticipos/{id} · el backend solo lo permite si no tiene cuotas. */
  eliminar(colaboradorId: string, anticipoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(colaboradorId)}/${anticipoId}`);
  }
}
