import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { HonorarioProyecto, HonorarioVigencia, ProgramarHonorarioRequest } from '../models/honorario.models';
import { BackendRps } from '../../../core/backend/backend-rps.service';
import { BeAsignacion, BeCondicion, BeContrato } from '../../../core/backend/backend-rps.models';
import { hoy } from '../../../shared/utils/fechas';
import { periodoActual } from '../../../shared/utils/periodo';

/**
 * Honorario mensual por proyecto (RN 17 a 19).
 *   npm start          → /api/honorarios de core/mocks/honorarios.mock.ts
 *   npm run start:api  → rps-backend: /api/colaboradores/{id}/condiciones-economicas
 *                        (su nombre para "honorario por proyecto"), con /historial, /cancelar y /restaurar.
 */
@Injectable({ providedIn: 'root' })
export class HonorariosService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/honorarios`;
  /** condicionId → colaboradorId de RPS: el backend pide los dos en la ruta. */
  private readonly duenoDe = new Map<string, string>();

  /** Un registro por proyecto asignado, con su honorario vigente, el programado y el historial. */
  porColaborador(tmrColaboradorId: string): Observable<HonorarioProyecto[]> {
    if (this.be.usaMock('/honorarios'))
      return this.http.get<HonorarioProyecto[]>(this.base, { params: new HttpParams().set('tmrColaboradorId', tmrColaboradorId) });

    return this.be.idRps(tmrColaboradorId).pipe(
      switchMap((id) => forkJoin({
        asignaciones: this.http.get<BeAsignacion[]>(`${this.be.api}/colaboradores/${id}/asignaciones`),
        condiciones: this.http.get<BeCondicion[]>(`${this.be.api}/colaboradores/${id}/condiciones-economicas/historial`),
      })),
      map(({ asignaciones, condiciones }) => {
        const mes = `${periodoActual()}-01`;
        const proyectos = new Map<string, { nombre: string; activa: boolean }>();
        for (const a of asignaciones)
          proyectos.set(a.proyectoId, { nombre: a.proyectoNombre, activa: a.fechaSalida === null || a.fechaSalida >= hoy() });
        for (const c of condiciones) {
          this.duenoDe.set(c.id, c.colaboradorId);
          if (!proyectos.has(c.proyectoId)) proyectos.set(c.proyectoId, { nombre: c.proyectoNombre, activa: false });
        }
        return [...proyectos.entries()].map(([proyectoId, p]): HonorarioProyecto => {
          const historial = condiciones
            .filter((c) => c.proyectoId === proyectoId)
            .sort((a, b) => b.mesInicioVigencia.localeCompare(a.mesInicioVigencia) || a.creadoEn.localeCompare(b.creadoEn))
            .map((c) => this.aVigencia(c));
          const activas = historial.filter((v) => !v.canceladoEn);
          return {
            tmrProyectoId: proyectoId, proyecto: p.nombre, cliente: null, asignacionActiva: p.activa,
            vigente: activas.find((v) => v.vigenteDesdeMes <= mes) ?? null,
            programado: [...activas].reverse().find((v) => v.vigenteDesdeMes > mes) ?? null,
            historial,
          };
        }).sort((x, y) => Number(y.asignacionActiva) - Number(x.asignacionActiva) || x.proyecto.localeCompare(y.proyecto));
      }),
    );
  }

  /**
   * Registra o programa un honorario desde un mes (RN 19).
   * El backend exige el contrato del proyecto: se usa el que cubre ese mes (o el más reciente).
   */
  programar(request: ProgramarHonorarioRequest): Observable<HonorarioVigencia> {
    if (this.be.usaMock('/honorarios')) return this.http.post<HonorarioVigencia>(this.base, request);

    return this.be.idRps(request.tmrColaboradorId).pipe(
      switchMap((id) => this.http.get<BeContrato[]>(`${this.be.api}/colaboradores/${id}/contratos`).pipe(map((contratos) => ({ id, contratos })))),
      switchMap(({ id, contratos }) => {
        const delProyecto = contratos
          .filter((c) => c.proyectoId === request.tmrProyectoId)
          .sort((a, b) => b.fechaFinVigente.localeCompare(a.fechaFinVigente));
        const contrato = delProyecto.find((c) => c.fechaInicio <= finDeMes(request.vigenteDesdeMes) && c.fechaFinVigente >= request.vigenteDesdeMes) ?? delProyecto[0];
        if (!contrato)
          return this.be.error(409, 'Honorario.SinContrato', 'Este proyecto no tiene contrato. Regístralo primero en Contratos: el honorario se asocia a un contrato.');
        return this.http.post<BeCondicion>(`${this.be.api}/colaboradores/${id}/condiciones-economicas`, {
          proyectoId: request.tmrProyectoId, contratoId: contrato.id, importeMensual: request.importe,
          modalidad: request.modalidad, mesInicioVigencia: request.vigenteDesdeMes, observaciones: null,
        }).pipe(map((c) => this.aVigencia({ ...c, creadoEn: new Date().toISOString(), canceladoEn: null })));
      }),
    );
  }

  /** Cancela un cambio que aún no rige. No se borra: queda en el historial y se puede restaurar. */
  cancelarProgramado(id: string): Observable<HonorarioVigencia> {
    if (this.be.usaMock('/honorarios')) return this.http.post<HonorarioVigencia>(`${this.base}/${id}/cancelar`, {});
    return this.http.post<BeCondicion>(`${this.be.api}/colaboradores/${this.duenoDe.get(id)}/condiciones-economicas/${id}/cancelar`, {})
      .pipe(map((c) => this.aVigencia(c)));
  }

  /** Deshace la cancelación (botón "Deshacer"). */
  restaurar(id: string): Observable<HonorarioVigencia> {
    if (this.be.usaMock('/honorarios')) return this.http.post<HonorarioVigencia>(`${this.base}/${id}/restaurar`, {});
    return this.http.post<BeCondicion>(`${this.be.api}/colaboradores/${this.duenoDe.get(id)}/condiciones-economicas/${id}/restaurar`, {})
      .pipe(map((c) => this.aVigencia(c)));
  }

  private aVigencia(c: BeCondicion): HonorarioVigencia {
    return {
      id: c.id, importe: c.importeMensual, modalidad: c.modalidad, vigenteDesdeMes: c.mesInicioVigencia,
      registradoEn: c.creadoEn, canceladoEn: c.canceladoEn,
    };
  }
}

/** "2026-11-01" → "2026-11-30" */
function finDeMes(primerDia: string): string {
  const [a, m] = primerDia.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${primerDia.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`;
}
