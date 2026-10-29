import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { ContratosService } from '../../services/contratos.service';
import {
  AsignacionDisponible, ContratoDetalle, ContratoResumen, ETIQUETA_ESTADO_CONTRATO, EstadoContrato, ResumenContratos,
} from '../../models/contrato.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { sumarDias } from '../../../../shared/utils/fechas';

type Carga<T> = { estado: 'cargando' } | { estado: 'ok'; datos: T } | { estado: 'error'; mensaje: string };

function cargaDe<T>(obs: Observable<T>): Observable<Carga<T>> {
  return obs.pipe(
    map((datos): Carga<T> => ({ estado: 'ok', datos })),
    catchError((e: unknown) => of<Carga<T>>({ estado: 'error', mensaje: leerErrorApi(e).mensaje })),
    startWith<Carga<T>>({ estado: 'cargando' }),
  );
}

@Component({
  selector: 'app-contratos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, Icon, EstadoChip],
  templateUrl: './contratos.html',
  styleUrl: './contratos.scss',
})
export class Contratos {
  private readonly api = inject(ContratosService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly recargar$ = new BehaviorSubject<void>(undefined);

  protected readonly etiquetaEstado = ETIQUETA_ESTADO_CONTRATO;

  // ── Lista y contadores ───────────────────────────────────────────────
  protected readonly filtroEstado = signal<EstadoContrato | ''>('');
  protected readonly busqueda = signal('');
  /** ?colaborador=<ID de TMR>: llega desde la ficha del colaborador. */
  protected readonly filtroColaborador = signal<string | null>(this.ruta.snapshot.queryParamMap.get('colaborador'));

  protected readonly carga = toSignal(
    combineLatest([toObservable(this.filtroEstado), this.recargar$]).pipe(
      switchMap(([estado]) => cargaDe(this.api.listar(estado || null))),
    ),
    { initialValue: { estado: 'cargando' } as Carga<ContratoResumen[]> },
  );

  protected readonly contadores = toSignal(
    this.recargar$.pipe(switchMap(() => cargaDe(this.api.resumen()))),
    { initialValue: { estado: 'cargando' } as Carga<ResumenContratos> },
  );

  protected readonly resumen = computed(() => {
    const c = this.contadores();
    return c.estado === 'ok' ? c.datos : null;
  });

  protected readonly filas = computed(() => {
    const c = this.carga();
    if (c.estado !== 'ok') return [];
    const colaborador = this.filtroColaborador();
    const lista = colaborador ? c.datos.filter((x) => x.tmrColaboradorId === colaborador) : c.datos;
    const t = this.busqueda().trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((x) =>
      `${x.colaborador} ${x.proyecto} ${x.cliente ?? ''} ${x.referencia ?? ''} ${x.tmrColaboradorId}`.toLowerCase().includes(t));
  });

  // ── Paginación (10 por página, como el mockup) ───────────────────────
  private readonly porPagina = 10;
  protected readonly pagina = signal(1);
  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.filas().length / this.porPagina)));
  protected readonly numerosPagina = computed(() => Array.from({ length: this.totalPaginas() }, (_, i) => i + 1));
  protected readonly filasPagina = computed(() => {
    const inicio = (Math.min(this.pagina(), this.totalPaginas()) - 1) * this.porPagina;
    return this.filas().slice(inicio, inicio + this.porPagina);
  });
  protected readonly rango = computed(() => {
    const total = this.filas().length;
    const desde = total === 0 ? 0 : (Math.min(this.pagina(), this.totalPaginas()) - 1) * this.porPagina + 1;
    return { desde, hasta: Math.min(desde + this.porPagina - 1, total) };
  });

  /** Nombre del colaborador filtrado, para la etiqueta "Filtrado por". */
  protected readonly nombreFiltrado = computed(() => {
    const id = this.filtroColaborador();
    const c = this.carga();
    if (!id || c.estado !== 'ok') return null;
    return c.datos.find((x) => x.tmrColaboradorId === id)?.colaborador ?? `ID TMR ${id}`;
  });

  protected quitarFiltroColaborador(): void {
    this.filtroColaborador.set(null);
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: {} });
  }

  // ── Detalle del contrato seleccionado ────────────────────────────────
  /** ?contrato=<id>: llega desde la pestaña Contratos de la ficha. */
  protected readonly seleccionadoId = signal<string | null>(this.ruta.snapshot.queryParamMap.get('contrato'));
  protected readonly detalle = signal<ContratoDetalle | null>(null);
  protected readonly cargandoDetalle = signal(false);
  protected readonly errorDetalle = signal<string | null>(null);

  constructor() {
    // Al cambiar filtros o búsqueda se vuelve a la primera página.
    effect(() => {
      this.filtroEstado();
      this.busqueda();
      this.filtroColaborador();
      untracked(() => this.pagina.set(1));
    });

    // Selecciona el primero de la lista si no hay uno elegido o si el elegido ya no aparece.
    effect(() => {
      const filas = this.filas();
      const actual = untracked(() => this.seleccionadoId());
      if (filas.length && (!actual || !filas.some((f) => f.id === actual))) this.seleccionadoId.set(filas[0].id);
    });

    effect(() => {
      const id = this.seleccionadoId();
      untracked(() => this.cargarDetalle(id));
    });
  }

  private cargarDetalle(id: string | null): void {
    this.cancelarAdenda();
    if (!id) { this.detalle.set(null); return; }
    this.cargandoDetalle.set(true);
    this.errorDetalle.set(null);
    this.api.obtener(id).subscribe({
      next: (d) => { this.detalle.set(d); this.cargandoDetalle.set(false); },
      error: (e: unknown) => { this.cargandoDetalle.set(false); this.errorDetalle.set(leerErrorApi(e).mensaje); },
    });
  }

  protected actualizar(): void {
    this.recargar$.next();
    this.cargarDetalle(this.seleccionadoId());
  }

  // ── Registrar contrato ───────────────────────────────────────────────
  protected readonly registrando = signal(false);
  protected readonly asignaciones = signal<AsignacionDisponible[]>([]);
  protected readonly cargandoAsignaciones = signal(false);
  protected readonly asignacionForm = signal('');
  protected readonly inicioForm = signal('');
  protected readonly finForm = signal('');
  protected readonly referenciaForm = signal('');
  protected readonly observacionesForm = signal('');
  protected readonly guardandoContrato = signal(false);
  protected readonly erroresContrato = signal<Record<string, string>>({});
  protected readonly errorContrato = signal<string | null>(null);

  protected readonly asignacionElegida = computed(() => {
    const clave = this.asignacionForm();
    return this.asignaciones().find((a) => this.clave(a) === clave) ?? null;
  });

  protected clave(a: AsignacionDisponible): string {
    return `${a.tmrColaboradorId}|${a.tmrProyectoId}`;
  }

  protected abrirRegistro(): void {
    this.asignacionForm.set('');
    this.inicioForm.set('');
    this.finForm.set('');
    this.referenciaForm.set('');
    this.observacionesForm.set('');
    this.erroresContrato.set({});
    this.errorContrato.set(null);
    this.registrando.set(true);
    this.cargandoAsignaciones.set(true);
    this.api.asignacionesDisponibles().subscribe({
      next: (lista) => { this.asignaciones.set(lista); this.cargandoAsignaciones.set(false); },
      error: (e: unknown) => { this.cargandoAsignaciones.set(false); this.errorContrato.set(leerErrorApi(e).mensaje); },
    });
  }

  /** Al elegir la asignación, propone como inicio la fecha de inicio de la asignación en TMR. */
  protected elegirAsignacion(clave: string): void {
    this.asignacionForm.set(clave);
    const a = this.asignacionElegida();
    if (a?.fechaAsignacion && !this.inicioForm()) this.inicioForm.set(a.fechaAsignacion);
  }

  protected guardarContrato(): void {
    const a = this.asignacionElegida();
    const errores: Record<string, string> = {};
    if (!a) errores['asignacion'] = 'Elige el colaborador y el proyecto.';
    if (!this.inicioForm()) errores['fechaInicio'] = 'Es obligatoria.';
    if (!this.finForm()) errores['fechaFin'] = 'Es obligatoria.';
    if (this.inicioForm() && this.finForm() && this.finForm() < this.inicioForm()) errores['fechaFin'] = 'El fin no puede ser anterior al inicio.';
    if (Object.keys(errores).length || !a) { this.erroresContrato.set(errores); return; }

    this.guardandoContrato.set(true);
    this.erroresContrato.set({});
    this.errorContrato.set(null);
    this.api.registrar({
      tmrColaboradorId: a.tmrColaboradorId,
      tmrProyectoId: a.tmrProyectoId,
      fechaInicio: this.inicioForm(),
      fechaFin: this.finForm(),
      referencia: this.referenciaForm().trim() || null,
      observaciones: this.observacionesForm().trim() || null,
    }).subscribe({
      next: (d) => {
        this.guardandoContrato.set(false);
        this.registrando.set(false);
        this.avisos.ok(`Contrato registrado para ${d.colaborador} · ${d.proyecto}.`);
        this.filtroEstado.set('');
        this.busqueda.set('');
        this.seleccionadoId.set(d.id);
        this.recargar$.next();
      },
      error: (e: unknown) => {
        this.guardandoContrato.set(false);
        const err = leerErrorApi(e);
        if (Object.keys(err.campos).length) this.erroresContrato.set(err.campos);
        else this.errorContrato.set(err.mensaje);
      },
    });
  }

  // ── Registrar adenda ─────────────────────────────────────────────────
  protected readonly agregandoAdenda = signal(false);
  protected readonly nuevaFinForm = signal('');
  protected readonly referenciaAdendaForm = signal('');
  protected readonly observacionesAdendaForm = signal('');
  protected readonly guardandoAdenda = signal(false);
  protected readonly errorAdendaCampo = signal<string | null>(null);
  protected readonly errorAdenda = signal<string | null>(null);

  protected abrirAdenda(): void {
    this.nuevaFinForm.set('');
    this.referenciaAdendaForm.set('');
    this.observacionesAdendaForm.set('');
    this.errorAdendaCampo.set(null);
    this.errorAdenda.set(null);
    this.agregandoAdenda.set(true);
  }

  protected cancelarAdenda(): void {
    this.agregandoAdenda.set(false);
  }

  protected guardarAdenda(): void {
    const d = this.detalle();
    if (!d) return;
    const nueva = this.nuevaFinForm();
    if (!nueva) { this.errorAdendaCampo.set('Elige la nueva fecha de fin.'); return; }
    if (nueva <= d.fechaFinVigente) {
      this.errorAdendaCampo.set('Debe ser posterior al fin vigente. Una adenda solo extiende el contrato.');
      return;
    }
    this.guardandoAdenda.set(true);
    this.errorAdendaCampo.set(null);
    this.errorAdenda.set(null);
    this.api.registrarAdenda(d.id, {
      nuevaFechaFin: nueva,
      referencia: this.referenciaAdendaForm().trim() || null,
      observaciones: this.observacionesAdendaForm().trim() || null,
    }).subscribe({
      next: (actualizado) => {
        this.guardandoAdenda.set(false);
        this.agregandoAdenda.set(false);
        this.detalle.set(actualizado);
        this.avisos.ok(`Adenda ${actualizado.numeroAdendas} registrada. Fin vigente: ${actualizado.fechaFinVigente}.`);
        this.recargar$.next();
      },
      error: (e: unknown) => {
        this.guardandoAdenda.set(false);
        const err = leerErrorApi(e);
        if (err.campos['nuevaFechaFin']) this.errorAdendaCampo.set(err.campos['nuevaFechaFin']);
        else this.errorAdenda.set(err.mensaje);
      },
    });
  }

  // ── Presentación ─────────────────────────────────────────────────────
  protected tono(estado: EstadoContrato): TonoChip {
    return estado === 'Vencido' ? 'danger' : estado === 'ProximoAVencer' ? 'warn' : 'ok';
  }

  protected textoPlazo(c: ContratoResumen): string {
    if (c.diasParaVencer < 0) return `venció hace ${-c.diasParaVencer} ${-c.diasParaVencer === 1 ? 'día' : 'días'}`;
    if (c.diasParaVencer === 0) return 'vence hoy';
    return `${c.diasParaVencer} ${c.diasParaVencer === 1 ? 'día' : 'días'}`;
  }

  /** Una adenda empieza el día siguiente al fin anterior (el original o el de la adenda previa). */
  protected inicioAdenda(d: ContratoDetalle, indice: number): string {
    const finAnterior = indice === 0 ? d.fechaFinOriginal : d.adendas[indice - 1].nuevaFechaFin;
    return sumarDias(finAnterior, 1);
  }

  protected iniciales(nombre: string): string {
    return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }

  protected etiquetaAsignacion(a: AsignacionDisponible): string {
    let texto = `${a.colaborador} · ${a.proyecto}`;
    if (!a.vinculadoEnRps) texto += ' (no vinculado en RPS)';
    else if (a.tieneContratoVigente) texto += ' (ya tiene contrato vigente)';
    else if (!a.activa) texto += ' (asignación terminada)';
    return texto;
  }
}
