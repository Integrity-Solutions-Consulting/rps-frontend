import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DetalleDocumento, DocumentoMensual, FilaDocumento, RegistrarDocumentoRequest } from '../models/documento.models';
import { BackendRps, diaUno, mesDe } from '../../../core/backend/backend-rps.service';
import { BeDocumento, BeHonorario, BeLiquidacion, BeProyecto } from '../../../core/backend/backend-rps.models';

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Documento tributario mensual (sección 8).
 *   npm start          → /api/documentos de core/mocks/documentos.mock.ts
 *   npm run start:api  → rps-backend: /api/colaboradores/{id}/documentos-mensuales.
 *                        Qué proyectos cubre sale de los honorarios del mes (GET /api/honorarios?periodo=).
 *                        El backend no guarda observaciones ni versiones anteriores al corregir.
 */
@Injectable({ providedIn: 'root' })
export class DocumentosService {
  private readonly http = inject(HttpClient);
  private readonly be = inject(BackendRps);
  private readonly base = `${environment.apiUrl}/documentos`;

  /** Un renglón por colaborador liquidado en el mes, con o sin documento. */
  listar(periodo: string): Observable<FilaDocumento[]> {
    if (this.be.usaMock('/documentos'))
      return this.http.get<FilaDocumento[]>(this.base, { params: new HttpParams().set('periodo', periodo) });

    const params = new HttpParams().set('periodo', diaUno(periodo));
    return forkJoin({
      liquidaciones: this.http.get<BeLiquidacion[]>(`${this.be.api}/liquidaciones`, { params }),
      honorarios: this.http.get<BeHonorario[]>(`${this.be.api}/honorarios`, { params }),
      proyectos: this.be.proyectos(),
      c: this.be.colaboradoresConNombre(),
    }).pipe(switchMap(({ liquidaciones, honorarios, proyectos, c }) => {
      const ids = [...new Set(liquidaciones.map((l) => l.colaboradorId))];
      if (ids.length === 0) return of([]);
      return forkJoin(ids.map((id) => this.http.get<BeDocumento[]>(`${this.be.api}/colaboradores/${id}/documentos-mensuales`, { params })))
        .pipe(map((docs) => ids.map((id, i): FilaDocumento => {
          const colaborador = c.lista.find((x) => x.id === id);
          const detalle = this.detalle(honorarios.filter((h) => h.colaboradorId === id), proyectos);
          return {
            colaboradorId: id,
            colaborador: colaborador ? this.be.nombreDe(c.nombres, colaborador.tmrColaboradorId) : 'Colaborador',
            periodo,
            totalCalculado: r2(detalle.reduce((s, d) => s + d.importe, 0)),
            proyectos: detalle,
            documento: docs[i][0] ? this.aDocumento(docs[i][0], detalle) : null,
          };
        }).sort((a, b) => a.colaborador.localeCompare(b.colaborador))));
    }));
  }

  registrar(request: RegistrarDocumentoRequest): Observable<DocumentoMensual> {
    if (this.be.usaMock('/documentos')) return this.http.post<DocumentoMensual>(this.base, request);
    return this.http.post<BeDocumento>(`${this.be.api}/colaboradores/${request.colaboradorId}/documentos-mensuales`, {
      periodo: diaUno(request.periodo), tipo: request.tipo, numero: request.numero, fechaEmision: request.fechaEmision,
    }).pipe(map((d) => this.aDocumento(d, [])));
  }

  corregir(id: string, request: RegistrarDocumentoRequest): Observable<DocumentoMensual> {
    if (this.be.usaMock('/documentos')) return this.http.put<DocumentoMensual>(`${this.base}/${id}`, request);
    return this.http.put<BeDocumento>(`${this.be.api}/colaboradores/${request.colaboradorId}/documentos-mensuales/${id}`, {
      tipo: request.tipo, numero: request.numero, fechaEmision: request.fechaEmision,
    }).pipe(map((d) => this.aDocumento(d, [])));
  }

  /** Total del documento por proyecto (subtotal + IVA), para no duplicar lo cubierto (RN 34). */
  private detalle(honorarios: BeHonorario[], proyectos: BeProyecto[]): DetalleDocumento[] {
    return honorarios.map((h) => ({
      tmrProyectoId: h.proyectoId,
      proyecto: proyectos.find((p) => p.id === h.proyectoId)?.nombre ?? 'Proyecto',
      importe: h.totalDocumento,
    }));
  }

  private aDocumento(d: BeDocumento, detalle: DetalleDocumento[]): DocumentoMensual {
    return {
      id: d.id, colaboradorId: d.colaboradorId, periodo: mesDe(d.periodo), tipo: d.tipo, numero: d.numero,
      fechaEmision: d.fechaEmision, observaciones: null, detalle, registradoEn: d.marcadoEn, usuario: 'Contabilidad', correcciones: 0,
    };
  }
}
