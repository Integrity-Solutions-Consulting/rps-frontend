import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  LiquidacionDetalle, LiquidacionPendiente, LiquidacionResumen, LiquidacionesPeriodo, ProyectoLiquidado,
} from '../models/liquidacion.models';
import { BackendRps, diaUno } from '../../../core/backend/backend-rps.service';
import {
  BeColaborador, BeConfiguracion, BeDocumento, BeHonorario, BeLiquidacion, BeLiquidacionDetalle, BeProyecto,
} from '../../../core/backend/backend-rps.models';
import { TmrColaborador } from '../../integracion-tmr/models/tmr.models';

/**
 * Liquidaciones del mes.
 *   npm start          → /api/liquidaciones de core/mocks (con recálculo y versiones)
 *   npm run start:api  → rps-backend: POST /api/honorarios/generar + POST /api/liquidaciones/generar,
 *                        GET /api/liquidaciones, GET /api/liquidaciones/{id}, POST /{id}/revisar.
 *
 * Diferencias del backend actual (se ven en pantalla como avisos):
 *   - "Calcular" es idempotente: si algo cambia después, no recalcula ni guarda versiones.
 *   - La revisión solo se puede marcar, no quitar.
 */
@Injectable({ providedIn: 'root' })
export class LiquidacionesService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/liquidaciones`;

  listar(periodo: string): Observable<LiquidacionesPeriodo> {
    if (this.be.usaMock('/liquidaciones'))
      return this.http.get<LiquidacionesPeriodo>(this.base, { params: new HttpParams().set('periodo', periodo) });

    return forkJoin({
      liquidaciones: this.http.get<BeLiquidacion[]>(this.base, { params: new HttpParams().set('periodo', diaUno(periodo)) }),
      honorarios: this.http.get<BeHonorario[]>(`${this.be.api}/honorarios`, { params: new HttpParams().set('periodo', diaUno(periodo)) }),
      base: this.datosBase(),
    }).pipe(switchMap(({ liquidaciones, honorarios, base }) => {
      const ids = [...new Set(liquidaciones.map((l) => l.colaboradorId))];
      const documentos = ids.length === 0 ? of([] as BeDocumento[][]) : forkJoin(ids.map((id) =>
        this.http.get<BeDocumento[]>(`${this.be.api}/colaboradores/${id}/documentos-mensuales`, { params: new HttpParams().set('periodo', diaUno(periodo)) })));
      return documentos.pipe(map((docs): LiquidacionesPeriodo => {
        const conDocumento = new Set(docs.flat().map((d) => d.colaboradorId));
        const filas = liquidaciones.map((l) => this.aResumen(l, periodo, base, honorarios, conDocumento.has(l.colaboradorId)))
          .sort((a, b) => a.colaborador.localeCompare(b.colaborador));
        const pendientes: LiquidacionPendiente[] = base.colaboradores
          .filter((c) => c.activo && c.estadoConfiguracion === 'Pendiente')
          .map((c) => ({
            colaboradorId: c.id, colaborador: this.be.nombreDe(base.nombres, c.tmrColaboradorId),
            motivo: 'Configuración incompleta: falta tipo de servicio, frecuencia de pago o cuenta bancaria.',
          }));
        return { periodo, calculado: filas.length > 0, filas, pendientes };
      }));
    }));
  }

  /** Genera los honorarios del mes y luego las liquidaciones (dos pasos en el backend). */
  calcular(periodo: string): Observable<LiquidacionesPeriodo> {
    if (this.be.usaMock('/liquidaciones')) return this.http.post<LiquidacionesPeriodo>(`${this.base}/calcular`, { periodo });
    return this.http.post(`${this.be.api}/honorarios/generar`, { periodo: diaUno(periodo) }).pipe(
      switchMap(() => this.http.post(`${this.base}/generar`, { periodo: diaUno(periodo) })),
      switchMap(() => this.listar(periodo)),
    );
  }

  obtener(id: string): Observable<LiquidacionDetalle> {
    if (this.be.usaMock('/liquidaciones')) return this.http.get<LiquidacionDetalle>(`${this.base}/${id}`);
    return forkJoin({ d: this.http.get<BeLiquidacionDetalle>(`${this.base}/${id}`), base: this.datosBase() }).pipe(
      switchMap(({ d, base }) => this.http.get<BeDocumento[]>(`${this.be.api}/colaboradores/${d.colaboradorId}/documentos-mensuales`,
        { params: new HttpParams().set('periodo', d.periodo) }).pipe(map((docs): LiquidacionDetalle => {
        const periodo = d.periodo.slice(0, 7);
        const resumen = this.aResumen(d, periodo, base, d.honorarios, docs.length > 0);
        const colaborador = base.colaboradores.find((c) => c.id === d.colaboradorId);
        const ultimo = `${periodo}-${String(d.honorarios[0]?.diasReales ?? 30).padStart(2, '0')}`;
        const detalleProyectos: ProyectoLiquidado[] = d.honorarios.map((h) => ({
          tmrProyectoId: h.proyectoId,
          proyecto: base.proyectos.find((p) => p.id === h.proyectoId)?.nombre ?? 'Proyecto',
          cliente: base.proyectos.find((p) => p.id === h.proyectoId)?.cliente ?? null,
          // El backend no devuelve el honorario mensual: se reconstruye desde el proporcional.
          honorario: Math.round(h.proporcionalAcordado / h.diasReconocidos * h.diasReales * 100) / 100,
          modalidad: h.modalidad,
          desde: `${periodo}-01`, hasta: ultimo,
          diasReconocidos: h.diasReconocidos, diasDelMes: h.diasReales, proporcional: h.proporcionalAcordado,
          subtotal: h.subtotal, iva: h.iva, totalDocumento: h.totalDocumento,
          retencionFuente: h.retencionFuente, retencionIva: h.retencionIva, totalRetenciones: h.totalRetenciones,
          neto: h.neto, ajusteRedondeo: 0, contrato: null,
        }));
        return {
          ...resumen,
          detalleProyectos,
          proyectosSinHonorario: [],
          // El honorario guarda los porcentajes usados, pero el backend no los devuelve: se muestran los actuales.
          parametros: {
            ivaPct: base.config.porcentajeIva, retencionFuentePct: base.config.porcentajeRetencionFuente,
            retencionIvaPct: colaborador?.clasificacion === 'Junior' ? base.config.porcentajeRetencionIvaJunior : base.config.porcentajeRetencionIvaProfesional,
          },
          notasCortes: [
            'Regla del backend: la quincena es la mitad del neto del mes completo y fin de mes completa lo reconocido. ' +
            'Si entra después del día 15, todo va a fin de mes (RN 26). La fórmula exacta de salida está pendiente (PA 02).',
          ],
          versionesAnteriores: [],
        };
      }))),
    );
  }

  /** "Revisado para envío" (RN 49). El backend solo permite marcarla. */
  marcarRevisado(id: string, revisado: boolean): Observable<LiquidacionResumen> {
    if (this.be.usaMock('/liquidaciones')) return this.http.put<LiquidacionResumen>(`${this.base}/${id}/revisado`, { revisado });
    if (!revisado)
      return this.be.error(409, 'Liquidacion.RevisionNoReversible', 'El backend todavía no permite quitar la marca de revisión.');
    return this.http.post<BeLiquidacion>(`${this.base}/${id}/revisar`, {}).pipe(switchMap((l) => this.listar(l.periodo.slice(0, 7))),
      map((p) => p.filas.find((f) => f.id === id)!));
  }

  // ── Conversión desde rps-backend ──────────────────────────────────────

  private datosBase(): Observable<DatosBase> {
    return forkJoin({ c: this.be.colaboradoresConNombre(), proyectos: this.be.proyectos(), config: this.be.configuracion() }).pipe(
      switchMap(({ c, proyectos, config }) => (c.lista.length === 0 ? of([] as BeColaborador[]) : forkJoin(c.lista.map((x) => this.be.colaborador(x.id))))
        .pipe(map((detalles) => ({ colaboradores: detalles, nombres: c.nombres, proyectos, config })))),
    );
  }

  private aResumen(l: BeLiquidacion, periodo: string, base: DatosBase, honorarios: BeHonorario[], documento: boolean): LiquidacionResumen {
    const c = base.colaboradores.find((x) => x.id === l.colaboradorId);
    return {
      id: l.id, periodo, colaboradorId: l.colaboradorId,
      tmrColaboradorId: c?.tmrColaboradorId ?? '',
      colaborador: c ? this.be.nombreDe(base.nombres, c.tmrColaboradorId) : 'Colaborador',
      clasificacion: c?.clasificacion ?? 'Profesional',
      frecuencia: l.cortes.some((x) => x.tipo === 'Quincena') ? 'DosPagos' : 'FinDeMes',
      proyectos: honorarios.filter((h) => h.colaboradorId === l.colaboradorId && h.liquidacionId === l.id).length,
      netoConsolidado: l.netoConsolidado,
      cortes: l.cortes.map((x) => ({ corte: x.tipo, base: x.valorBase, descuento: x.recuperacionAdicional, valor: x.valorPreparado, versionExportada: null })),
      documento: documento ? 'Registrado' : 'Pendiente',
      revisado: l.revisado, revisadoPor: l.revisado ? 'Contabilidad' : null, revisadoEn: l.revisadoEn,
      version: 1, calculadoEn: l.creadoEn, requiereRecalculo: false, advertencias: [],
    };
  }
}

interface DatosBase {
  colaboradores: BeColaborador[];
  nombres: Map<string, TmrColaborador>;
  proyectos: BeProyecto[];
  config: BeConfiguracion;
}
