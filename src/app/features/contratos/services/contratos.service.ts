import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, shareReplay, switchMap, tap } from 'rxjs';
import {
  Adenda, AsignacionDisponible, ContratoDetalle, ContratoResumen, EstadoContrato, RegistrarAdendaRequest,
  RegistrarContratoRequest, ResumenContratos,
} from '../models/contrato.models';
import { BackendRps } from '../../../core/backend/backend-rps.service';
import { BeAdenda, BeAsignacion, BeColaborador, BeContrato } from '../../../core/backend/backend-rps.models';
import { TmrColaborador } from '../../integracion-tmr/models/tmr.models';
import { DashboardService } from '../../dashboard/services/dashboard.service';
import { VencimientoContrato } from '../../dashboard/models/dashboard.models';

/**
 * Contratos y adendas de rps-backend: /api/colaboradores/{id}/contratos y /adendas.
 * El backend los agrupa por colaborador; aquí se juntan para la lista general (falta un GET /api/contratos).
 * El estado sale del backend: `vigente` del contrato y la lista de GET /api/dashboard/vencimientos
 * (por vencer en 30 días y vencidos con asignación activa).
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
    return this.todosDelBackend().pipe(map(({ contratos, vencimientos }) => contratos
      .map((d) => this.aResumen(d, vencimientos))
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
    return this.todosDelBackend().pipe(switchMap(({ contratos, vencimientos }) => {
      const d = contratos.find((x) => x.contrato.id === id);
      return d ? of(this.aDetalle(d, vencimientos)) : this.be.error(404, 'Contrato.NoEncontrado', 'No existe ese contrato.');
    }));
  }

  /** POST /api/colaboradores/{id}/contratos. Las fechas y demás las valida el backend. */
  registrar(request: RegistrarContratoRequest): Observable<ContratoDetalle> {
    return this.be.idRps(request.tmrColaboradorId).pipe(
      switchMap((id) => this.http.post<BeContrato>(`${this.be.api}/colaboradores/${id}/contratos`, {
        proyectoId: request.tmrProyectoId, fechaInicio: request.fechaInicio || null, fechaFin: request.fechaFin || null,
        referencia: request.referencia, observaciones: request.observaciones,
      })),
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
        tieneContratoVigente: contratos.some((x) => x.proyectoId === a.proyectoId && x.vigente),
      }))))))),
      map((grupos) => grupos.flat()),
    );
  }

  // ── Conversión desde rps-backend ──────────────────────────────────────

  /** Todos los contratos de todos los colaboradores, con sus adendas y asignaciones, y la lista de vencimientos. */
  private todosDelBackend(): Observable<DatosContratos> {
    if (this.cache && this.cache.hasta > Date.now()) return this.cache.datos;
    const datos = forkJoin({ contratos: this.consultarBackend(), vencimientos: this.tablero.vencimientos() }).pipe(shareReplay(1));
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
            return { contrato, adendas, colaborador: c, nombres, asignacion: asignaciones.find((a) => a.proyectoId === contrato.proyectoId) ?? null };
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

  /** Estado según el backend: en vencimientos (vencido o por vencer), o `vigente` del contrato. */
  private estadoDe(c: BeContrato, v: VencimientoContrato | undefined): EstadoContrato {
    if (v) return v.diasRestantes < 0 ? 'Vencido' : 'ProximoAVencer';
    return c.vigente ? 'Vigente' : 'NoVigente';
  }

  private aResumen(d: DatosContrato, vencimientos: VencimientoContrato[]): ContratoResumen {
    const c = d.contrato;
    const v = vencimientos.find((x) => x.contratoId === c.id);
    return {
      id: c.id,
      colaboradorId: c.colaboradorId,
      tmrColaboradorId: d.colaborador.tmrColaboradorId,
      colaborador: this.be.nombreDe(d.nombres, d.colaborador.tmrColaboradorId),
      tmrProyectoId: c.proyectoId,
      proyecto: c.proyectoNombre,
      cliente: null,
      referencia: c.referencia,
      fechaInicio: c.fechaInicio,
      fechaFinOriginal: c.fechaFin,
      fechaFinVigente: c.fechaFinVigente,
      diasParaVencer: v?.diasRestantes ?? null,
      estado: this.estadoDe(c, v),
      asignacionActiva: v?.asignacionActiva ?? false,
      numeroAdendas: d.adendas.length,
    };
  }

  private aDetalle(d: DatosContrato, vencimientos: VencimientoContrato[]): ContratoDetalle {
    const r = this.aResumen(d, vencimientos);
    // Numeradas en el orden en que se registraron.
    const adendas: Adenda[] = [...d.adendas]
      .sort((x, y) => x.fechaRegistro.localeCompare(y.fechaRegistro))
      .map((a, i) => ({ id: a.id, numero: i + 1, nuevaFechaFin: a.nuevaFechaFin, observaciones: a.observaciones, fechaRegistro: a.fechaRegistro }));
    return {
      ...r, observaciones: d.contrato.observaciones, adendas,
      asignacionInicio: d.asignacion?.fechaInicio ?? null, asignacionSalida: d.asignacion?.fechaSalida ?? null,
    };
  }
}

interface DatosContrato {
  contrato: BeContrato;
  adendas: BeAdenda[];
  colaborador: BeColaborador;
  nombres: Map<string, TmrColaborador>;
  asignacion: BeAsignacion | null;
}

interface DatosContratos {
  contratos: DatosContrato[];
  vencimientos: VencimientoContrato[];
}
