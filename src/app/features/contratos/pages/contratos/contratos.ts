import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, Subscription, catchError, combineLatest, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { ContratosService } from '../../services/contratos.service';
import {
  Adenda, AsignacionDisponible, ContratoDetalle, ContratoResumen, ETIQUETA_ESTADO_CONTRATO, EstadoContrato, HonorarioDeRegistro,
  ProyectoDeContrato, ResumenContratos,
} from '../../models/contrato.models';
import { Modalidad } from '../../../honorarios/models/honorario.models';
import { HonorariosService } from '../../../honorarios/services/honorarios.service';
import { ColaboradoresService } from '../../../colaboradores/services/colaboradores.service';
import {
  BANCOS, Clasificacion, ColaboradorDetalle, ETIQUETA_CLASIFICACION, ETIQUETA_FRECUENCIA, Frecuencia,
} from '../../../colaboradores/models/colaborador.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { nombrePeriodo, periodoActual, periodoDeFecha, periodoSiguiente, primerDia } from '../../../../shared/utils/periodo';
import { conservarDatosAlRecargar, estaActualizando } from '../../../../shared/utils/carga';

type FrecuenciaElegida = { frecuencia: Frecuencia; vigenteDesdeMes: string };

const MENSAJE_FECHA_FUERA_DE_RANGO = 'La fecha debe ser desde el año 2000 y el año de 4 dígitos.';

/** "yyyy-MM-dd" con año de 4 dígitos y desde 2000 (el date del navegador deja escribir años de 5-6 dígitos). */
/** "2026-11-30" → "30/11/2026" */
function fechaCorta(fecha: string): string {
  return fecha.slice(0, 10).split('-').reverse().join('/');
}

