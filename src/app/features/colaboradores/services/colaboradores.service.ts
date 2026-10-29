import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ColaboradorDetalle, EventoHistorial, ColaboradorResumen, CrearColaboradorRequest, CuentaBancaria, FiltrosColaboradores,
  FrecuenciaVigencia, Clasificacion, RegistrarCuentaBancariaRequest, RegistrarFrecuenciaRequest,
} from '../models/colaborador.models';

/** Llamadas a /api/colaboradores (Features/Colaboradores/Api/ColaboradoresEndpoints.cs). */
@Injectable({ providedIn: 'root' })
export class ColaboradoresService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/colaboradores`;

  /** GET /api/colaboradores?estado=Pendiente&activo=true */
  listar(filtros: FiltrosColaboradores): Observable<ColaboradorResumen[]> {
    let params = new HttpParams();
    if (filtros.estado) params = params.set('estado', filtros.estado);
    if (filtros.activo !== null) params = params.set('activo', String(filtros.activo));
    return this.http.get<ColaboradorResumen[]>(this.base, { params });
  }

  /** GET /api/colaboradores/{id} */
  obtener(id: string): Observable<ColaboradorDetalle> {
    return this.http.get<ColaboradorDetalle>(`${this.base}/${id}`);
  }

  /** POST /api/colaboradores · vincula una persona de TMR (temporal hasta la sincronización) */
  crear(request: CrearColaboradorRequest): Observable<ColaboradorDetalle> {
    return this.http.post<ColaboradorDetalle>(this.base, request);
  }

  /** PUT /api/colaboradores/{id}/clasificacion */
  actualizarClasificacion(id: string, clasificacion: Clasificacion | null): Observable<ColaboradorDetalle> {
    return this.http.put<ColaboradorDetalle>(`${this.base}/${id}/clasificacion`, { clasificacion });
  }

  /** POST /api/colaboradores/{id}/activar | desactivar */
  cambiarActivo(id: string, activo: boolean): Observable<ColaboradorDetalle> {
    return this.http.post<ColaboradorDetalle>(`${this.base}/${id}/${activo ? 'activar' : 'desactivar'}`, null);
  }

  /** GET /api/colaboradores/{id}/frecuencias · historial, de la más reciente a la más antigua */
  listarFrecuencias(id: string): Observable<FrecuenciaVigencia[]> {
    return this.http.get<FrecuenciaVigencia[]>(`${this.base}/${id}/frecuencias`);
  }

  /** POST /api/colaboradores/{id}/frecuencias */
  registrarFrecuencia(id: string, request: RegistrarFrecuenciaRequest): Observable<FrecuenciaVigencia> {
    return this.http.post<FrecuenciaVigencia>(`${this.base}/${id}/frecuencias`, request);
  }

  /** PUT /api/colaboradores/{id}/frecuencias/{frecuenciaId} · solo meses que aún no empiezan */
  editarFrecuencia(id: string, frecuenciaId: string, request: RegistrarFrecuenciaRequest): Observable<FrecuenciaVigencia> {
    return this.http.put<FrecuenciaVigencia>(`${this.base}/${id}/frecuencias/${frecuenciaId}`, request);
  }

  /** DELETE /api/colaboradores/{id}/frecuencias/{frecuenciaId} · solo meses que aún no empiezan */
  eliminarFrecuencia(id: string, frecuenciaId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/frecuencias/${frecuenciaId}`);
  }

  /** GET /api/colaboradores/{id}/historial · propuesto: une movimientos de colaborador, contratos y honorarios */
  historial(id: string): Observable<EventoHistorial[]> {
    return this.http.get<EventoHistorial[]>(`${this.base}/${id}/historial`);
  }

  /** PUT /api/colaboradores/{id}/cuenta-bancaria · reemplaza la activa; la anterior queda de historial */
  registrarCuentaBancaria(id: string, request: RegistrarCuentaBancariaRequest): Observable<CuentaBancaria> {
    return this.http.put<CuentaBancaria>(`${this.base}/${id}/cuenta-bancaria`, request);
  }
}
