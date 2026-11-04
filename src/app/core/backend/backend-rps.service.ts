import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { rutaConMock } from '../mocks/mock-config';
import { TmrColaborador, nombreCompleto } from '../../features/integracion-tmr/models/tmr.models';
import { BeColaborador, BeConfiguracion, BeProyecto } from './backend-rps.models';

/**
 * Piezas comunes para los servicios que hablan con rps-backend:
 *   - si una ruta se responde con datos de ejemplo o con el backend real;
 *   - colaboradores, proyectos y configuración (los usan casi todos los módulos);
 *   - nombres de TMR: con el backend real vienen en GET /api/colaboradores (copia de TMR que guarda la sincronización);
 *   - errores con el mismo formato que el backend, para leerErrorApi.
 *
 * Patrón de cada servicio adaptado:
 *   metodo() {
 *     if (usaMock('/contratos')) return this.http.get(...);   // core/mocks (npm start)
 *     return <rutas de rps-backend>.pipe(map(convertir));      // backend real (npm run start:api)
 *   }
 */
@Injectable({ providedIn: 'root' })
export class BackendRps {
  private readonly http = inject(HttpClient);
  readonly api = environment.apiUrl;

  /** true si esa ruta (sin /api) se responde con core/mocks. */
  usaMock(ruta: string): boolean {
    return rutaConMock(ruta);
  }

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
   * Nombres por ID de TMR.
   *   - Backend real: salen de GET /api/colaboradores (nombres, apellidos, identificación y correo de TMR).
   *   - npm start: de core/mocks/tmr.mock.ts (/integracion-tmr/colaboradores).
   * Si no hay nombre (colaborador creado a mano o TMR sin sincronizar), se muestra "ID TMR x".
   */
  nombres(): Observable<Map<string, TmrColaborador>> {
    if (!this.usaMock('/integracion-tmr')) return this.colaboradores().pipe(map(mapaDeNombres));
    return this.http.get<TmrColaborador[]>(`${this.api}/integracion-tmr/colaboradores`).pipe(
      map((l) => new Map(l.map((p) => [p.tmrColaboradorId, p]))),
      catchError(() => of(new Map<string, TmrColaborador>())),
    );
  }

  nombreDe(nombres: Map<string, TmrColaborador>, tmrColaboradorId: string): string {
    const p = nombres.get(tmrColaboradorId);
    const nombre = p ? nombreCompleto(p) : '';
    return nombre || `ID TMR ${tmrColaboradorId}`;
  }

  /** Colaboradores + nombres. Con el backend real es una sola llamada: la lista ya trae los nombres. */
  colaboradoresConNombre(): Observable<{ lista: BeColaborador[]; nombres: Map<string, TmrColaborador> }> {
    if (!this.usaMock('/integracion-tmr'))
      return this.colaboradores().pipe(map((lista) => ({ lista, nombres: mapaDeNombres(lista) })));
    return forkJoin({ lista: this.colaboradores(), nombres: this.nombres() });
  }

  /** Error con forma ProblemDetails, para que las pantallas lo muestren igual que uno del backend. */
  error(status: number, codigo: string, detail: string): Observable<never> {
    return throwError(() => new HttpErrorResponse({ status, error: { title: 'Error', status, detail, codigo } }));
  }
}

/** "2026-10" → "2026-10-01" (el backend recibe meses como DateOnly del primer día). */
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

export const diaUno = (periodo: string): string => `${periodo.slice(0, 7)}-01`;
/** "2026-10-01" → "2026-10" */
export const mesDe = (fecha: string): string => fecha.slice(0, 7);
