import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, shareReplay, switchMap, tap } from 'rxjs';
import {
  Adenda, AsignacionDisponible, ContratoDetalle, ContratoResumen, EstadoContrato, ProyectoDeContrato,
  RegistrarAdendaRequest, RegistrarContratoRequest, ResumenContratos,
} from '../models/contrato.models';
import { BackendRps, diaUno } from '../../../core/backend/backend-rps.service';
import { BeAdenda, BeAsignacion, BeColaborador, BeContrato, BeProyecto, BeProyectoDeContrato } from '../../../core/backend/backend-rps.models';
import { TmrColaborador } from '../../integracion-tmr/models/tmr.models';
import { DashboardService } from '../../dashboard/services/dashboard.service';
import { VencimientoContrato } from '../../dashboard/models/dashboard.models';

/**
 * Contratos y adendas de rps-backend: /api/colaboradores/{id}/contratos y /adendas.
 * Un contrato puede cubrir uno, varios o ningún proyecto (RR. HH. sin proyecto en TMR).
 * El backend los agrupa por colaborador; aquí se juntan para la lista general (falta un GET /api/contratos).
 * El estado de cada proyecto sale del backend: `vigente` del contrato y la lista de
 * GET /api/dashboard/vencimientos (por vencer en 30 días y vencidos con asignación activa), que
 * ahora puede traer más de una fila para el mismo contrato (una por proyecto).
 */
