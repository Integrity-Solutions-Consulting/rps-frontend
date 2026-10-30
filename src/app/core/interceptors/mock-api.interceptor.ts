import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, mergeMap, of, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response';
import { mockAlertas, mockResumen, mockVencimientos } from '../mocks/dashboard.mock';
import { RespuestaMock, colaboradoresMock } from '../mocks/colaboradores.mock';
import { rutaConMock } from '../mocks/mock-config';
import { contratosMock } from '../mocks/contratos.mock';
import { honorariosMock } from '../mocks/honorarios.mock';
import { tmrColaborador, tmrColaboradores } from '../mocks/tmr.mock';
import { configuracionMock } from '../mocks/configuracion.mock';
import { anticiposMock } from '../mocks/anticipos.mock';
import { liquidacionesMock } from '../mocks/liquidaciones.mock';
import { documentosMock } from '../mocks/documentos.mock';
import { exportacionesMock } from '../mocks/exportaciones.mock';
import { notificaciones } from '../mocks/notificaciones.mock';
import { EventoHistorial } from '../../features/colaboradores/models/colaborador.models';

const LATENCIA_MS = 300;

/**
 * Responde con datos de ejemplo las rutas listadas en environment.mockRutas.
 *   npm start          → todas las rutas
 *   npm run start:api  → solo las que el backend todavía no tiene (lista en environment.development.ts)
 * Dashboard responde con ApiResponse; Colaboradores responde igual que su backend real
 * (objeto directo y errores ProblemDetails).
 */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);
  const ruta = req.url.slice(environment.apiUrl.length);
  if (!rutaConMock(ruta)) return next(req);

  if (ruta.startsWith('/dashboard')) return responderDashboard(req, ruta);
  if (ruta.startsWith('/colaboradores')) return entregar(req, rutearColaboradores(req, ruta));
  if (ruta.startsWith('/contratos')) return entregar(req, rutearContratos(req, ruta));
  if (ruta.startsWith('/honorarios')) return entregar(req, rutearHonorarios(req, ruta));
  if (ruta.startsWith('/integracion-tmr')) return entregar(req, rutearIntegracionTmr(req, ruta));
  if (ruta.startsWith('/configuracion')) return entregar(req, rutearConfiguracion(req, ruta));
  if (ruta.startsWith('/anticipos')) return entregar(req, rutearAnticipos(req, ruta));
  if (ruta.startsWith('/liquidaciones')) return entregar(req, rutearLiquidaciones(req, ruta));
  if (ruta.startsWith('/documentos')) return entregar(req, rutearDocumentos(req, ruta));
  if (ruta.startsWith('/exportaciones')) return entregar(req, rutearExportaciones(req, ruta));
  if (ruta === '/notificaciones' && req.method === 'GET') return entregar(req, notificaciones(req.params.get('periodo')));

  return entregar(req, { status: 404, body: { title: 'No encontrado', status: 404, detail: `Sin datos de ejemplo para ${ruta}.` } });
};

function responderDashboard(req: HttpRequest<unknown>, ruta: string): Observable<HttpResponse<unknown>> {
  const periodo = req.params.get('periodo') ?? '';
  const responder = <T>(data: T) =>
    of(new HttpResponse<ApiResponse<T>>({
      status: 200, url: req.url, body: { success: true, statusCode: 200, message: 'OK', data },
    })).pipe(delay(LATENCIA_MS));

  switch (ruta) {
    case '/dashboard/resumen': return responder(mockResumen(periodo));
    case '/dashboard/vencimientos': return responder(mockVencimientos());
    case '/dashboard/alertas': return responder(mockAlertas(periodo));
    default: return entregar(req, { status: 404, body: { title: 'No encontrado', status: 404, detail: `Sin datos de ejemplo para ${ruta}.` } });
  }
}

