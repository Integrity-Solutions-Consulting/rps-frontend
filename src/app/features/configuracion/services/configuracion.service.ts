import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CambiarParametroRequest, ClaveParametro, Configuracion, ParametroVigente } from '../models/configuracion.models';
import { BackendRps } from '../../../core/backend/backend-rps.service';
import { BeConfiguracion } from '../../../core/backend/backend-rps.models';
import { periodoActual } from '../../../shared/utils/periodo';

/** Días de alerta y bancos mientras el backend no los guarde. */
const ALERTAS_FIJAS = [30, 15, 7];
const BANCOS_FIJOS = [
  'Banco Pichincha', 'Banco Guayaquil', 'Produbanco', 'Banco del Pacífico', 'Banco Bolivariano',
  'Banco Internacional', 'Banco de Loja', 'Cooperativa JEP',
];

/** Campo de rps-backend (ConfiguracionGlobal) que corresponde a cada parámetro de la pantalla. */
const CAMPO: Partial<Record<ClaveParametro, keyof BeConfiguracion>> = {
  LimiteAnticiposPct: 'porcentajeMaximoAnticipo',
  IvaPct: 'porcentajeIva',
  RetencionFuentePct: 'porcentajeRetencionFuente',
  RetencionIvaProfesionalPct: 'porcentajeRetencionIvaProfesional',
  RetencionIvaJuniorPct: 'porcentajeRetencionIvaJunior',
};

/**
 * Parámetros del sistema.
 *   npm start          → /api/configuracion de core/mocks (vigencias por mes, alertas, bancos, historial)
 *   npm run start:api  → rps-backend: GET y PUT /api/configuracion (un solo registro).
 *                        Los cambios rigen de inmediato; los honorarios ya generados guardan los
 *                        porcentajes que usaron (RN 29). Alertas y bancos quedan fijos por ahora.
 */
@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/configuracion`;

  obtener(): Observable<Configuracion> {
    if (this.be.usaMock('/configuracion')) return this.http.get<Configuracion>(this.base);
    return this.be.configuracion().pipe(map((c) => this.aConfiguracion(c)));
  }

  /** Cambia un parámetro. Con rps-backend se envía el registro completo con ese valor cambiado. */
  cambiarParametro(clave: ClaveParametro, request: CambiarParametroRequest): Observable<ParametroVigente> {
    if (this.be.usaMock('/configuracion')) return this.http.put<ParametroVigente>(`${this.base}/parametros/${clave}`, request);
    const campo = CAMPO[clave];
    if (!campo) return this.be.error(409, 'Configuracion.NoDisponible', 'El backend todavía no guarda los días de alerta.');
    return this.be.configuracion().pipe(
      switchMap((actual) => this.http.put<BeConfiguracion>(this.base, { ...actual, [campo]: request.valores[0] })),
      map((c) => this.aConfiguracion(c).parametros.find((p) => p.clave === clave)!),
    );
  }

  cancelarProgramado(clave: ClaveParametro): Observable<void> {
    if (this.be.usaMock('/configuracion')) return this.http.delete<void>(`${this.base}/parametros/${clave}/programado`);
    return this.be.error(409, 'Configuracion.NoDisponible', 'El backend aplica los cambios de inmediato: no hay cambios programados.');
  }

  guardarBancos(bancos: string[]): Observable<string[]> {
    if (this.be.usaMock('/configuracion')) return this.http.put<string[]>(`${this.base}/bancos`, { bancos });
    return this.be.error(409, 'Configuracion.NoDisponible', 'El backend todavía no guarda el catálogo de bancos.');
  }

  private aConfiguracion(c: BeConfiguracion): Configuracion {
    const desde = c.actualizadoEn ? c.actualizadoEn.slice(0, 7) : periodoActual();
    const parametro = (clave: ClaveParametro, valores: number[]): ParametroVigente =>
      ({ clave, valores, vigenteDesde: desde, programado: null, aplicaDesde: 'Inmediato' });
    return {
      capacidades: { vigencias: false, alertas: false, bancos: false },
      parametros: [
        parametro('AlertasDias', ALERTAS_FIJAS),
        ...(Object.entries(CAMPO) as [ClaveParametro, keyof BeConfiguracion][]).map(([clave, campo]) => parametro(clave, [Number(c[campo])])),
      ],
      bancos: BANCOS_FIJOS,
      historial: [],
    };
  }
}
