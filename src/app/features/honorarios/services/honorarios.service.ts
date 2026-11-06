import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, switchMap } from 'rxjs';
import { HonorarioProyecto, HonorarioVigencia, ProgramarHonorarioRequest } from '../models/honorario.models';
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
        for (const c of condiciones)
          if (!proyectos.has(c.proyectoId)) proyectos.set(c.proyectoId, { nombre: c.proyectoNombre, enTmr: false });

        return [...proyectos.entries()].map(([proyectoId, p]): HonorarioProyecto => {
          // El backend ya los devuelve del más reciente al más antiguo.
          const historial = condiciones.filter((c) => c.proyectoId === proyectoId).map((c) => this.aVigencia(c));
          return {
            tmrProyectoId: proyectoId, proyecto: p.nombre, cliente: null, asignacionActiva: p.enTmr,
            // Solo se separan para mostrarlos: el que ya empezó a regir y el registrado para un mes futuro.
            vigente: historial.find((v) => v.vigenteDesdeMes <= mes) ?? null,
            programado: historial.find((v) => v.vigenteDesdeMes > mes) ?? null,
            historial,
            contratos: contratos.filter((c) => c.proyectoId === proyectoId).map((c) => ({
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

  private aVigencia(c: BeCondicion): HonorarioVigencia {
    return { id: c.id, importe: c.importeMensual, modalidad: c.modalidad, vigenteDesdeMes: c.mesInicioVigencia, contratoId: c.contratoId };
  }
}
