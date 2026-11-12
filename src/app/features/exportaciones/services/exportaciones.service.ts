import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ArchivoDescargado, FormatoExportacion, TipoExportacion, VistaLiquidaciones } from '../models/exportacion.models';
import { diaUno } from '../../../core/backend/backend-rps.service';

/** Descarga los reportes en Excel o PDF de /api/exportaciones (rps-backend). */
@Injectable({ providedIn: 'root' })
export class ExportacionesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/exportaciones`;

  /** El nombre del archivo lo pone el backend (Content-Disposition). `periodo` = "yyyy-MM" o null para todos. */
  descargar(tipo: TipoExportacion, periodo: string | null, formato: FormatoExportacion, vista?: VistaLiquidaciones): Observable<ArchivoDescargado> {
    let params = new HttpParams();
    if (periodo && tipo !== 'colaboradores') params = params.set('periodo', diaUno(periodo));
    if (vista && tipo === 'liquidaciones') params = params.set('vista', vista);
    const ruta = formato === 'pdf' ? `${this.base}/${tipo}/pdf` : `${this.base}/${tipo}`;
    return this.http.get(ruta, { params, responseType: 'blob', observe: 'response' }).pipe(
      map((r) => ({
        nombre: nombreDeArchivo(r.headers.get('Content-Disposition')) ?? `${tipo}.${formato}`,
        contenido: r.body ?? new Blob(),
      })),
    );
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