function fechaEnRango(fecha: string): boolean {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(fecha);
  return !!m && Number(m[1]) >= 2000;
}

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
  imports: [CurrencyPipe, DatePipe, FormsModule, Icon, EstadoChip],
  templateUrl: './contratos.html',
  styleUrl: './contratos.scss',
})
export class Contratos {
  private readonly api = inject(ContratosService);
  private readonly honorariosApi = inject(HonorariosService);
  private readonly colaboradoresApi = inject(ColaboradoresService);
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
      conservarDatosAlRecargar(),
    ),
    { initialValue: { estado: 'cargando' } as Carga<ContratoResumen[]> },
  );

  protected readonly contadores = toSignal(
    this.recargar$.pipe(switchMap(() => cargaDe(this.api.resumen())), conservarDatosAlRecargar()),
    { initialValue: { estado: 'cargando' } as Carga<ResumenContratos> },
  );

  /** Hay contratos en pantalla y se están trayendo los del filtro nuevo. */
  protected readonly actualizando = computed(() => estaActualizando(this.carga()));

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
    return lista.filter((x) => `${x.colaborador} ${this.nombresProyectos(x)} ${this.clientesTexto(x)} ${x.referencia ?? ''} ${x.tmrColaboradorId}`
      .toLowerCase().includes(t));
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

  protected verDetalle(id: string): void {
    this.seleccionadoId.set(id);
  }

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

  // ── Registrar / editar contrato (misma pantalla para los dos) ────────
  protected readonly registrando = signal(false);
  /** "Más datos (opcional)": referencia y observaciones plegadas; se abren solas si ya tienen valor. */
  protected readonly masDatos = signal(false);
  protected readonly masDatosAbierto = computed(() =>
    this.masDatos() || !!this.referenciaForm().trim() || !!this.observacionesForm().trim());
  /** Nombres de los proyectos marcados, para el resumen del formulario (solo muestra lo elegido). */
  protected readonly resumenProyectos = computed(() => {
    const elegidos = this.asignacionesDelColaborador().filter((a) => this.proyectosElegidos().has(a.tmrProyectoId));
    return elegidos.length ? elegidos.map((a) => a.proyecto).join(', ') : 'Sin proyecto';
  });

  /** Atajos del encabezado del formulario: lleva a la sección del paso. */
  protected irAPaso(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  protected readonly cargandoFormulario = signal(false);
  /** crear: contrato nuevo. editar: solo correcciones. adenda: cualquier cambio del contrato (rige desde hoy). */
  protected readonly modoFormulario = signal<'crear' | 'editar' | 'adenda'>('crear');
  /** El contrato tal como estaba al abrir la adenda (para comparar y armar el resumen de cambios). */
  private readonly contratoEnAdenda = signal<ContratoDetalle | null>(null);
  protected readonly contratoEditandoId = signal<string | null>(null);
  /** Solo en modo editar: el colaborador no se puede cambiar, se muestra fijo. */
  protected readonly colaboradorNombreFijo = signal('');

  // Paso 1: elegir colaborador (todos, incluso sin proyecto todavía). Un solo cuadro de texto hace
  // de buscador y de selector a la vez: se escribe para filtrar y se elige una opción de la lista.
  protected readonly colaboradoresTodos = signal<{ tmrColaboradorId: string; colaborador: string }[]>([]);
  protected readonly busquedaColaborador = signal('');
  protected readonly colaboradorElegidoId = signal('');
  protected readonly listaColaboradorAbierta = signal(false);
  private cerrarListaTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly colaboradoresFiltrados = computed(() => {
    const t = this.busquedaColaborador().trim().toLowerCase();
    const lista = this.colaboradoresTodos();
    if (!t) return lista;
    return lista.filter((c) => c.colaborador.toLowerCase().includes(t));
  });

  // Paso 2: proyectos disponibles de ese colaborador (0, 1 o varios).
  protected readonly asignaciones = signal<AsignacionDisponible[]>([]);
  protected readonly asignacionesDelColaborador = computed(() =>
    this.asignaciones().filter((a) => a.tmrColaboradorId === this.colaboradorElegidoId()));
  protected readonly proyectosElegidos = signal<ReadonlySet<string>>(new Set());

  // Paso 3-4: fechas, referencia, observaciones, honorario por proyecto elegido.
  protected readonly inicioForm = signal('');
  protected readonly finForm = signal('');
  protected readonly indefinidoForm = signal(false);
  protected readonly referenciaForm = signal('');
  protected readonly observacionesForm = signal('');
  protected readonly honorariosForm = signal<Record<string, { importe: string; modalidad: Modalidad }>>({});
  /** Cómo se paga el contrato. true: un solo monto fijo para todo el contrato, sin importar
   * cuántos proyectos tenga (o ninguno). false: un monto por cada proyecto, que se paga solo
   * mientras la persona esté en ese proyecto. */
  protected readonly pagoPorContrato = signal(true);
  protected readonly honorarioContratoForm = signal<{ importe: string; modalidad: Modalidad }>({ importe: '', modalidad: 'Neto' });

  // Configuración del colaborador (RN 05, RN 36): opcional, vacío = no cambiar lo que ya tiene.
  // La ficha del colaborador ya solo la muestra; se registra o corrige desde aquí.
  protected readonly etiquetaClasificacion = ETIQUETA_CLASIFICACION;
  protected readonly etiquetaFrecuencia = ETIQUETA_FRECUENCIA;
  protected readonly clasificacionForm = signal<Clasificacion | ''>('');
  protected readonly frecuenciaForm = signal<Frecuencia | ''>('');
  /** Solo para mostrar "Actualmente: …" en modo editar; no se envía. */
  protected readonly clasificacionActual = signal<Clasificacion | null>(null);
  /** CON/PAS en TMR: el tipo de servicio viene de allí y no se elige aquí. MT/COS: se elige aquí. */
  protected readonly clasificacionDesdeTmr = signal(false);
  protected readonly frecuenciaActual = signal<FrecuenciaElegida | null>(null);

  // Paso 5: datos bancarios (opcional, se puede completar después desde aquí mismo).
  protected readonly bancoForm = signal('');
  /** Lista de bancos (BANCOS). Si la cuenta ya registrada es de un banco que no está en la lista,
   * se agrega a las opciones para no perderlo al editar. */
  protected readonly bancos = computed(() => {
    const actual = this.bancoForm().trim();
    return actual && !BANCOS.includes(actual) ? [...BANCOS, actual] : BANCOS;
  });
  protected readonly tipoCuentaForm = signal('');
  protected readonly numeroCuentaForm = signal('');
  /** Número de la cuenta activa, enmascarado (el backend nunca devuelve el número completo). */
  protected readonly cuentaEnmascarada = signal<string | null>(null);
  /** Banco/tipo tal como se precargaron: si no cambian y no se escribe número, no se reenvía la cuenta. */
  private readonly cuentaOriginal = signal<{ banco: string; tipoCuenta: string } | null>(null);
  /** Honorarios tal como se precargaron al editar: solo se reenvían los que cambien. */
  protected readonly honorariosOriginales = signal<Record<string, { importe: string; modalidad: Modalidad }>>({});
  /** Al editar: cómo se pagaba el contrato y, si era por contrato, con qué monto. */
  protected readonly modoOriginal = signal<'contrato' | 'proyecto' | null>(null);
  protected readonly honorarioContratoOriginal = signal<{ importe: string; modalidad: Modalidad } | null>(null);

  protected readonly guardandoContrato = signal(false);
  protected readonly erroresContrato = signal<Record<string, string>>({});
  protected readonly errorContrato = signal<string | null>(null);

  private limpiarFormulario(): void {
    this.busquedaColaborador.set('');
    this.colaboradorElegidoId.set('');
    this.colaboradorNombreFijo.set('');
    this.listaColaboradorAbierta.set(false);
    this.proyectosElegidos.set(new Set());
    this.inicioForm.set('');
    this.finForm.set('');
    this.indefinidoForm.set(false);
    this.referenciaForm.set('');
    this.observacionesForm.set('');
    this.honorariosForm.set({});
    this.pagoPorContrato.set(true);
    this.honorarioContratoForm.set({ importe: '', modalidad: 'Neto' });
    this.clasificacionForm.set('');
    this.frecuenciaForm.set('');
    this.clasificacionActual.set(null);
    this.frecuenciaActual.set(null);
    this.bancoForm.set('');
    this.tipoCuentaForm.set('');
    this.numeroCuentaForm.set('');
    this.cuentaEnmascarada.set(null);
    this.cuentaOriginal.set(null);
    this.honorariosOriginales.set({});
    this.modoOriginal.set(null);
    this.honorarioContratoOriginal.set(null);
    this.contratoEnAdenda.set(null);
    this.observacionesAdendaForm.set('');
    this.cargaConfiguracion?.unsubscribe();
    this.cargandoConfiguracion.set(false);
    this.erroresContrato.set({});
    this.errorContrato.set(null);
  }

  protected abrirRegistro(): void {
    this.limpiarFormulario();
    this.modoFormulario.set('crear');
    this.contratoEditandoId.set(null);
    this.registrando.set(true);
    this.cargandoFormulario.set(true);
    forkJoin({ colaboradores: this.api.colaboradoresParaRegistro(), asignaciones: this.api.asignacionesDisponibles() }).subscribe({
      next: ({ colaboradores, asignaciones }) => {
        this.colaboradoresTodos.set(colaboradores);
        this.asignaciones.set(asignaciones);
        this.cargandoFormulario.set(false);
      },
      error: (e: unknown) => { this.cargandoFormulario.set(false); this.errorContrato.set(leerErrorApi(e).mensaje); },
    });
  }

  /** Mismo formulario que Registrar, ya con todo lo del contrato elegido: proyectos, fechas,
   * honorario y datos bancarios se pueden corregir. FechaFin/Indefinido no se tocan (RN 12): para
   * extender la vigencia se usa "Registrar adenda" desde este mismo detalle. */
  protected abrirEdicion(d: ContratoDetalle, modo: 'editar' | 'adenda' = 'editar'): void {
    this.limpiarFormulario();
    this.modoFormulario.set(modo);
    this.contratoEditandoId.set(d.id);
    this.colaboradorNombreFijo.set(d.colaborador);
    this.colaboradorElegidoId.set(d.tmrColaboradorId);
    this.proyectosElegidos.set(new Set(d.proyectos.map((p) => p.tmrProyectoId)));
    this.inicioForm.set(d.fechaInicio);
    this.finForm.set(d.fechaFinOriginal ?? '');
    this.indefinidoForm.set(d.fechaFinOriginal === null);
    this.referenciaForm.set(d.referencia ?? '');
    this.observacionesForm.set(d.observaciones ?? '');
    if (modo === 'adenda') {
      // La adenda rige desde hoy hasta la nueva fecha de fin: se propone el fin vigente actual.
      this.contratoEnAdenda.set(d);
      this.finForm.set(d.fechaFinVigente ?? '');
    }
    this.registrando.set(true);
    this.cargandoFormulario.set(true);

    forkJoin({
      asignaciones: this.api.asignacionesDisponibles(d.id),
      condiciones: this.honorariosApi.condiciones(d.tmrColaboradorId),
      colaborador: this.colaboradoresApi.obtener(d.colaboradorId),
    }).subscribe({
      next: ({ asignaciones, condiciones, colaborador }) => {
        this.asignaciones.set(asignaciones);

        // Lo último registrado para ESTE contrato (incluido un cambio ya programado para el mes
        // siguiente: es el que se acaba de guardar). Misma regla que el backend: si después del
        // último honorario por contrato hay honorarios por proyecto, se paga por proyecto.
        const delContrato = condiciones.filter((c) => c.contratoId === d.id); // más reciente primero
        const porContrato = delContrato.find((c) => !c.proyectoId) ?? null;
        const porProyecto = delContrato.filter((c) => c.proyectoId && (!porContrato || c.mesInicioVigencia > porContrato.mesInicioVigencia));

        const honorariosForm: Record<string, { importe: string; modalidad: Modalidad }> = {};
        for (const p of d.proyectos) {
          const ultimo = porProyecto.find((c) => c.proyectoId === p.tmrProyectoId) ?? null;
          honorariosForm[p.tmrProyectoId] = { importe: ultimo ? String(ultimo.importeMensual) : '', modalidad: ultimo?.modalidad ?? 'Neto' };
        }
        this.honorariosForm.set(honorariosForm);
        this.honorariosOriginales.set(structuredClone(honorariosForm));

        if (porProyecto.length > 0) {
          this.modoOriginal.set('proyecto');
          this.pagoPorContrato.set(false);
        } else if (porContrato) {
          const original = { importe: String(porContrato.importeMensual), modalidad: porContrato.modalidad };
          this.modoOriginal.set('contrato');
          this.honorarioContratoOriginal.set(original);
          this.honorarioContratoForm.set({ ...original });
          this.pagoPorContrato.set(true);
        }
        this.precargarConfiguracion(colaborador);
        this.cargandoFormulario.set(false);
      },
      error: (e: unknown) => { this.cargandoFormulario.set(false); this.errorContrato.set(leerErrorApi(e).mensaje); },
    });
  }

  /** Lo que el colaborador ya tiene configurado (tipo de servicio, frecuencia, cuenta), para no
   * tener que volver a escribirlo ni borrarlo sin querer, tanto al registrar como al editar. */
  private precargarConfiguracion(colaborador: ColaboradorDetalle | null): void {
    const cuenta = colaborador?.cuentaBancaria ?? null;
    this.bancoForm.set(cuenta?.banco ?? '');
    this.tipoCuentaForm.set(cuenta?.tipoCuenta ?? '');
    this.numeroCuentaForm.set('');
    this.cuentaEnmascarada.set(cuenta?.numeroCuentaEnmascarado ?? null);
    this.cuentaOriginal.set(cuenta ? { banco: cuenta.banco ?? '', tipoCuenta: cuenta.tipoCuenta ?? '' } : null);
    this.clasificacionActual.set(colaborador?.clasificacion ?? null);
    this.clasificacionForm.set(colaborador?.clasificacion ?? '');
    this.clasificacionDesdeTmr.set(colaborador?.clasificacionDesdeTmr ?? false);
    const vigente = colaborador?.frecuenciaVigente ?? null;
    this.frecuenciaActual.set(vigente ? { frecuencia: vigente.frecuencia, vigenteDesdeMes: vigente.vigenteDesdeMes } : null);
    this.frecuenciaForm.set(vigente?.frecuencia ?? '');
  }

  /** El cuadro es a la vez buscador y selector: escribir filtra, y limpia la elección anterior. */
  protected buscarColaborador(texto: string): void {
    this.busquedaColaborador.set(texto);
    this.listaColaboradorAbierta.set(true);
    const elegido = this.colaboradoresTodos().find((c) => c.tmrColaboradorId === this.colaboradorElegidoId());
    if (elegido && elegido.colaborador !== texto) this.elegirColaboradorInterno('');
  }

  protected elegirColaborador(c: { tmrColaboradorId: string; colaborador: string }): void {
    this.busquedaColaborador.set(c.colaborador);
    this.listaColaboradorAbierta.set(false);
    this.elegirColaboradorInterno(c.tmrColaboradorId);
  }

  /** El click en una opción dispara (mousedown) antes que el (blur) del input la cierre. */
  protected cerrarListaColaboradorConRetraso(): void {
    clearTimeout(this.cerrarListaTimeout);
    this.cerrarListaTimeout = setTimeout(() => this.listaColaboradorAbierta.set(false), 150);
  }

  private elegirColaboradorInterno(tmrColaboradorId: string): void {
    this.colaboradorElegidoId.set(tmrColaboradorId);
    this.proyectosElegidos.set(new Set());
    this.honorariosForm.set({});
    this.pagoPorContrato.set(true);
    this.honorarioContratoForm.set({ importe: '', modalidad: 'Neto' });

    // Al registrar: trae lo que la persona ya tiene configurado (de otro contrato, por ejemplo).
    this.cargaConfiguracion?.unsubscribe();
    this.precargarConfiguracion(null);
    if (!tmrColaboradorId || this.modoFormulario() !== 'crear') {
      this.cargandoConfiguracion.set(false);
      return;
    }
    this.cargandoConfiguracion.set(true);
    this.cargaConfiguracion = this.api.configuracionActual(tmrColaboradorId).subscribe({
      next: (colaborador) => { this.precargarConfiguracion(colaborador); this.cargandoConfiguracion.set(false); },
      error: (e: unknown) => { this.cargandoConfiguracion.set(false); this.errorContrato.set(leerErrorApi(e).mensaje); },
    });
  }

  private cargaConfiguracion?: Subscription;
  protected readonly cargandoConfiguracion = signal(false);

  protected alternarProyecto(a: AsignacionDisponible): void {
    const actual = new Set(this.proyectosElegidos());
    if (actual.has(a.tmrProyectoId)) {
      actual.delete(a.tmrProyectoId);
      const honorarios = { ...this.honorariosForm() };
      delete honorarios[a.tmrProyectoId];
      this.honorariosForm.set(honorarios);
    } else {
      actual.add(a.tmrProyectoId);
      // Al elegir el primer proyecto, propone como inicio su fecha de ingreso en TMR.
      if (actual.size === 1 && a.fechaAsignacion && !this.inicioForm()) this.inicioForm.set(a.fechaAsignacion);
      this.honorariosForm.update((h) => ({ ...h, [a.tmrProyectoId]: h[a.tmrProyectoId] ?? { importe: '', modalidad: 'Neto' } }));
    }
    this.proyectosElegidos.set(actual);
  }

  protected honorarioDe(tmrProyectoId: string): { importe: string; modalidad: Modalidad } {
    return this.honorariosForm()[tmrProyectoId] ?? { importe: '', modalidad: 'Neto' };
  }

  protected actualizarImporte(tmrProyectoId: string, importe: string): void {
    this.honorariosForm.update((h) => ({ ...h, [tmrProyectoId]: { ...this.honorarioDe(tmrProyectoId), importe } }));
  }

  protected actualizarModalidad(tmrProyectoId: string, modalidad: Modalidad): void {
    this.honorariosForm.update((h) => ({ ...h, [tmrProyectoId]: { ...this.honorarioDe(tmrProyectoId), modalidad } }));
  }

  protected actualizarHonorarioContratoImporte(importe: string): void {
    this.honorarioContratoForm.update((h) => ({ ...h, importe }));
  }

  protected actualizarHonorarioContratoModalidad(modalidad: Modalidad): void {
    this.honorarioContratoForm.update((h) => ({ ...h, modalidad }));
  }

  /** Las fechas y demás campos los valida también el backend; aquí se exige elegir a quién, poner
   * inicio y fin (o "Indefinido") al crear, y un honorario para cada proyecto elegido. */
  protected guardarContrato(): void {
    if (this.modoFormulario() === 'adenda') {
      this.guardarAdendaCompleta();
      return;
    }
    const esEdicion = this.modoFormulario() === 'editar';
    const tmrColaboradorId = this.colaboradorElegidoId();
    if (!tmrColaboradorId) { this.erroresContrato.set({ colaborador: 'Elige el colaborador.' }); return; }

    if (!this.inicioForm()) {
      this.erroresContrato.set({ fechaInicio: 'Es obligatoria.' });
      return;
    }
    if (!fechaEnRango(this.inicioForm())) {
      this.erroresContrato.set({ fechaInicio: MENSAJE_FECHA_FUERA_DE_RANGO });
      return;
    }
    if (!esEdicion && !this.indefinidoForm() && this.finForm() && !fechaEnRango(this.finForm())) {
      this.erroresContrato.set({ fechaFin: MENSAJE_FECHA_FUERA_DE_RANGO });
      return;
    }

    if (!esEdicion && !this.indefinidoForm() && !this.finForm()) {
      this.erroresContrato.set({ fechaFin: 'Pon la fecha de fin o marca "Indefinido".' });
      return;
    }

    // Editar solo corrige: el pago (forma, monto) se cambia con una adenda. Solo si el contrato
    // todavía no tiene honorario se configura aquí, y rige desde el inicio del contrato.
    let honorarios: HonorarioDeRegistro[] = [];
    if (!esEdicion || this.modoOriginal() === null) {
      const leidos = this.leerHonorarios();
      if (!leidos) return;
      honorarios = leidos;
    }

    // Al registrar, tipo de servicio, frecuencia y cuenta son obligatorios (salvo que la persona ya
    // los tenga y vengan precargados): sin ellos el colaborador queda Pendiente y fuera del cálculo.
    if (!esEdicion) {
      if (this.cargandoConfiguracion()) { this.errorContrato.set('Espera a que cargue la configuración del colaborador.'); return; }
      const faltan: Record<string, string> = {};
      if (!this.clasificacionForm()) {
        faltan['clasificacion'] = this.clasificacionDesdeTmr()
          ? 'Falta en TMR: revisa su tipo de contrato.'
          : 'Es obligatorio.';
      }
      if (!this.frecuenciaForm()) faltan['frecuencia'] = 'Es obligatoria.';
      if (!this.numeroCuentaForm().trim() && !this.cuentaEnmascarada()) faltan['numeroCuenta'] = 'Es obligatorio.';
      if (Object.keys(faltan).length) {
        this.erroresContrato.set(faltan);
        this.errorContrato.set('Completa tipo de servicio, frecuencia de pago y número de cuenta: sin ellos el colaborador queda Pendiente.');
        return;
      }
    }

    const numero = this.numeroCuentaForm().trim();
    const banco = this.bancoForm().trim();
    const cuentaOriginal = this.cuentaOriginal();
    const cambioBancoOTipo = !!cuentaOriginal && (banco !== cuentaOriginal.banco || this.tipoCuentaForm() !== cuentaOriginal.tipoCuenta);
    if (!numero && cambioBancoOTipo) {
      // El backend reemplaza la cuenta completa y no devuelve el número (solo enmascarado).
      this.errorContrato.set('Para cambiar el banco o el tipo de cuenta, vuelve a escribir el número de cuenta.');
      return;
    }
    const cuentaBancaria = numero
      ? { banco: banco || null, tipoCuenta: this.tipoCuentaForm() || null, numeroCuenta: numero }
      : null;
    const clasificacionElegida = this.clasificacionForm() || null;
    const clasificacion = clasificacionElegida !== this.clasificacionActual() ? clasificacionElegida : null;
    const frecuenciaElegida = this.frecuenciaForm() || null;
    // Sin frecuencia vigente es la configuración inicial: rige desde este mes. Si ya tiene una, el
    // cambio rige desde el mes siguiente (RN 20).
    const frecuencia: FrecuenciaElegida | null = frecuenciaElegida && frecuenciaElegida !== this.frecuenciaActual()?.frecuencia
      ? {
          frecuencia: frecuenciaElegida as Frecuencia,
          vigenteDesdeMes: primerDia(this.frecuenciaActual() ? periodoSiguiente() : periodoActual()),
        }
      : null;

    this.guardandoContrato.set(true);
    this.erroresContrato.set({});
    this.errorContrato.set(null);

    const resultado$ = esEdicion
      ? this.api.editar(this.contratoEditandoId()!, {
          tmrProyectoIds: [...this.proyectosElegidos()], fechaInicio: this.inicioForm(),
          referencia: this.referenciaForm().trim() || null, observaciones: this.observacionesForm().trim() || null,
          honorarios, cuentaBancaria, clasificacion, frecuencia,
        })
      : this.api.registrar({
          tmrColaboradorId, tmrProyectoIds: [...this.proyectosElegidos()], fechaInicio: this.inicioForm(),
          fechaFin: this.finForm(), indefinido: this.indefinidoForm(),
          referencia: this.referenciaForm().trim() || null, observaciones: this.observacionesForm().trim() || null,
          honorarios, cuentaBancaria, clasificacion, frecuencia,
        });

    resultado$.subscribe({
      next: (d) => {
        this.guardandoContrato.set(false);
        this.registrando.set(false);
        this.avisos.ok(esEdicion
          ? `Contrato de ${d.colaborador} actualizado.`
          : `Contrato registrado para ${d.colaborador} · ${this.nombresProyectos(d)}.`);
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

  /** Honorarios del formulario según la forma de pago; null (y el error en pantalla) si falta algo. */
  private leerHonorarios(): HonorarioDeRegistro[] | null {
    if (this.pagoPorContrato()) {
      // Pago por contrato: un solo monto fijo, sin proyecto. Vale con 0, 1 o muchos proyectos.
      const g = this.honorarioContratoForm();
      const importeMensual = g.importe.trim() ? Number(g.importe.replace(',', '.')) : null;
      if (importeMensual === null || importeMensual <= 0) {
        this.errorContrato.set('Pon el monto mensual del contrato.');
        return null;
      }
      return [{ tmrProyectoId: null, importeMensual, modalidad: g.modalidad }];
    }

    // Pago por proyecto: un monto por cada proyecto, que se paga solo mientras esté en él.
    if (this.proyectosElegidos().size === 0) {
      this.errorContrato.set('Para pagar por proyecto, elige al menos un proyecto (o cambia a "Por contrato").');
      return null;
    }
    const honorarios: HonorarioDeRegistro[] = [];
    for (const tmrProyectoId of this.proyectosElegidos()) {
      const h = this.honorarioDe(tmrProyectoId);
      const importeMensual = h.importe.trim() ? Number(h.importe.replace(',', '.')) : null;
      if (importeMensual === null || importeMensual <= 0) {
        this.errorContrato.set('Pon el honorario de todos los proyectos elegidos.');
        return null;
      }
      honorarios.push({ tmrProyectoId, importeMensual, modalidad: h.modalidad });
    }
    return honorarios;
  }

  /**
   * De los honorarios del formulario, solo los que cambian respecto de lo precargado (reenviar lo
   * mismo choca con los duplicados del backend). Un cambio de monto o de forma de pago rige desde
   * mesDelCambio (RN 19); un proyecto que no tenía honorario, desde mesNuevos.
   */
  private soloCambiosDeHonorario(honorarios: HonorarioDeRegistro[], mesDelCambio: string, mesNuevos: string): HonorarioDeRegistro[] {
    const originales = this.honorariosOriginales();
    const modoOriginal = this.modoOriginal();

    if (this.pagoPorContrato()) {
      const o = this.honorarioContratoOriginal();
      const h = honorarios[0];
      const sinCambios = modoOriginal === 'contrato' && !!o && Number(o.importe) === h.importeMensual && o.modalidad === h.modalidad;
      return sinCambios ? [] : [{ ...h, mesInicioVigencia: modoOriginal ? mesDelCambio : mesNuevos }];
    }

    const cambiaDeModo = modoOriginal === 'contrato';
    return honorarios
      .filter((h) => {
        const o = originales[h.tmrProyectoId!];
        return cambiaDeModo || !o || !o.importe || Number(o.importe) !== h.importeMensual || o.modalidad !== h.modalidad;
      })
      .map((h) => ({ ...h, mesInicioVigencia: cambiaDeModo || originales[h.tmrProyectoId!]?.importe ? mesDelCambio : mesNuevos }));
  }

  /** Editar: un proyecto del contrato no se puede quitar, y solo se agregan si se paga por contrato. */
  protected proyectoBloqueado(a: AsignacionDisponible): boolean {
    if (a.tieneContratoVigente) return true;
    if (this.modoFormulario() !== 'editar') return false;
    if (this.proyectosOriginales().has(a.tmrProyectoId)) return true;
    return this.modoOriginal() === 'proyecto';
  }

  /** Proyectos que tenía el contrato al abrir editar o la adenda. */
  private readonly proyectosOriginales = computed(() => {
    const d = this.contratoEnAdenda() ?? this.detalle();
    return new Set(this.modoFormulario() === 'crear' || !d ? [] : d.proyectos.map((p) => p.tmrProyectoId));
  });

  private nombreProyecto(tmrProyectoId: string): string {
    return this.asignaciones().find((a) => a.tmrProyectoId === tmrProyectoId)?.proyecto
      ?? this.contratoEnAdenda()?.proyectos.find((p) => p.tmrProyectoId === tmrProyectoId)?.proyecto
      ?? 'Proyecto';
  }

  /**
   * Adenda: cualquier cambio del contrato, desde hoy hasta la nueva fecha de fin. Guarda la adenda
   * (fin, proyectos y un resumen de lo que cambió) y después los honorarios nuevos o cambiados.
   */
  private guardarAdendaCompleta(): void {
    const d = this.contratoEnAdenda();
    if (!d) return;
    this.erroresContrato.set({});
    this.errorContrato.set(null);

    // Fecha hasta: el nuevo fin del contrato (los indefinidos no tienen).
    let nuevaFechaFin: string | null = null;
    if (!this.indefinidoForm()) {
      const fin = this.finForm();
      if (!fin) { this.erroresContrato.set({ fechaFin: 'Es obligatoria.' }); return; }
      if (!fechaEnRango(fin)) { this.erroresContrato.set({ fechaFin: MENSAJE_FECHA_FUERA_DE_RANGO }); return; }
      if (d.fechaFinVigente && fin < d.fechaFinVigente) {
        this.erroresContrato.set({ fechaFin: `No puede ser anterior al fin vigente (${fechaCorta(d.fechaFinVigente)}).` });
        return;
      }
      nuevaFechaFin = fin;
    }

    const leidos = this.leerHonorarios();
    if (!leidos) return;
    const mesSiguiente = primerDia(periodoSiguiente());
    const mesInicioContrato = primerDia(this.inicioForm().slice(0, 7));
    const mesDelCambio = mesInicioContrato > mesSiguiente ? mesInicioContrato : mesSiguiente;
    // Un proyecto nuevo (pago por proyecto) se paga desde que entra: rige desde este mes y el
    // cálculo cuenta solo los días de su asignación.
    const honorarios = this.soloCambiosDeHonorario(leidos, mesDelCambio, primerDia(periodoActual()));

    const antes = this.proyectosOriginales();
    const ahora = this.proyectosElegidos();
    const agregados = [...ahora].filter((x) => !antes.has(x));
    const quitados = [...antes].filter((x) => !ahora.has(x));

    const partes: string[] = [];
    if (nuevaFechaFin && nuevaFechaFin !== d.fechaFinVigente) {
      partes.push(`Fin: ${d.fechaFinVigente ? fechaCorta(d.fechaFinVigente) : '—'} → ${fechaCorta(nuevaFechaFin)}`);
    }
    if (agregados.length) partes.push(`Proyectos agregados: ${agregados.map((x) => this.nombreProyecto(x)).join(', ')}`);
    if (quitados.length) partes.push(`Proyectos quitados: ${quitados.map((x) => this.nombreProyecto(x)).join(', ')}`);
    const modoAntes = this.modoOriginal();
    const modoAhora = this.pagoPorContrato() ? 'contrato' : 'proyecto';
    if (modoAntes && modoAntes !== modoAhora) {
      partes.push(`Forma de pago: ${modoAntes === 'contrato' ? 'por contrato' : 'por proyecto'} → ${modoAhora === 'contrato' ? 'por contrato' : 'por proyecto'}`);
    }
    for (const h of honorarios) {
      const desde = nombrePeriodo(periodoDeFecha(h.mesInicioVigencia!));
      const monto = `$${h.importeMensual!.toFixed(2)} ${h.modalidad === 'Neto' ? 'neto' : 'más IVA'} desde ${desde}`;
      partes.push(h.tmrProyectoId ? `Honorario ${this.nombreProyecto(h.tmrProyectoId)}: ${monto}` : `Monto del contrato: ${monto}`);
    }

    const observaciones = this.observacionesAdendaForm().trim() || null;
    if (partes.length === 0 && !observaciones) {
      this.errorContrato.set('La adenda no cambia nada del contrato: cambia la fecha de fin, los proyectos o el honorario.');
      return;
    }

    this.guardandoContrato.set(true);
    this.api.registrarAdenda(d.id, {
      nuevaFechaFin, observaciones, tmrProyectoIds: agregados.length || quitados.length ? [...ahora] : null,
      cambios: partes.join(' · '), honorarios,
    }).subscribe({
      next: (actualizado) => {
        this.guardandoContrato.set(false);
        this.registrando.set(false);
        this.detalle.set(actualizado);
        this.avisos.ok(`Adenda ${actualizado.numeroAdendas} registrada para ${actualizado.colaborador}.`);
        this.seleccionadoId.set(actualizado.id);
        this.recargar$.next();
      },
      error: (e: unknown) => {
        this.guardandoContrato.set(false);
        const err = leerErrorApi(e);
        if (err.campos['nuevaFechaFin']) this.erroresContrato.set({ fechaFin: err.campos['nuevaFechaFin'] });
        else if (Object.keys(err.campos).length) this.erroresContrato.set(err.campos);
        else this.errorContrato.set(err.mensaje);
      },
    });
  }

  // ── Corregir una adenda ya registrada (fecha de fin u observaciones) ────────
  protected readonly agregandoAdenda = signal(false);
  /** null: se está creando una adenda nueva. Con valor: se está corrigiendo esa adenda existente. */
  protected readonly editandoAdendaId = signal<string | null>(null);
  protected readonly nuevaFinForm = signal('');
  protected readonly observacionesAdendaForm = signal('');
  protected readonly guardandoAdenda = signal(false);
  protected readonly errorAdendaCampo = signal<string | null>(null);
  protected readonly errorAdenda = signal<string | null>(null);

  /** Corrige una adenda ya registrada (ej. se escribió mal la fecha). */
  protected abrirEditarAdenda(a: Adenda): void {
    this.editandoAdendaId.set(a.id);
    this.nuevaFinForm.set(a.nuevaFechaFin ?? '');
    this.observacionesAdendaForm.set(a.observaciones ?? '');
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
    if (this.nuevaFinForm() && !fechaEnRango(this.nuevaFinForm())) {
      this.errorAdendaCampo.set(MENSAJE_FECHA_FUERA_DE_RANGO);
      return;
    }
    const request = { nuevaFechaFin: this.nuevaFinForm() || null, observaciones: this.observacionesAdendaForm().trim() || null };
    const adendaId = this.editandoAdendaId();
    if (!adendaId) return;

    this.guardandoAdenda.set(true);
    this.errorAdendaCampo.set(null);
    this.errorAdenda.set(null);
    this.api.editarAdenda(d.id, adendaId, request).subscribe({
      next: (actualizado) => {
        this.guardandoAdenda.set(false);
        this.agregandoAdenda.set(false);
        this.detalle.set(actualizado);
        this.avisos.ok(`Adenda corregida.${actualizado.fechaFinVigente ? ' Fin vigente: ' + fechaCorta(actualizado.fechaFinVigente) + '.' : ''}`);
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
    return estado === 'Vencido' ? 'danger' : estado === 'ProximoAVencer' ? 'warn' : estado === 'Vigente' ? 'ok' : 'neutral';
  }

  /** Nombres de los proyectos del contrato, o "Sin proyecto" (personal de RR. HH.). */
  protected nombresProyectos(c: ContratoResumen): string {
    return c.proyectos.length ? c.proyectos.map((p) => p.proyecto).join(', ') : 'Sin proyecto';
  }

  protected clientesTexto(c: ContratoResumen): string {
    return [...new Set(c.proyectos.map((p) => p.cliente).filter((x): x is string => !!x))].join(', ');
  }

  protected tieneVencidoConAsignacion(c: ContratoResumen): boolean {
    return c.proyectos.some((p) => p.estado === 'Vencido' && p.asignacionActiva);
  }

  /** Días que manda el backend en vencimientos, para un proyecto en particular; para los demás, solo el estado. */
  protected textoPlazo(p: ProyectoDeContrato): string | null {
    const d = p.diasParaVencer;
    if (d === null) return null;
    if (d < 0) return `venció hace ${-d} ${-d === 1 ? 'día' : 'días'}`;
    if (d === 0) return 'vence hoy';
    return `${d} ${d === 1 ? 'día' : 'días'}`;
  }

  protected iniciales(nombre: string): string {
    return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }
}
