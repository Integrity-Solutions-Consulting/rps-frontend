import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ArchivoDescargado, FiltroHistorial, FormatoExportacion, PaginaExportaciones, TipoExportacion, UltimaExportacion,
  VistaLiquidaciones,
} from '../models/exportacion.models';
import { diaUno } from '../../../core/backend/backend-rps.service';

/** Reportes en Excel o PDF de /api/exportaciones (rps-backend) y su historial. */
@Injectable({ providedIn: 'root' })
export class ExportacionesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/exportaciones`;

  /**
   * POST .../{tipo}[/pdf] · genera el archivo y el backend lo registra en el historial.
   * El nombre del archivo lo pone el backend (Content-Disposition). `periodo` = "yyyy-MM" o null para todos.
   */
  descargar(tipo: TipoExportacion, periodo: string | null, formato: FormatoExportacion, vista?: VistaLiquidaciones | null): Observable<ArchivoDescargado> {
    const cuerpo = tipo === 'colaboradores' ? null : {
      periodo: periodo ? diaUno(periodo) : null,
      ...(tipo === 'liquidaciones' && vista ? { vista } : {}),
    };
    const ruta = formato === 'pdf' ? `${this.base}/${tipo}/pdf` : `${this.base}/${tipo}`;
    return this.http.post(ruta, cuerpo, { responseType: 'blob', observe: 'response' }).pipe(
      map((r) => ({
        nombre: nombreDeArchivo(r.headers.get('Content-Disposition')) ?? `${tipo}.${formato}`,
        contenido: r.body ?? new Blob(),
      })),
    );
  }

  /** GET .../historial · de lo más nuevo a lo más antiguo; el backend pagina y dice si los datos cambiaron. */
  historial(f: FiltroHistorial): Observable<PaginaExportaciones> {
    let params = new HttpParams().set('pagina', f.pagina).set('tamano', f.tamano);
    if (f.todos) params = params.set('todos', true);
    else if (f.periodo) params = params.set('periodo', diaUno(f.periodo));
    if (f.tipo) params = params.set('tipo', f.tipo);
    return this.http.get<PaginaExportaciones>(`${this.base}/historial`, { params });
  }

  /** GET .../ultimas · la última exportación de cada reporte para ese mes (null = "todos los meses"). */
  ultimas(periodo: string | null): Observable<UltimaExportacion[]> {
    const params = periodo ? new HttpParams().set('periodo', diaUno(periodo)) : undefined;
    return this.http.get<UltimaExportacion[]>(`${this.base}/ultimas`, { params });
  }
}

/** `attachment; filename=honorarios_2026-11.xlsx; filename*=UTF-8''...` → "honorarios_2026-11.xlsx" */
function nombreDeArchivo(cabecera: string | null): string | null {
  if (!cabecera) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecera);
  if (utf8) return decodeURIComponent(utf8[1]);
  const simple = /filename="?([^";]+)"?/i.exec(cabecera);
  return simple ? simple[1] : null;
}
