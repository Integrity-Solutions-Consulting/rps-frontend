import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { CAMPOS_CONFIGURACION } from '../models/configuracion.models';

/** AuditoriaResponse de rps-backend (GET /api/auditoria). */
interface AuditoriaApi {
  id: number;
  entidad: string;
  entidadId: string;
  campo: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  usuarioId: string | null;
  fecha: string;
  motivo: string | null;
}

/** Un cambio de la configuración general, listo para mostrar. */
export interface CambioConfiguracion {
  id: number;
  /** Clave del campo en CAMPOS_CONFIGURACION (razonSocial, porcentajeIva…). */
  clave: string;
  etiqueta: string;
  antes: string;
  despues: string;
  usuarioId: string | null;
  fecha: Date;
  motivo: string | null;
}

/** Máximo que acepta el backend en una consulta (AuditoriaService.ListarAsync). */
const LIMITE_BACKEND = 1000;

/**
 * Historial de cambios de la configuración general (RN 48, RC 03).
 * El backend lo registra solo (AuditoriaInterceptor) y lo expone en GET /api/auditoria, que hoy no tiene
 * filtro por fechas ni paginación: se traen los últimos cambios de la entidad y se filtran en la pantalla.
 */
@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private readonly http = inject(HttpClient);

  cambiosConfiguracion(): Observable<CambioConfiguracion[]> {
    const params = new HttpParams().set('entidad', 'ConfiguracionGlobal').set('limite', LIMITE_BACKEND);
    return this.http.get<AuditoriaApi[]>(`${environment.apiUrl}/auditoria`, { params }).pipe(
      map((lista) => lista.map(convertir).filter((c): c is CambioConfiguracion => c !== null)),
    );
  }

  /**
   * Nombres de los usuarios para mostrar quién hizo cada cambio. GET /api/usuarios solo responde a
   * Administrador y Administrador Contable; para el resto se devuelve un mapa vacío y se muestra "Usuario".
   */
  nombresUsuarios(): Observable<Record<string, string>> {
    return this.http.get<{ id: string; nombre: string }[]>(`${environment.apiUrl}/usuarios`).pipe(
      map((lista) => Object.fromEntries(lista.map((u) => [u.id, u.nombre]))),
      catchError(() => of({})),
    );
  }
}

function convertir(a: AuditoriaApi): CambioConfiguracion | null {
  if (!a.campo) return null;
  const clave = a.campo.charAt(0).toLowerCase() + a.campo.slice(1);
  const campo = CAMPOS_CONFIGURACION.find((c) => c.clave === clave);
  // Solo los campos que se editan en la pantalla (deja fuera ActualizadoEn e Id).
  if (!campo) return null;
  return {
    id: a.id,
    clave,
    etiqueta: campo.etiqueta,
    antes: formatear(a.valorAnterior, campo.tipo),
    despues: formatear(a.valorNuevo, campo.tipo),
    usuarioId: a.usuarioId,
    fecha: aFecha(a.fecha),
    motivo: a.motivo,
  };
}

/** El backend registra la fecha en UTC; si llega sin zona, se interpreta como UTC y no como hora local. */
function aFecha(texto: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(texto) ? texto : `${texto}Z`);
}

/** El backend guarda los decimales como "15.00": se muestran como "15 %" o "12,5 %". */
function formatear(valor: string | null, tipo: string): string {
  if (valor === null || valor === '') return '—';
  if (tipo !== 'porcentaje') return valor;
  const n = Number(valor);
  if (Number.isNaN(n)) return valor;
  return `${n.toLocaleString('es-EC', { maximumFractionDigits: 2 })} %`;
}