function rutearColaboradores(req: HttpRequest<unknown>, ruta: string): RespuestaMock {
  const partes = ruta.split('/').filter(Boolean); // ['colaboradores', id?, accion?, subId?]
  const [, id, accion, subId] = partes;
  const body = (req.body ?? {}) as Record<string, never>;
  const m = req.method;

  if (!id) {
    if (m === 'GET') return colaboradoresMock.listar(req.params.get('estado'), req.params.get('activo'));
    if (m === 'POST') return colaboradoresMock.crear(body);
  } else if (!accion) {
    if (m === 'GET') return colaboradoresMock.obtener(id);
  } else if (accion === 'clasificacion' && m === 'PUT') {
    return colaboradoresMock.actualizarClasificacion(id, (body as { clasificacion?: never }).clasificacion ?? null);
  } else if ((accion === 'activar' || accion === 'desactivar') && m === 'POST') {
    return colaboradoresMock.cambiarActivo(id, accion === 'activar');
  } else if (accion === 'frecuencias') {
    if (!subId && m === 'GET') return colaboradoresMock.listarFrecuencias(id);
    if (!subId && m === 'POST') return colaboradoresMock.registrarFrecuencia(id, body);
    if (subId && m === 'PUT') return colaboradoresMock.editarFrecuencia(id, subId, body);
    if (subId && m === 'DELETE') return colaboradoresMock.eliminarFrecuencia(id, subId);
  } else if (accion === 'cuenta-bancaria' && m === 'PUT') {
    return colaboradoresMock.registrarCuenta(id, body);
  } else if (accion === 'historial' && m === 'GET') {
    return historialColaborador(id);
  }
  return { status: 405, body: { title: 'Método no permitido', status: 405, detail: `${m} ${ruta} no existe en la API.` } };
}

function rutearContratos(req: HttpRequest<unknown>, ruta: string): RespuestaMock {
  const [, id, accion] = ruta.split('/').filter(Boolean); // ['contratos', id?, accion?]
  const body = (req.body ?? {}) as Record<string, unknown>;
  const m = req.method;

  if (!id && m === 'GET') return contratosMock.listar(req.params.get('estado'), req.params.get('tmrColaboradorId'));
  if (!id && m === 'POST') return contratosMock.registrar(body);
  if (id === 'resumen' && m === 'GET') return contratosMock.contadores();
  if (id && !accion && m === 'GET') return contratosMock.obtener(id);
  if (id && accion === 'adendas' && m === 'POST') return contratosMock.registrarAdenda(id, body);
  return { status: 405, body: { title: 'Método no permitido', status: 405, detail: `${m} ${ruta} no existe en la API.` } };
}

function rutearHonorarios(req: HttpRequest<unknown>, ruta: string): RespuestaMock {
  const [, id, accion] = ruta.split('/').filter(Boolean); // ['honorarios', id?, 'cancelar' | 'restaurar'?]
  if (!id && req.method === 'GET') return honorariosMock.porColaborador(req.params.get('tmrColaboradorId'));
  if (!id && req.method === 'POST') return honorariosMock.programar((req.body ?? {}) as Record<string, unknown>);
  if (id && accion === 'cancelar' && req.method === 'POST') return honorariosMock.cancelar(id);
  if (id && accion === 'restaurar' && req.method === 'POST') return honorariosMock.restaurar(id);
  return { status: 405, body: { title: 'Método no permitido', status: 405, detail: `${req.method} ${ruta} no existe en la API.` } };
}

function rutearIntegracionTmr(req: HttpRequest<unknown>, ruta: string): RespuestaMock {
  const [, recurso, id] = ruta.split('/').filter(Boolean); // ['integracion-tmr', recurso, id?]
  if (req.method !== 'GET') return { status: 405, body: { title: 'Método no permitido', status: 405, detail: 'La copia de TMR es de solo lectura.' } };
  if (recurso === 'asignaciones' && !id) return contratosMock.asignacionesDisponibles();
  if (recurso === 'colaboradores' && !id) return tmrColaboradores();
  if (recurso === 'colaboradores' && id) return tmrColaborador(decodeURIComponent(id));
  return { status: 404, body: { title: 'No encontrado', status: 404, detail: `Sin datos de ejemplo para ${ruta}.` } };
}

const noExiste = (req: HttpRequest<unknown>, ruta: string): RespuestaMock =>
  ({ status: 405, body: { title: 'Método no permitido', status: 405, detail: `${req.method} ${ruta} no existe en la API.` } });
const cuerpo = (req: HttpRequest<unknown>) => (req.body ?? {}) as Record<string, unknown>;

function rutearConfiguracion(req: HttpRequest<unknown>, ruta: string): RespuestaMock {
  const [, recurso, clave, extra] = ruta.split('/').filter(Boolean); // ['configuracion', recurso?, clave?, 'programado'?]
  const m = req.method;
  if (!recurso && m === 'GET') return configuracionMock.obtener();
  if (recurso === 'parametros' && clave && !extra && m === 'PUT') return configuracionMock.cambiar(clave, cuerpo(req));
  if (recurso === 'parametros' && clave && extra === 'programado' && m === 'DELETE') return configuracionMock.cancelarProgramado(clave);
  if (recurso === 'bancos' && m === 'PUT') return configuracionMock.guardarBancos(cuerpo(req));
  return noExiste(req, ruta);
}

