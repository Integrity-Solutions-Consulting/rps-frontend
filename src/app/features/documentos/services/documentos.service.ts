import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DocumentoMensual, FilaDocumento, RegistrarDocumentoRequest } from '../models/documento.models';

/** Llamadas a /api/documentos (endpoint propuesto; hoy responde el mock). */
@Injectable({ providedIn: 'root' })
export class DocumentosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/documentos`;

  /** GET /api/documentos?periodo=2026-11 · un renglón por colaborador liquidado, con o sin documento */
  listar(periodo: string): Observable<FilaDocumento[]> {
    return this.http.get<FilaDocumento[]>(this.base, { params: new HttpParams().set('periodo', periodo) });
  }

  /** POST /api/documentos · el detalle por proyecto lo arma el backend desde la liquidación */
  registrar(request: RegistrarDocumentoRequest): Observable<DocumentoMensual> {
    return this.http.post<DocumentoMensual>(this.base, request);
  }

  /** PUT /api/documentos/{id} · corrige y conserva la versión anterior */
  corregir(id: string, request: RegistrarDocumentoRequest): Observable<DocumentoMensual> {
    return this.http.put<DocumentoMensual>(`${this.base}/${id}`, request);
  }
}
