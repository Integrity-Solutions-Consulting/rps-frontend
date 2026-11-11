import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, concat, forkJoin, map, of, shareReplay, switchMap, tap, toArray } from 'rxjs';
import {
  Adenda, AsignacionDisponible, ConfiguracionColaboradorForm, ContratoDetalle, ContratoResumen, EditarContratoRequest,
  EstadoContrato, ProyectoDeContrato, RegistrarAdendaRequest, RegistrarContratoRequest, ResumenContratos,
} from '../models/contrato.models';
import { BackendRps, diaUno } from '../../../core/backend/backend-rps.service';
import { BeAdenda, BeAsignacion, BeColaborador, BeContrato, BeProyecto, BeProyectoDeContrato } from '../../../core/backend/backend-rps.models';
import { TmrColaborador } from '../../integracion-tmr/models/tmr.models';
import { DashboardService } from '../../dashboard/services/dashboard.service';
import { VencimientoContrato } from '../../dashboard/models/dashboard.models';
import { ColaboradoresService } from '../../colaboradores/services/colaboradores.service';
import { ColaboradorDetalle } from '../../colaboradores/models/colaborador.models';
import { periodoActual, primerDia } from '../../../shared/utils/periodo';

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
  private readonly colaboradoresApi = inject(ColaboradoresService);
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
   * POST /api/colaboradores/{id}/contratos y, de una vez, todo lo demás que el mismo formulario deja
   * configurar del colaborador (tipo de servicio, frecuencia, honorarios y datos bancarios) — varias
   * llamadas encadenadas; las fechas y demás las valida el backend en cada una.
   */
  registrar(request: RegistrarContratoRequest): Observable<ContratoDetalle> {
    // tmrProyectoIds/tmrProyectoId ya son ids de rps-backend (vienen de BeAsignacion.proyectoId, no
    // del id crudo de TMR): no hay que resolverlos contra BeProyecto.tmrProyectoId.
    return this.be.idRps(request.tmrColaboradorId).pipe(
      switchMap((colaboradorId) => this.http.post<BeContrato>(`${this.be.api}/colaboradores/${colaboradorId}/contratos`, {
        proyectoIds: request.tmrProyectoIds, fechaInicio: request.fechaInicio || null,
        fechaFin: request.indefinido ? null : (request.fechaFin || null),
        indefinido: request.indefinido, referencia: request.referencia, observaciones: request.observaciones,
      }).pipe(
        switchMap((contrato) => this.ejecutarEnOrden(this.pasosConfiguracion(colaboradorId, contrato.id, request.fechaInicio, request))
          .pipe(map(() => contrato))),
      )),
      tap(() => (this.cache = null)),
      switchMap((c) => this.obtener(c.id)),
    );
  }

  /**
   * PUT /api/colaboradores/{id}/contratos/{contratoId}: proyectos, fecha de inicio, referencia y
   * observaciones (todo lo demás del mismo formulario, igual que al registrar). FechaFin/Indefinido
   * no se editan aquí (RN 12): para extender la vigencia se usa una Adenda.
   */
  editar(id: string, request: EditarContratoRequest): Observable<ContratoDetalle> {
    return this.colaboradorDe(id).pipe(
      switchMap((colaboradorId) => this.http.put<BeContrato>(`${this.be.api}/colaboradores/${colaboradorId}/contratos/${id}`, {
        proyectoIds: request.tmrProyectoIds, fechaInicio: request.fechaInicio || null,
        referencia: request.referencia, observaciones: request.observaciones,
      }).pipe(
        switchMap((contrato) => this.ejecutarEnOrden(this.pasosConfiguracion(colaboradorId, contrato.id, request.fechaInicio, request))
          .pipe(map(() => contrato))),
      )),
      tap(() => (this.cache = null)),
      switchMap(() => this.obtener(id)),
    );
  }

  /**
   * Uno detrás de otro, nunca en paralelo: cada paso (cuenta, clasificación, frecuencia) recalcula en
   * el backend el estado Configurado/Pendiente leyendo lo que ya está guardado. En paralelo, cada
   * uno veía los datos de los otros todavía sin guardar y el último en terminar dejaba "Pendiente"
   * aunque el colaborador tuviera todo. En orden, el último paso ve todo lo anterior.
   */
  private ejecutarEnOrden(pasos: Observable<unknown>[]): Observable<unknown[]> {
    return concat(...pasos).pipe(toArray());
  }

  /** Los mismos pasos opcionales que acompañan tanto a Registrar como a Editar un contrato. */
  private pasosConfiguracion(
    colaboradorId: string, contratoId: string, fechaInicio: string, config: ConfiguracionColaboradorForm,
  ): Observable<unknown>[] {
    const pasos: Observable<unknown>[] = [of(null)];

    for (const h of config.honorarios) {
      if (h.importeMensual === null) continue;
      pasos.push(this.http.post(`${this.be.api}/colaboradores/${colaboradorId}/condiciones-economicas`, {
        proyectoId: h.tmrProyectoId, contratoId, importeMensual: h.importeMensual, modalidad: h.modalidad,
        mesInicioVigencia: h.mesInicioVigencia ?? diaUno(fechaInicio), observaciones: null,
        reemplazar: !!h.mesInicioVigencia,
      }));
    }

    if (config.cuentaBancaria) {
      pasos.push(this.http.put(`${this.be.api}/colaboradores/${colaboradorId}/cuenta-bancaria`, config.cuentaBancaria));
    }

    if (config.clasificacion) {
      pasos.push(this.colaboradoresApi.actualizarClasificacion(colaboradorId, config.clasificacion));
    }

    if (config.frecuencia) {
      const nueva = config.frecuencia;
      // Si ya hay una frecuencia programada para ese mes (aún no empieza), se corrige esa en vez de
      // registrar otra: el backend no admite dos frecuencias desde el mismo mes.
      pasos.push(this.colaboradoresApi.listarFrecuencias(colaboradorId).pipe(
        switchMap((frecuencias) => {
          const programada = frecuencias.find((f) => f.vigenteDesdeMes === nueva.vigenteDesdeMes);
          return programada && programada.vigenteDesdeMes > primerDia(periodoActual())
            ? this.colaboradoresApi.editarFrecuencia(colaboradorId, programada.id, nueva)
            : this.colaboradoresApi.registrarFrecuencia(colaboradorId, nueva);
        }),
      ));
    }

    return pasos;
  }

  /** Clasificación, frecuencia vigente y cuenta activa del colaborador, para precargar el formulario. */
  configuracionActual(tmrColaboradorId: string): Observable<ColaboradorDetalle> {
    return this.be.idRps(tmrColaboradorId).pipe(switchMap((id) => this.colaboradoresApi.obtener(id)));
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

  /** PUT .../contratos/{id}/adendas/{adendaId}: corrige una adenda ya registrada (ej. fecha mal escrita). */
  editarAdenda(id: string, adendaId: string, request: RegistrarAdendaRequest): Observable<ContratoDetalle> {
    return this.colaboradorDe(id).pipe(
      switchMap((colaboradorId) => this.http.put<BeAdenda>(`${this.be.api}/colaboradores/${colaboradorId}/contratos/${id}/adendas/${adendaId}`,
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

  /**
   * Colaborador + proyecto de cada asignación que viene de TMR, para registrar o editar un
   * contrato. excluirContratoId: al editar, ese contrato no cuenta como "ya tiene contrato
   * vigente" de sus propios proyectos (si no, nunca se podría volver a guardar con los mismos).
   */
  asignacionesDisponibles(excluirContratoId: string | null = null): Observable<AsignacionDisponible[]> {
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
        tieneContratoVigente: contratos.some((x) =>
          x.id !== excluirContratoId && x.vigente && x.proyectos.some((p) => p.proyectoId === a.proyectoId)),
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