function rutearAnticipos(req: HttpRequest<unknown>, ruta: string): RespuestaMock {
  const [, recurso] = ruta.split('/').filter(Boolean); // ['anticipos', 'resumen'?]
  const m = req.method;
  if (!recurso && m === 'GET') return anticiposMock.listar(req.params.get('colaboradorId'));
  if (!recurso && m === 'POST') return anticiposMock.registrar(cuerpo(req));
  if (recurso === 'resumen' && m === 'GET') return anticiposMock.resumen(req.params.get('colaboradorId'), req.params.get('periodo'));
  return noExiste(req, ruta);
}

function rutearLiquidaciones(req: HttpRequest<unknown>, ruta: string): RespuestaMock {
  const [, id, accion] = ruta.split('/').filter(Boolean); // ['liquidaciones', id | 'calcular'?, 'revisado'?]
  const m = req.method;
  if (!id && m === 'GET') return liquidacionesMock.listar(req.params.get('periodo'));
  if (id === 'calcular' && m === 'POST') return liquidacionesMock.calcular(cuerpo(req));
  if (id && !accion && m === 'GET') return liquidacionesMock.obtener(id);
  if (id && accion === 'revisado' && m === 'PUT') return liquidacionesMock.marcarRevisado(id, cuerpo(req));
  return noExiste(req, ruta);
}

function rutearDocumentos(req: HttpRequest<unknown>, ruta: string): RespuestaMock {
  const [, id] = ruta.split('/').filter(Boolean); // ['documentos', id?]
  const m = req.method;
  if (!id && m === 'GET') return documentosMock.listar(req.params.get('periodo'));
  if (!id && m === 'POST') return documentosMock.registrar(cuerpo(req));
  if (id && m === 'PUT') return documentosMock.corregir(id, cuerpo(req));
  return noExiste(req, ruta);
}

function rutearExportaciones(req: HttpRequest<unknown>, ruta: string): RespuestaMock {
  const [, id, accion] = ruta.split('/').filter(Boolean); // ['exportaciones', id | 'preparacion'?, 'archivo'?]
  const m = req.method;
  if (!id && m === 'GET') return exportacionesMock.listar(req.params.get('periodo'));
  if (!id && m === 'POST') return exportacionesMock.generar(cuerpo(req));
  if (id === 'preparacion' && m === 'GET') return exportacionesMock.preparar(req.params.get('periodo'), req.params.get('corte'));
  if (id && accion === 'archivo' && m === 'GET') return exportacionesMock.archivo(id);
  return noExiste(req, ruta);
}

/** Une los movimientos de todos los módulos, del más reciente al más antiguo. */
function historialColaborador(id: string): RespuestaMock {
  const propios = colaboradoresMock.historial(id);
  const tmrId = colaboradoresMock.tmrIdDe(id);
  if (!propios || !tmrId) {
    return { status: 404, body: { title: 'No encontrado', status: 404, detail: `No existe un colaborador con id '${id}'.`, codigo: 'Colaborador.NoEncontrado' } };
  }
  const todos: EventoHistorial[] = [
    ...propios,
    ...contratosMock.eventosDe(tmrId),
    ...honorariosMock.eventosDe(tmrId),
    ...liquidacionesMock.eventosDe(id),
    ...anticiposMock.eventosDe(id),
    ...documentosMock.eventosDe(id),
    ...exportacionesMock.eventosDe(id),
  ];
  return { status: 200, body: todos.sort((a, b) => b.fecha.localeCompare(a.fecha)) };
}

/** Convierte la respuesta simulada en HttpResponse o HttpErrorResponse, con algo de latencia. */
function entregar(req: HttpRequest<unknown>, r: RespuestaMock): Observable<HttpResponse<unknown>> {
  if (r.status < 400) {
    return of(new HttpResponse({ status: r.status, url: req.url, body: r.body })).pipe(delay(LATENCIA_MS));
  }
  return timer(LATENCIA_MS).pipe(
    mergeMap(() => throwError(() => new HttpErrorResponse({ status: r.status, url: req.url, error: r.body }))),
  );
}
