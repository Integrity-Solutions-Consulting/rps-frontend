import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CambiarParametroRequest, ClaveParametro, Configuracion, ParametroVigente } from '../models/configuracion.models';

/** Llamadas a /api/configuracion (endpoint propuesto; hoy responde el mock). */
@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/configuracion`;

  /** GET /api/configuracion · parámetros vigentes, programados, catálogo de bancos e historial */
  obtener(): Observable<Configuracion> {
    return this.http.get<Configuracion>(this.base);
  }

  /** PUT /api/configuracion/parametros/{clave} · las alertas rigen de inmediato; el resto desde el mes siguiente */
  cambiarParametro(clave: ClaveParametro, request: CambiarParametroRequest): Observable<ParametroVigente> {
    return this.http.put<ParametroVigente>(`${this.base}/parametros/${clave}`, request);
  }

  /** DELETE /api/configuracion/parametros/{clave}/programado · cancela un cambio que aún no rige */
  cancelarProgramado(clave: ClaveParametro): Observable<void> {
    return this.http.delete<void>(`${this.base}/parametros/${clave}/programado`);
  }

  /** PUT /api/configuracion/bancos */
  guardarBancos(bancos: string[]): Observable<string[]> {
    return this.http.put<string[]>(`${this.base}/bancos`, { bancos });
  }
}
