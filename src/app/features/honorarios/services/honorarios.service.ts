import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, switchMap } from 'rxjs';
import { HonorarioContrato, HonorarioProyecto, HonorarioVigencia, ProgramarHonorarioRequest } from '../models/honorario.models';
import { BackendRps } from '../../../core/backend/backend-rps.service';
import { BeAsignacion, BeCondicion, BeContrato } from '../../../core/backend/backend-rps.models';
import { periodoActual } from '../../../shared/utils/periodo';

/**
 * Honorario mensual por proyecto (RN 17). En rps-backend se llama "condición económica":
 *   GET  /api/colaboradores/{id}/condiciones-economicas
 *   POST /api/colaboradores/{id}/condiciones-economicas  (pide proyecto, contrato, importe, modalidad y mes)
 * El backend no permite cancelar ni restaurar un honorario registrado.
 */
@Injectable({ providedIn: 'root' })
export class HonorariosService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);

  /** Un registro por proyecto del colaborador, con los honorarios que tiene registrados y sus contratos. */
  porColaborador(tmrColaboradorId: string): Observable<HonorarioProyecto[]> {
    return this.be.idRps(tmrColaboradorId).pipe(
      switchMap((id) => forkJoin({
        asignaciones: this.http.get<BeAsignacion[]>(`${this.be.api}/colaboradores/${id}/asignaciones`),
        condiciones: this.http.get<BeCondicion[]>(`${this.be.api}/colaboradores/${id}/condiciones-economicas`),
        contratos: this.http.get<BeContrato[]>(`${this.be.api}/colaboradores/${id}/contratos`),
      })),
      map(({ asignaciones, condiciones, contratos }) => {
        const mes = `${periodoActual()}-01`;
        const proyectos = new Map<string, { nombre: string; enTmr: boolean }>();
        for (const a of asignaciones) proyectos.set(a.proyectoId, { nombre: a.proyectoNombre, enTmr: !a.eliminadaEnOrigen });
        // Los de pago por contrato (sin proyecto) no van en esta lista: ver porContrato().
        for (const c of condiciones)
          if (c.proyectoId && !proyectos.has(c.proyectoId)) proyectos.set(c.proyectoId, { nombre: c.proyectoNombre ?? 'Proyecto', enTmr: false });

        return [...proyectos.entries()].map(([proyectoId, p]): HonorarioProyecto => {
          // El backend ya los devuelve del más reciente al más antiguo.
          const historial = condiciones.filter((c) => c.proyectoId === proyectoId).map((c) => this.aVigencia(c));
          return {
            tmrProyectoId: proyectoId, proyecto: p.nombre, cliente: null, asignacionActiva: p.enTmr,
            // Solo se separan para mostrarlos: el que ya empezó a regir y el registrado para un mes futuro.
            vigente: historial.find((v) => v.vigenteDesdeMes <= mes) ?? null,
            programado: historial.find((v) => v.vigenteDesdeMes > mes) ?? null,
            historial,
            contratos: contratos.filter((c) => c.proyectos.some((p) => p.proyectoId === proyectoId)).map((c) => ({
              id: c.id, referencia: c.referencia, fechaInicio: c.fechaInicio, fechaFinVigente: c.fechaFinVigente, vigente: c.vigente,
            })),
          };
        });
      }),
    );
  }

  /** POST /api/colaboradores/{id}/condiciones-economicas. El backend valida contrato, importe, modalidad y mes. */
  programar(request: ProgramarHonorarioRequest): Observable<HonorarioVigencia> {
    return this.be.idRps(request.tmrColaboradorId).pipe(
      switchMap((id) => this.http.post<BeCondicion>(`${this.be.api}/colaboradores/${id}/condiciones-economicas`, {
        proyectoId: request.tmrProyectoId || null, contratoId: request.contratoId || null, importeMensual: request.importe || null,
        modalidad: request.modalidad, mesInicioVigencia: request.vigenteDesdeMes, observaciones: null,
      })),
      map((c) => this.aVigencia(c)),
    );
  }

  /** Contratos que HOY se pagan POR CONTRATO (un solo importe, sin proyecto). Misma regla que el
   * backend: si después del último honorario por contrato se registraron honorarios por proyecto
   * en ese contrato, ya se paga por proyecto y no aparece aquí. */
  porContrato(tmrColaboradorId: string): Observable<HonorarioContrato[]> {
    return this.be.idRps(tmrColaboradorId).pipe(
      switchMap((id) => this.http.get<BeCondicion[]>(`${this.be.api}/colaboradores/${id}/condiciones-economicas`)),
      map((condiciones) => {
        const mes = `${periodoActual()}-01`;
        const contratoIds = [...new Set(condiciones.filter((c) => !c.proyectoId).map((c) => c.contratoId))].filter((contratoId) => {
          const ultimoPorContrato = condiciones.find((c) => !c.proyectoId && c.contratoId === contratoId)!;
          return !condiciones.some((c) => c.proyectoId && c.contratoId === contratoId && c.mesInicioVigencia > ultimoPorContrato.mesInicioVigencia);
        });
        return contratoIds.map((contratoId): HonorarioContrato => {
          // El backend ya los devuelve del más reciente al más antiguo.
          const delContrato = condiciones.filter((c) => !c.proyectoId && c.contratoId === contratoId).map((c) => this.aVigencia(c));
          return {
            contratoId,
            vigente: delContrato.find((v) => v.vigenteDesdeMes <= mes) ?? null,
            programado: delContrato.find((v) => v.vigenteDesdeMes > mes) ?? null,
          };
        });
      }),
    );
  }

  /** Todas las condiciones del colaborador, tal cual las guarda el backend (más reciente primero). */
  condiciones(tmrColaboradorId: string): Observable<BeCondicion[]> {
    return this.be.idRps(tmrColaboradorId).pipe(
      switchMap((id) => this.http.get<BeCondicion[]>(`${this.be.api}/colaboradores/${id}/condiciones-economicas`)),
    );
  }

  private aVigencia(c: BeCondicion): HonorarioVigencia {
    return {
      id: c.id, importe: c.importeMensual, modalidad: c.modalidad, vigenteDesdeMes: c.mesInicioVigencia, contratoId: c.contratoId,
    };
  }
}