@Injectable({ providedIn: 'root' })
export class ContratosService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly tablero = inject(DashboardService);
  /** contratoId → colaboradorId de RPS: el backend pide los dos en la ruta. */
  private readonly duenoDe = new Map<string, string>();
  /** La ficha pide varios contratos seguidos: se reutiliza la misma consulta durante unos segundos. */
  private cache: { hasta: number; datos: Observable<DatosContratos> } | null = null;

  /** Lista de contratos, filtrada por estado y/o por colaborador (ID de TMR). */
  listar(estado: EstadoContrato | null, tmrColaboradorId: string | null = null): Observable<ContratoResumen[]> {
    return this.todosDelBackend().pipe(map(({ contratos, vencimientos, proyectos }) => contratos
      .map((d) => this.aResumen(d, vencimientos, proyectos))
      .filter((c) => (!estado || c.estado === estado) && (!tmrColaboradorId || c.tmrColaboradorId === tmrColaboradorId))));
  }

  /** Cuántos contratos hay en cada estado (para las tarjetas). */
  resumen(): Observable<ResumenContratos> {
    return this.listar(null).pipe(map((l) => ({
      vigentes: l.filter((c) => c.estado === 'Vigente').length,
      proximosAVencer: l.filter((c) => c.estado === 'ProximoAVencer').length,
      vencidos: l.filter((c) => c.estado === 'Vencido').length,
      noVigentes: l.filter((c) => c.estado === 'NoVigente').length,
    })));
  }

  obtener(id: string): Observable<ContratoDetalle> {
    return this.todosDelBackend().pipe(switchMap(({ contratos, vencimientos, proyectos }) => {
      const d = contratos.find((x) => x.contrato.id === id);
      return d ? of(this.aDetalle(d, vencimientos, proyectos)) : this.be.error(404, 'Contrato.NoEncontrado', 'No existe ese contrato.');
    }));
  }

  /**
   * POST /api/colaboradores/{id}/contratos y, de una vez, los honorarios por proyecto y los datos
   * bancarios que vengan en la misma solicitud (varias llamadas encadenadas; las fechas y demás
   * las valida el backend en cada una).
   */
  registrar(request: RegistrarContratoRequest): Observable<ContratoDetalle> {
    return forkJoin({ colaboradorId: this.be.idRps(request.tmrColaboradorId), proyectos: this.be.proyectos() }).pipe(
      switchMap(({ colaboradorId, proyectos }) => {
        const idDe = (tmrProyectoId: string) => proyectos.find((p) => p.tmrProyectoId === tmrProyectoId)?.id ?? null;
        const proyectoIds = request.tmrProyectoIds.map(idDe).filter((id): id is string => id !== null);

        return this.http.post<BeContrato>(`${this.be.api}/colaboradores/${colaboradorId}/contratos`, {
          proyectoIds, fechaInicio: request.fechaInicio || null, fechaFin: request.indefinido ? null : (request.fechaFin || null),
          indefinido: request.indefinido, referencia: request.referencia, observaciones: request.observaciones,
        }).pipe(
          switchMap((contrato) => {
            const pasos: Observable<unknown>[] = [];

            for (const h of request.honorarios) {
              const proyectoId = idDe(h.tmrProyectoId);
              if (!proyectoId || h.importeMensual === null) continue;
              pasos.push(this.http.post(`${this.be.api}/colaboradores/${colaboradorId}/condiciones-economicas`, {
                proyectoId, contratoId: contrato.id, importeMensual: h.importeMensual, modalidad: h.modalidad,
                mesInicioVigencia: diaUno(request.fechaInicio), observaciones: null,
              }));
            }

            if (request.cuentaBancaria) {
              pasos.push(this.http.put(`${this.be.api}/colaboradores/${colaboradorId}/cuenta-bancaria`, request.cuentaBancaria));
            }

            return forkJoin(pasos.length > 0 ? pasos : [of(null)]).pipe(map(() => contrato));
          }),
        );
      }),
      tap(() => (this.cache = null)),
      switchMap((c) => this.obtener(c.id)),
    );
  }

  /** POST .../contratos/{id}/adendas. El backend exige que la nueva fecha sea posterior al fin vigente. */
  registrarAdenda(id: string, request: RegistrarAdendaRequest): Observable<ContratoDetalle> {
    return this.colaboradorDe(id).pipe(
      switchMap((colaboradorId) => this.http.post<BeAdenda>(`${this.be.api}/colaboradores/${colaboradorId}/contratos/${id}/adendas`,
        { nuevaFechaFin: request.nuevaFechaFin || null, observaciones: request.observaciones })),
      tap(() => (this.cache = null)),
      switchMap(() => this.obtener(id)),
    );
  }

  /**
   * Todos los colaboradores de TMR, para elegir a quién se le registra el contrato — incluidos
   * los que todavía no tienen ninguna asignación (personal de RR. HH. sin proyecto).
   */
  colaboradoresParaRegistro(): Observable<{ tmrColaboradorId: string; colaborador: string }[]> {
    return this.be.colaboradoresConNombre().pipe(
      map(({ lista, nombres }) => lista.map((c) => ({
        tmrColaboradorId: c.tmrColaboradorId, colaborador: this.be.nombreDe(nombres, c.tmrColaboradorId),
      }))),
    );
  }

  /** Colaborador + proyecto de cada asignación que viene de TMR, para registrar un contrato. */
  asignacionesDisponibles(): Observable<AsignacionDisponible[]> {
    return this.be.colaboradoresConNombre().pipe(
      switchMap(({ lista, nombres }) => lista.length === 0 ? of([]) : forkJoin(lista.map((c) => forkJoin({
        asignaciones: this.http.get<BeAsignacion[]>(`${this.be.api}/colaboradores/${c.id}/asignaciones`),
        contratos: this.http.get<BeContrato[]>(`${this.be.api}/colaboradores/${c.id}/contratos`),
      }).pipe(map(({ asignaciones, contratos }) => asignaciones.filter((a) => !a.eliminadaEnOrigen).map((a): AsignacionDisponible => ({
        tmrColaboradorId: c.tmrColaboradorId,
        colaborador: this.be.nombreDe(nombres, c.tmrColaboradorId),
        tmrProyectoId: a.proyectoId,
        proyecto: a.proyectoNombre,
        fechaAsignacion: a.fechaInicio,
        fechaFinAsignacion: a.fechaSalida,
        tieneContratoVigente: contratos.some((x) => x.vigente && x.proyectos.some((p) => p.proyectoId === a.proyectoId)),
      }))))))),
      map((grupos) => grupos.flat()),
    );
  }

  // ── Conversión desde rps-backend ──────────────────────────────────────

  /** Todos los contratos de todos los colaboradores, con sus adendas y asignaciones, y la lista de vencimientos. */
  private todosDelBackend(): Observable<DatosContratos> {
    if (this.cache && this.cache.hasta > Date.now()) return this.cache.datos;
    const datos = forkJoin({
      contratos: this.consultarBackend(), vencimientos: this.tablero.vencimientos(), proyectos: this.be.proyectos(),
    }).pipe(shareReplay(1));
    this.cache = { hasta: Date.now() + 5000, datos };
    return datos;
  }

  private consultarBackend(): Observable<DatosContrato[]> {
    return this.be.colaboradoresConNombre().pipe(
      switchMap(({ lista, nombres }) => lista.length === 0 ? of([]) : forkJoin(lista.map((c) => forkJoin({
        contratos: this.http.get<BeContrato[]>(`${this.be.api}/colaboradores/${c.id}/contratos`),
        asignaciones: this.http.get<BeAsignacion[]>(`${this.be.api}/colaboradores/${c.id}/asignaciones`),
      }).pipe(switchMap(({ contratos, asignaciones }) => contratos.length === 0 ? of([]) : forkJoin(contratos.map((contrato) =>
        this.http.get<BeAdenda[]>(`${this.be.api}/colaboradores/${c.id}/contratos/${contrato.id}/adendas`).pipe(
          map((adendas): DatosContrato => {
            this.duenoDe.set(contrato.id, c.id);
            return { contrato, adendas, colaborador: c, nombres, asignaciones };
          }))))))))),
      map((grupos) => grupos.flat()),
    );
  }

  private colaboradorDe(contratoId: string): Observable<string> {
    const conocido = this.duenoDe.get(contratoId);
    if (conocido) return of(conocido);
    return this.todosDelBackend().pipe(switchMap(() => {
      const id = this.duenoDe.get(contratoId);
      return id ? of(id) : this.be.error(404, 'Contrato.NoEncontrado', 'No existe ese contrato.');
    }));
  }

  /** Estado de un proyecto del contrato: en vencimientos (vencido o por vencer), o `vigente` del contrato. */
  private estadoProyecto(contratoVigente: boolean, v: VencimientoContrato | undefined): EstadoContrato {
    if (v) return v.diasRestantes < 0 ? 'Vencido' : 'ProximoAVencer';
    return contratoVigente ? 'Vigente' : 'NoVigente';
  }

  /** El peor estado entre los proyectos del contrato (Vencido > ProximoAVencer > Vigente > NoVigente). */
  private peorEstado(estados: EstadoContrato[], contratoVigente: boolean): EstadoContrato {
    if (estados.length === 0) return contratoVigente ? 'Vigente' : 'NoVigente';
    const orden: EstadoContrato[] = ['Vencido', 'ProximoAVencer', 'Vigente', 'NoVigente'];
    return orden.find((e) => estados.includes(e))!;
  }

  private aProyectos(d: DatosContrato, vencimientos: VencimientoContrato[], proyectos: BeProyecto[]): ProyectoDeContrato[] {
    return d.contrato.proyectos.map((p: BeProyectoDeContrato): ProyectoDeContrato => {
      const v = vencimientos.find((x) => x.contratoId === d.contrato.id && x.proyectoId === p.proyectoId);
      const asignacion = d.asignaciones.find((a) => a.proyectoId === p.proyectoId) ?? null;
      const proyectoCompleto = proyectos.find((x) => x.id === p.proyectoId) ?? null;
      return {
        proyectoId: p.proyectoId,
        tmrProyectoId: asignacion?.proyectoId ?? p.proyectoId,
        proyecto: p.proyectoNombre,
        cliente: proyectoCompleto?.cliente ?? null,
        diasParaVencer: v?.diasRestantes ?? null,
        estado: this.estadoProyecto(d.contrato.vigente, v),
        asignacionActiva: v?.asignacionActiva ?? false,
      };
    });
  }

  private aResumen(d: DatosContrato, vencimientos: VencimientoContrato[], proyectos: BeProyecto[] = []): ContratoResumen {
    const c = d.contrato;
    const proyectosDelContrato = this.aProyectos(d, vencimientos, proyectos);
    return {
      id: c.id,
      colaboradorId: c.colaboradorId,
      tmrColaboradorId: d.colaborador.tmrColaboradorId,
      colaborador: this.be.nombreDe(d.nombres, d.colaborador.tmrColaboradorId),
      proyectos: proyectosDelContrato,
      referencia: c.referencia,
      fechaInicio: c.fechaInicio,
      fechaFinOriginal: c.fechaFin,
      fechaFinVigente: c.fechaFinVigente,
      estado: this.peorEstado(proyectosDelContrato.map((p) => p.estado), c.vigente),
      numeroAdendas: d.adendas.length,
    };
  }

  private aDetalle(d: DatosContrato, vencimientos: VencimientoContrato[], proyectos: BeProyecto[] = []): ContratoDetalle {
    const r = this.aResumen(d, vencimientos, proyectos);
    // Numeradas en el orden en que se registraron.
    const adendas: Adenda[] = [...d.adendas]
      .sort((x, y) => x.fechaRegistro.localeCompare(y.fechaRegistro))
      .map((a, i) => ({ id: a.id, numero: i + 1, nuevaFechaFin: a.nuevaFechaFin, observaciones: a.observaciones, fechaRegistro: a.fechaRegistro }));
    return { ...r, observaciones: d.contrato.observaciones, adendas };
  }
}

interface DatosContrato {
  contrato: BeContrato;
  adendas: BeAdenda[];
  colaborador: BeColaborador;
  nombres: Map<string, TmrColaborador>;
  asignaciones: BeAsignacion[];
}

interface DatosContratos {
  contratos: DatosContrato[];
  vencimientos: VencimientoContrato[];
  proyectos: BeProyecto[];
}
