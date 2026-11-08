import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ArchivoDescargado, ExportacionPago, FormatoExportacion, ItemExportacionPago, PreviewExportacionPago, TipoExportacion,
} from '../models/exportacion.models';
import { diaUno, mesDe } from '../../../core/backend/backend-rps.service';
import { BeExportacionPago, BePreviewExportacionPago } from '../../../core/backend/backend-rps.models';
import { SessionService } from '../../../core/services/session.service';
import { TipoCorte } from '../../../shared/models/corte';

/** Descarga los CSV (y el PDF de liquidaciones) de /api/exportaciones (rps-backend). */
@Injectable({ providedIn: 'root' })
export class ExportacionesService {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(SessionService);
  private readonly base = `${environment.apiUrl}/exportaciones`;
  private readonly basePago = `${this.base}/pago`;

  /** El nombre del archivo lo pone el backend (Content-Disposition). `periodo` = "yyyy-MM" o null para todos. */
  descargar(tipo: TipoExportacion, periodo: string | null, formato: FormatoExportacion = 'csv'): Observable<ArchivoDescargado> {
    let params = new HttpParams();
    if (periodo && tipo !== 'colaboradores') params = params.set('periodo', diaUno(periodo));
    const ruta = formato === 'pdf' ? `${this.base}/${tipo}/pdf` : `${this.base}/${tipo}`;
    return this.http.get(ruta, { params, responseType: 'blob', observe: 'response' }).pipe(
      map((r) => ({
        nombre: nombreDeArchivo(r.headers.get('Content-Disposition')) ?? `${tipo}.${formato}`,
        contenido: r.body ?? new Blob(),
      })),
    );
  }

  // ── Excel de pago por corte (RN 52-57) ──────────────────────────────────

  /** GET .../pago/preview?periodo=...&corte=... */
  previsualizarPago(periodo: string, corte: TipoCorte): Observable<PreviewExportacionPago> {
    const params = new HttpParams().set('periodo', diaUno(periodo)).set('corte', corte);
    return this.http.get<BePreviewExportacionPago>(`${this.basePago}/preview`, { params }).pipe(
      map((p): PreviewExportacionPago => ({
        periodo: mesDe(p.periodo), corte: p.corte, versionSiguiente: p.versionSiguiente, total: p.total,
        items: p.items.map((i): ItemExportacionPago => ({
          colaboradorId: i.colaboradorId, colaborador: i.colaborador, importe: i.importe,
          tieneCuentaBancaria: i.tieneCuentaBancaria, advertencias: i.advertencias,
        })),
      })),
    );
  }

  /** POST .../pago · genera una versión nueva para (periodo, corte) con los colaboradores elegidos. */
  generarPago(periodo: string, corte: TipoCorte, colaboradorIds: string[]): Observable<ExportacionPago> {
    return this.http.post<BeExportacionPago>(this.basePago, { periodo: diaUno(periodo), corte, colaboradorIds })
      .pipe(map((e) => this.aExportacionPago(e)));
  }

  /** GET .../pago?periodo=...&corte=... · historial de versiones (ambos filtros opcionales). */
  listarPago(periodo: string | null, corte: TipoCorte | null): Observable<ExportacionPago[]> {
    let params = new HttpParams();
    if (periodo) params = params.set('periodo', diaUno(periodo));
    if (corte) params = params.set('corte', corte);
    return this.http.get<BeExportacionPago[]>(this.basePago, { params }).pipe(
      map((lista) => lista.map((e) => this.aExportacionPago(e))),
    );
  }

  /** GET .../pago/{id}/descargar · lee el archivo ya generado, no vuelve a calcular nada. */
  descargarPago(id: string): Observable<ArchivoDescargado> {
    return this.http.get(`${this.basePago}/${id}/descargar`, { responseType: 'blob', observe: 'response' }).pipe(
      map((r) => ({
        nombre: nombreDeArchivo(r.headers.get('Content-Disposition')) ?? 'pago.xlsx',
        contenido: r.body ?? new Blob(),
      })),
    );
  }

  private aExportacionPago(e: BeExportacionPago): ExportacionPago {
    return {
      id: e.id, periodo: mesDe(e.periodo), corte: e.corte, version: e.version,
      generadoPorMi: e.generadoPor === this.sesion.usuario()?.id,
      generadoEn: e.generadoEn, nombreArchivo: e.nombreArchivo, total: e.total, colaboradores: e.items.length,
    };
  }
}

/** `attachment; filename=honorarios_2026-11.csv; filename*=UTF-8''...` → "honorarios_2026-11.csv" */
function nombreDeArchivo(cabecera: string | null): string | null {
  if (!cabecera) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecera);
  if (utf8) return decodeURIComponent(utf8[1]);
  const simple = /filename="?([^";]+)"?/i.exec(cabecera);
  return simple ? simple[1] : null;
}
