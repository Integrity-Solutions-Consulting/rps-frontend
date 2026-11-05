import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TmrColaborador, nombreCompleto } from '../../features/integracion-tmr/models/tmr.models';
import { BeColaborador, BeConfiguracion, BeProyecto } from './backend-rps.models';

/**
 * Piezas comunes para los servicios que hablan con rps-backend:
 *   - colaboradores, proyectos y configuración (los usan casi todos los módulos);
 *   - nombres de TMR: vienen en GET /api/colaboradores (copia de TMR que guarda la sincronización);
 *   - errores con el mismo formato que el backend, para leerErrorApi.
 * El frontend no calcula ni decide reglas de negocio: muestra lo que responde el backend.
 */
@Injectable({ providedIn: 'root' })
export class BackendRps {
  private readonly http = inject(HttpClient);
  readonly api = environment.apiUrl;

  colaboradores(): Observable<BeColaborador[]> {
    return this.http.get<BeColaborador[]>(`${this.api}/colaboradores`);
  }

  colaborador(id: string): Observable<BeColaborador> {
    return this.http.get<BeColaborador>(`${this.api}/colaboradores/${id}`);
  }

  /** ID de RPS a partir del ID de TMR (las pantallas de la ficha trabajan con el de TMR). */
  idRps(tmrColaboradorId: string): Observable<string> {
    return this.colaboradores().pipe(switchMap((lista) => {
      const c = lista.find((x) => x.tmrColaboradorId === tmrColaboradorId);
      return c ? of(c.id) : this.error(404, 'Colaborador.NoVinculado', 'La persona no está vinculada en RPS.');
    }));
  }

  proyectos(): Observable<BeProyecto[]> {
    return this.http.get<BeProyecto[]>(`${this.api}/proyectos`);
  }

  configuracion(): Observable<BeConfiguracion> {
    return this.http.get<BeConfiguracion>(`${this.api}/configuracion`);
  }

  /**
   * Nombres por ID de TMR: salen de GET /api/colaboradores (nombres, apellidos, identificación y correo de TMR).
   * Si no hay nombre (colaborador creado a mano o TMR sin sincronizar), se muestra "ID TMR x".
   */
  nombres(): Observable<Map<string, TmrColaborador>> {
    return this.colaboradores().pipe(map(mapaDeNombres));
  }

  nombreDe(nombres: Map<string, TmrColaborador>, tmrColaboradorId: string): string {
    const p = nombres.get(tmrColaboradorId);
    const nombre = p ? nombreCompleto(p) : '';
    return nombre || `ID TMR ${tmrColaboradorId}`;
  }

  /** Colaboradores + nombres en una sola llamada: la lista ya trae los nombres. */
  colaboradoresConNombre(): Observable<{ lista: BeColaborador[]; nombres: Map<string, TmrColaborador> }> {
    return this.colaboradores().pipe(map((lista) => ({ lista, nombres: mapaDeNombres(lista) })));
  }

  /** Error con forma ProblemDetails, para que las pantallas lo muestren igual que uno del backend. */
  error(status: number, codigo: string, detail: string): Observable<never> {
    return throwError(() => new HttpErrorResponse({ status, error: { title: 'Error', status, detail, codigo } }));
  }
}

/** De la lista de colaboradores del backend (con la copia de TMR) a "persona de TMR" por su ID. */
export function aTmrColaborador(c: BeColaborador): TmrColaborador {
  return {
    tmrColaboradorId: c.tmrColaboradorId,
    nombres: c.nombres ?? '',
    apellidos: c.apellidos ?? '',
    identificacion: c.identificacion ?? '',
    correo: c.correo,
    activo: c.activoEnTmr ?? c.activo,
    ultimaSincronizacion: c.sincronizadoEn ?? '',
  };
}

function mapaDeNombres(lista: BeColaborador[]): Map<string, TmrColaborador> {
  return new Map(lista.map((c) => [c.tmrColaboradorId, aTmrColaborador(c)]));
}

/** "2026-10" → "2026-10-01" (el backend recibe meses como DateOnly del primer día). */
export const diaUno = (periodo: string): string => `${periodo.slice(0, 7)}-01`;
/** "2026-10-01" → "2026-10" */
export const mesDe = (fecha: string): string => fecha.slice(0, 7);
