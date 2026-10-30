import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, switchMap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Anticipo, CorteDisponible, RegistrarAnticipoRequest, ResumenAnticipos } from '../models/anticipo.models';
import { BackendRps, diaUno, mesDe } from '../../../core/backend/backend-rps.service';
import { BeAnticipo, BeCondicion, BeLiquidacion } from '../../../core/backend/backend-rps.models';
import { TipoCorte } from '../../../shared/models/corte';
import { netoDe } from '../../../shared/utils/calculo-tributario';
import { periodoActual } from '../../../shared/utils/periodo';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Anticipos adicionales (sección 10).
 *   npm start          → /api/anticipos de core/mocks/anticipos.mock.ts
 *   npm run start:api  → rps-backend: /api/colaboradores/{id}/anticipos y /{anticipoId}/plan.
 *
 * El backend no tiene un "resumen": se arma aquí con su configuración, sus condiciones económicas,
 * sus anticipos y, si ya existe, la liquidación del mes (para saber cuánto paga cada corte).
 * El backend vuelve a validar el límite al registrar.
 */
@Injectable({ providedIn: 'root' })
export class AnticiposService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/anticipos`;

  /** Neto de referencia, saldo pendiente, límite y cortes de un colaborador en un mes. */
  resumen(colaboradorId: string, periodo: string): Observable<ResumenAnticipos> {
    if (this.be.usaMock('/anticipos')) {
      const params = new HttpParams().set('colaboradorId', colaboradorId).set('periodo', periodo);
      return this.http.get<ResumenAnticipos>(`${this.base}/resumen`, { params });
    }

    const api = `${this.be.api}/colaboradores/${colaboradorId}`;
    return forkJoin({
      colaborador: this.be.colaborador(colaboradorId),
      nombres: this.be.nombres(),
      config: this.be.configuracion(),
      condiciones: this.http.get<BeCondicion[]>(`${api}/condiciones-economicas`),
      anticipos: this.http.get<BeAnticipo[]>(`${api}/anticipos`),
      liquidaciones: this.http.get<BeLiquidacion[]>(`${this.be.api}/liquidaciones`,
        { params: new HttpParams().set('periodo', diaUno(periodo)).set('colaboradorId', colaboradorId) }),
    }).pipe(map(({ colaborador, nombres, config, condiciones, anticipos, liquidaciones }): ResumenAnticipos => {
      const persona = nombres.get(colaborador.tmrColaboradorId);
      const frecuencia = colaborador.frecuenciaVigente?.frecuencia ?? null;
      const retIva = colaborador.clasificacion === 'Junior' ? config.porcentajeRetencionIvaJunior : config.porcentajeRetencionIvaProfesional;

      // RN 21: neto del mes completo de cada proyecto (la condición vigente más reciente por proyecto).
      const vigentes = new Map<string, BeCondicion>();
      for (const c of [...condiciones].sort((a, b) => a.mesInicioVigencia.localeCompare(b.mesInicioVigencia)))
        if (c.mesInicioVigencia <= diaUno(periodo)) vigentes.set(c.proyectoId, c);
      const proyectos = [...vigentes.values()].map((c) => ({
        proyecto: c.proyectoNombre,
        neto: netoDe(c.importeMensual, c.modalidad, config.porcentajeIva, config.porcentajeRetencionFuente, retIva),
      }));
      const netoReferencia = proyectos.length ? r2(proyectos.reduce((s, p) => s + p.neto, 0)) : null;

      // Pendiente = cuotas de este mes en adelante + lo que aún no tiene plan (regla del documento, RN 42).
      const saldoPendiente = r2(anticipos.reduce((s, a) =>
        s + a.saldoPendiente + a.cuotas.filter((c) => mesDe(c.periodo) >= periodoActual()).reduce((x, c) => x + c.importe, 0), 0));
      const limite = netoReferencia === null ? null : r2(netoReferencia * config.porcentajeMaximoAnticipo / 100);

      // Cuánto paga cada corte: de la liquidación si ya se generó; si no, la regla del backend (mitad del neto completo).
      const liquidacion = liquidaciones[0] ?? null;
      const cortesAplican: TipoCorte[] = frecuencia === 'DosPagos' ? ['Quincena', 'FinDeMes'] : ['FinDeMes'];
      const quincena = netoReferencia === null ? 0 : r2(netoReferencia / 2);
      const cortes: CorteDisponible[] = cortesAplican.map((corte) => {
        const base = liquidacion?.cortes.find((c) => c.tipo === corte)?.valorBase
          ?? (corte === 'Quincena' ? quincena : frecuencia === 'DosPagos' ? r2((netoReferencia ?? 0) - quincena) : netoReferencia ?? 0);
        const programado = r2(anticipos.flatMap((a) => a.cuotas)
          .filter((c) => mesDe(c.periodo) === periodo && c.corte === corte).reduce((s, c) => s + c.importe, 0));
        return { corte, base, cuotasProgramadas: programado, disponible: Math.max(0, r2(base - programado)), versionExportada: null };
      });

      let bloqueo: string | null = null;
      if (!colaborador.activo) bloqueo = 'El colaborador está desactivado en RPS.';
      else if (!colaborador.clasificacion) bloqueo = 'Falta el tipo de servicio: sin él no se puede calcular su neto.';
      else if (!frecuencia) bloqueo = 'Falta la frecuencia de pago.';
      else if (netoReferencia === null) bloqueo = 'No tiene honorarios vigentes: no hay de dónde recuperar un anticipo.';
      else if (periodo < periodoActual()) bloqueo = 'Ese mes ya terminó. Los anticipos se registran para el mes en curso o los siguientes.';

      return {
        colaboradorId,
        colaborador: this.be.nombreDe(nombres, colaborador.tmrColaboradorId),
        identificacion: persona?.identificacion ?? '',
        clasificacion: colaborador.clasificacion,
        frecuencia,
        periodo,
        netoReferencia,
        proyectos,
        saldoPendiente,
        limitePct: config.porcentajeMaximoAnticipo,
        limite,
        disponible: limite === null ? null : r2(limite - saldoPendiente),
        cortes,
        bloqueo,
      };
    }));
  }

  /** Anticipos del colaborador, del más reciente al más antiguo. */
  listar(colaboradorId: string): Observable<Anticipo[]> {
    if (this.be.usaMock('/anticipos'))
      return this.http.get<Anticipo[]>(this.base, { params: new HttpParams().set('colaboradorId', colaboradorId) });
    return this.http.get<BeAnticipo[]>(`${this.be.api}/colaboradores/${colaboradorId}/anticipos`).pipe(
      map((lista) => lista.map((a): Anticipo => ({
        id: a.id, colaboradorId: a.colaboradorId, fecha: a.fecha,
        periodo: a.cuotas[0] ? mesDe(a.cuotas[0].periodo) : mesDe(a.fecha),
        monto: a.monto, observaciones: a.observaciones,
        cuotas: a.cuotas.map((c) => ({
          id: c.id, corte: c.corte, monto: c.importe,
          // Mientras no exista el hito de "aplicada" (sección 10), una cuota de un mes pasado se da por descontada.
          estado: mesDe(c.periodo) < periodoActual() ? 'Aplicada' : 'Programada',
        })),
        netoReferencia: 0, limite: 0, registradoEn: a.creadoEn, usuario: 'Contabilidad',
      })).sort((x, y) => y.registradoEn.localeCompare(x.registradoEn))),
    );
  }

  /**
   * Registra el anticipo y su plan. El backend lo hace en dos pasos (crear y luego PUT /plan);
   * si el plan no pasa sus validaciones, se borra el anticipo recién creado para no dejarlo a medias.
   * El backend pone como fecha el día de hoy; el mes elegido se usa para las cuotas.
   */
  registrar(request: RegistrarAnticipoRequest): Observable<Anticipo> {
    if (this.be.usaMock('/anticipos')) return this.http.post<Anticipo>(this.base, request);

    const api = `${this.be.api}/colaboradores/${request.colaboradorId}/anticipos`;
    const periodo = diaUno(request.fecha);
    return this.http.post<BeAnticipo>(api, { monto: request.monto, observaciones: request.observaciones }).pipe(
      switchMap((creado) => this.http.put<BeAnticipo>(`${api}/${creado.id}/plan`, {
        cuotas: request.cuotas.map((c) => ({ periodo, corte: c.corte, importe: c.monto })),
      }).pipe(catchError((errorPlan: unknown) =>
        this.http.delete(`${api}/${creado.id}`).pipe(switchMap(() => throwError(() => errorPlan)), catchError(() => throwError(() => errorPlan)))))),
      switchMap(() => this.listar(request.colaboradorId)),
      map((lista) => lista[0]),
    );
  }
}
