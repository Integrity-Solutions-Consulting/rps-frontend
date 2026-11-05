import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ActualizarConfiguracionRequest, Configuracion } from '../models/configuracion.models';

/** GET y PUT /api/configuracion (Features/Configuracion de rps-backend). */
@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/configuracion`;

  obtener(): Observable<Configuracion> {
    return this.http.get<Configuracion>(this.base);
  }

  /** Envía el registro completo; el backend valida y devuelve el guardado. */
  guardar(request: ActualizarConfiguracionRequest): Observable<Configuracion> {
    return this.http.put<Configuracion>(this.base, request);
  }
}
