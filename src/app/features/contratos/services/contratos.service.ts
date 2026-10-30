import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  Adenda, AsignacionDisponible, ContratoDetalle, ContratoResumen, EstadoContrato, RegistrarAdendaRequest,
  RegistrarContratoRequest, ResumenContratos,
} from '../models/contrato.models';
import { BackendRps } from '../../../core/backend/backend-rps.service';
import { BeAdenda, BeAsignacion, BeColaborador, BeContrato } from '../../../core/backend/backend-rps.models';
import { TmrColaborador } from '../../integracion-tmr/models/tmr.models';
import { diasEntre, hoy } from '../../../shared/utils/fechas';

/** Plazo de "próximo a vencer" (RN 13). El backend todavía no guarda los días de alerta. */
const DIAS_ALERTA = 30;

/**
 * Contratos y adendas.
 *   npm start          → /api/contratos de core/mocks/contratos.mock.ts
 *   npm run start:api  → rps-backend: /api/colaboradores/{id}/contratos y /adendas
 *                        (el backend los agrupa por colaborador; aquí se juntan para la lista general).
 */
@Injectable({ providedIn: 'root' })
export class ContratosService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/contratos`;
  /** contratoId → colaboradorId de RPS: el backend pide los dos en la ruta. */
  private readonly duenoDe = new Map<string, string>();
  /** La ficha pide varios contratos seguidos: se reutiliza la misma consulta durante unos segundos. */
  private cache: { hasta: number; datos: Observable<DatosContrato[]> } | null = null;

  /** Lista de contratos, filtrada por estado y/o por colaborador (ID de TMR). */
  listar(estado: EstadoContrato | null, tmrColaboradorId: string | null = null): Observable<ContratoResumen[]> {
    if (this.be.usaMock('/contratos')) {
      let params = new HttpParams();
      if (estado) params = params.set('estado', estado);
      if (tmrColaboradorId) params = params.set('tmrColaboradorId', tmrColaboradorId);
      return this.http.get<ContratoResumen[]>(this.base, { params });
    }
    return this.todosDelBackend().pipe(map((datos) => datos
      .map((d) => this.aResumen(d))
      .filter((c) => (!estado || c.estado === estado) && (!tmrColaboradorId || c.tmrColaboradorId === tmrColaboradorId))
      .sort((a, b) => a.diasParaVencer - b.diasParaVencer)));
  }

  /** Contadores de las tarjetas (vigentes, por vencer, vencidos). */
  resumen(): Observable<ResumenContratos> {
    if (this.be.usaMock('/contratos')) return this.http.get<ResumenContratos>(`${this.base}/resumen`);
    return this.listar(null).pipe(map((l) => ({
      vigentes: l.filter((c) => c.estado === 'Vigente').length,
      proximosAVencer: l.filter((c) => c.estado === 'ProximoAVencer').length,
      vencidos: l.filter((c) => c.estado === 'Vencido').length,
      diasAlerta: DIAS_ALERTA,
    })));
  }

  obtener(id: string): Observable<ContratoDetalle> {
    if (this.be.usaMock('/contratos')) return this.http.get<ContratoDetalle>(`${this.base}/${id}`);
    return this.todosDelBackend().pipe(switchMap((datos) => {
      const d = datos.find((x) => x.contrato.id === id);
      return d ? of(this.aDetalle(d)) : this.be.error(404, 'Contrato.NoEncontrado', 'No existe ese contrato.');
    }));
  }

  registrar(request: RegistrarContratoRequest): Observable<ContratoDetalle> {
    if (this.be.usaMock('/contratos')) return this.http.post<ContratoDetalle>(this.base, request);
    // POST /api/colaboradores/{id}/contratos
    return this.be.idRps(request.tmrColaboradorId).pipe(
      switchMap((id) => this.http.post<BeContrato>(`${this.be.api}/colaboradores/${id}/contratos`, {
        proyectoId: request.tmrProyectoId, fechaInicio: request.fechaInicio, fechaFin: request.fechaFin,
        referencia: request.referencia, observaciones: request.observaciones,
      })),
      tap(() => (this.cache = null)),
      switchMap((c) => this.obtener(c.id)),
    );
  }

  /** Extiende la fecha de fin vigente (RN 10 a 12). El backend no guarda referencia: va en observaciones. */
  registrarAdenda(id: string, request: RegistrarAdendaRequest): Observable<ContratoDetalle> {
    if (this.be.usaMock('/contratos')) return this.http.post<ContratoDetalle>(`${this.base}/${id}/adendas`, request);
    const observaciones = [request.referencia, request.observaciones].filter(Boolean).join(' · ') || null;
    return this.colaboradorDe(id).pipe(
      switchMap((colaboradorId) => this.http.post<BeAdenda>(`${this.be.api}/colaboradores/${colaboradorId}/contratos/${id}/adendas`,
        { nuevaFechaFin: request.nuevaFechaFin, observaciones })),
      tap(() => (this.cache = null)),
      switchMap(() => this.obtener(id)),
    );
  }

  /** Combinaciones colaborador + proyecto asignadas, para registrar un contrato. */
  asignacionesDisponibles(): Observable<AsignacionDisponible[]> {
    if (this.be.usaMock('/contratos')) return this.http.get<AsignacionDisponible[]>(`${environment.apiUrl}/integracion-tmr/asignaciones`);
    return this.be.colaboradoresConNombre().pipe(
      switchMap(({ lista, nombres }) => lista.length === 0 ? of([]) : forkJoin(lista.map((c) => forkJoin({
        asignaciones: this.http.get<BeAsignacion[]>(`${this.be.api}/colaboradores/${c.id}/asignaciones`),
        contratos: this.http.get<BeContrato[]>(`${this.be.api}/colaboradores/${c.id}/contratos`),
      }).pipe(map(({ asignaciones, contratos }) => asignaciones.map((a): AsignacionDisponible => ({
        tmrColaboradorId: c.tmrColaboradorId,
        colaborador: this.be.nombreDe(nombres, c.tmrColaboradorId),
        tmrProyectoId: a.proyectoId,
        proyecto: a.proyectoNombre,
        cliente: null,
        fechaAsignacion: a.fechaInicio,
        fechaFinAsignacion: a.fechaSalida,
        activa: a.fechaSalida === null || a.fechaSalida >= hoy(),
        vinculadoEnRps: true,
        tieneContratoVigente: contratos.some((x) => x.proyectoId === a.proyectoId && x.fechaFinVigente >= hoy()),
      }))))))),
      map((grupos) => grupos.flat().sort((x, y) => x.colaborador.localeCompare(y.colaborador) || x.proyecto.localeCompare(y.proyecto))),
    );
  }

  // ── Conversión desde rps-backend ──────────────────────────────────────

  /** Todos los contratos de todos los colaboradores, con sus adendas y asignaciones. */
  private todosDelBackend(): Observable<DatosContrato[]> {
    if (this.cache && this.cache.hasta > Date.now()) return this.cache.datos;
    const datos = this.consultarBackend().pipe(shareReplay(1));
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

  private aResumen(d: DatosContrato): ContratoResumen {
    const { contrato: c, asignacion: a } = d;
    const dias = diasEntre(hoy(), c.fechaFinVigente);
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
      diasParaVencer: dias,
      estado: dias < 0 ? 'Vencido' : dias <= DIAS_ALERTA ? 'ProximoAVencer' : 'Vigente',
      asignacionActiva: !!a && (a.fechaSalida === null || a.fechaSalida >= hoy()),
      numeroAdendas: d.adendas.length,
    };
  }

  private aDetalle(d: DatosContrato): ContratoDetalle {
    const r = this.aResumen(d);
    const adendas: Adenda[] = [...d.adendas]
      .sort((x, y) => x.nuevaFechaFin.localeCompare(y.nuevaFechaFin))
      .map((a, i) => ({ id: a.id, numero: i + 1, nuevaFechaFin: a.nuevaFechaFin, referencia: null, observaciones: a.observaciones, fechaRegistro: a.fechaRegistro }));
    const advertencias: string[] = [];
    if (r.estado === 'Vencido' && r.asignacionActiva)
      advertencias.push('El contrato venció y la asignación sigue activa. Consulta si corresponde una adenda. No bloquea la liquidación (RN 14, RN 15).');
    if (d.asignacion && d.asignacion.fechaInicio < r.fechaInicio)
      advertencias.push(`La asignación empieza el ${d.asignacion.fechaInicio}, antes del inicio del contrato (${r.fechaInicio}).`);
    return {
      ...r, observaciones: d.contrato.observaciones, adendas,
      asignacionInicio: d.asignacion?.fechaInicio ?? null, asignacionSalida: d.asignacion?.fechaSalida ?? null, advertencias,
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
