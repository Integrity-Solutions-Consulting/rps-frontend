import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  LiquidacionDetalle, LiquidacionResumen, LiquidacionesPeriodo, ResultadoCalculo,
} from '../models/liquidacion.models';
import { BackendRps, diaUno, mesDe } from '../../../core/backend/backend-rps.service';
import { SessionService } from '../../../core/services/session.service';
import {
  BeColaborador, BeLiquidacion, BeLiquidacionDetalle, BeProyecto,
} from '../../../core/backend/backend-rps.models';
import { TmrColaborador } from '../../integracion-tmr/models/tmr.models';

/**
 * Liquidaciones del mes (rps-backend):
 *   POST /api/honorarios/generar y POST /api/liquidaciones/generar (botón "Calcular")
 *   GET  /api/liquidaciones?periodo=2026-11-01 · GET /api/liquidaciones/{id} · POST /api/liquidaciones/{id}/revisar
 * Volver a "Calcular" el mismo período suma a la liquidación existente los honorarios nuevos
 * (ej. un contrato tardío) en vez de duplicarla, y retira la marca "Revisado" si cambia el total.
 * El backend no permite quitar "Revisado" manualmente, solo al recalcular con un total distinto.
 */
@Injectable({ providedIn: 'root' })
export class LiquidacionesService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly sesion = inject(SessionService);
  private readonly base = `${environment.apiUrl}/liquidaciones`;

  listar(periodo: string): Observable<LiquidacionesPeriodo> {
    const params = new HttpParams().set('periodo', diaUno(periodo));
    return forkJoin({
      liquidaciones: this.http.get<BeLiquidacion[]>(this.base, { params }),
      c: this.be.colaboradoresConNombre(),
    }).pipe(map(({ liquidaciones, c }) => ({
      periodo,
      filas: liquidaciones.map((l) => this.aResumen(l, c.lista, c.nombres)),
    })));
  }

  /** Genera los honorarios del mes y luego las liquidaciones (dos pasos en el backend). Devuelve lo que respondió. */
  calcular(periodo: string): Observable<ResultadoCalculo> {
    const body = { periodo: diaUno(periodo) };
    return this.http.post<{ generados: number; omitidos: number }>(`${this.be.api}/honorarios/generar`, body).pipe(
      switchMap((h) => this.http.post<{ generadas: number; honorariosIncluidos: number }>(`${this.base}/generar`, body).pipe(
        map((l): ResultadoCalculo => ({
          honorariosGenerados: h.generados, honorariosOmitidos: h.omitidos, liquidacionesGeneradas: l.generadas,
        })),
      )),
    );
  }

  obtener(id: string): Observable<LiquidacionDetalle> {
    return forkJoin({
      d: this.http.get<BeLiquidacionDetalle>(`${this.base}/${id}`),
      c: this.be.colaboradoresConNombre(),
      proyectos: this.be.proyectos(),
    }).pipe(
      map(({ d, c, proyectos }) => ({
        ...this.aResumen(d, c.lista, c.nombres),
        detalleProyectos: d.honorarios.map((h) => {
          const p: BeProyecto | undefined = proyectos.find((x) => x.id === h.proyectoId);
          return {
            proyectoId: h.proyectoId, proyecto: h.proyectoId ? (p?.nombre ?? 'Proyecto') : 'Pago por contrato', cliente: p?.cliente ?? null, modalidad: h.modalidad,
            diasReales: h.diasReales, diasReconocidos: h.diasReconocidos, proporcionalAcordado: h.proporcionalAcordado,
            subtotal: h.subtotal, iva: h.iva, totalDocumento: h.totalDocumento, retencionFuente: h.retencionFuente,
            retencionIva: h.retencionIva, totalRetenciones: h.totalRetenciones, neto: h.neto,
          };
        }),
      })),
    );
  }

  /** POST /api/liquidaciones/{id}/revisar · "Revisado para envío" (RN 49). */
  marcarRevisado(id: string): Observable<void> {
    return this.http.post<BeLiquidacion>(`${this.base}/${id}/revisar`, {}).pipe(map(() => undefined));
  }

  private aResumen(l: BeLiquidacion, colaboradores: BeColaborador[], nombres: Map<string, TmrColaborador>): LiquidacionResumen {
    const c = colaboradores.find((x) => x.id === l.colaboradorId);
    return {
      id: l.id, periodo: mesDe(l.periodo), colaboradorId: l.colaboradorId,
      tmrColaboradorId: c?.tmrColaboradorId ?? '',
      colaborador: c ? this.be.nombreDe(nombres, c.tmrColaboradorId) : 'Colaborador',
      netoConsolidado: l.netoConsolidado,
      cortes: l.cortes.map((x) => ({
        corte: x.tipo, base: x.valorBase, descuento: x.recuperacionAdicional, valor: x.valorPreparado,
        recuperacionNoAplicada: x.recuperacionNoAplicada, ajustePorProrrateo: x.ajustePorProrrateo,
      })),
      revisado: l.revisado, revisadoEn: l.revisadoEn,
      revisadoPorMi: l.revisadoPorUsuarioId !== null && l.revisadoPorUsuarioId === this.sesion.usuario()?.id,
      calculadoEn: l.creadoEn,
    };
  }
}
