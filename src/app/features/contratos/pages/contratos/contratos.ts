import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
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
  Clasificacion, ColaboradorDetalle, ETIQUETA_CLASIFICACION, ETIQUETA_FRECUENCIA, Frecuencia,
} from '../../../colaboradores/models/colaborador.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { periodoActual, periodoSiguiente, primerDia } from '../../../../shared/utils/periodo';

type FrecuenciaElegida = { frecuencia: Frecuencia; vigenteDesdeMes: string };

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
  protected readonly cargandoFormulario = signal(false);
  protected readonly modoFormulario = signal<'crear' | 'editar'>('crear');
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
  /** Cuando el contrato cubre más de un proyecto: un solo honorario para todos, o uno por proyecto. */
  protected readonly honorarioGrupal = signal(false);
  protected readonly honorarioGrupalForm = signal<{ importe: string; modalidad: Modalidad }>({ importe: '', modalidad: 'Neto' });

  // Configuración del colaborador (RN 05, RN 36): opcional, vacío = no cambiar lo que ya tiene.
  // La ficha del colaborador ya solo la muestra; se registra o corrige desde aquí.
  protected readonly etiquetaClasificacion = ETIQUETA_CLASIFICACION;
  protected readonly etiquetaFrecuencia = ETIQUETA_FRECUENCIA;
  protected readonly clasificacionForm = signal<Clasificacion | ''>('');
  protected readonly frecuenciaForm = signal<Frecuencia | ''>('');
  /** Solo para mostrar "Actualmente: …" en modo editar; no se envía. */
  protected readonly clasificacionActual = signal<Clasificacion | null>(null);
  protected readonly frecuenciaActual = signal<FrecuenciaElegida | null>(null);

  // Paso 5: datos bancarios (opcional, se puede completar después desde aquí mismo).
  protected readonly bancoForm = signal('');
  protected readonly tipoCuentaForm = signal('');
  protected readonly numeroCuentaForm = signal('');
  /** Número de la cuenta activa, enmascarado (el backend nunca devuelve el número completo). */
  protected readonly cuentaEnmascarada = signal<string | null>(null);
  /** Banco/tipo tal como se precargaron: si no cambian y no se escribe número, no se reenvía la cuenta. */
  private readonly cuentaOriginal = signal<{ banco: string; tipoCuenta: string } | null>(null);
  /** Honorarios tal como se precargaron al editar: solo se reenvían los que cambien. */
  private readonly honorariosOriginales = signal<Record<string, { importe: string; modalidad: Modalidad }>>({});

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
    this.honorarioGrupal.set(false);
    this.honorarioGrupalForm.set({ importe: '', modalidad: 'Neto' });
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
  protected abrirEdicion(d: ContratoDetalle): void {
    this.limpiarFormulario();
    this.modoFormulario.set('editar');
    this.contratoEditandoId.set(d.id);
    this.colaboradorNombreFijo.set(d.colaborador);
    this.colaboradorElegidoId.set(d.tmrColaboradorId);
    this.proyectosElegidos.set(new Set(d.proyectos.map((p) => p.tmrProyectoId)));
    this.inicioForm.set(d.fechaInicio);
    this.finForm.set(d.fechaFinOriginal ?? '');
    this.indefinidoForm.set(d.fechaFinOriginal === null);
    this.referenciaForm.set(d.referencia ?? '');
    this.observacionesForm.set(d.observaciones ?? '');
    this.registrando.set(true);
    this.cargandoFormulario.set(true);

    forkJoin({
      asignaciones: this.api.asignacionesDisponibles(d.id),
      honorarios: d.proyectos.length > 0 ? this.honorariosApi.porColaborador(d.tmrColaboradorId) : of([]),
      colaborador: this.colaboradoresApi.obtener(d.colaboradorId),
    }).subscribe({
      next: ({ asignaciones, honorarios, colaborador }) => {
        this.asignaciones.set(asignaciones);
        const honorariosForm: Record<string, { importe: string; modalidad: Modalidad }> = {};
        for (const p of d.proyectos) {
          const vigente = honorarios.find((h) => h.tmrProyectoId === p.tmrProyectoId)?.vigente;
          honorariosForm[p.tmrProyectoId] = { importe: vigente ? String(vigente.importe) : '', modalidad: vigente?.modalidad ?? 'Neto' };
        }
        this.honorariosForm.set(honorariosForm);
        this.honorariosOriginales.set(structuredClone(honorariosForm));
        // Si todos los proyectos tienen el mismo honorario, se muestra como honorario grupal.
        const valores = Object.values(honorariosForm);
        if (valores.length > 1 && valores.every((v) => v.importe && v.importe === valores[0].importe && v.modalidad === valores[0].modalidad)) {
          this.honorarioGrupal.set(true);
          this.honorarioGrupalForm.set({ ...valores[0] });
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
    this.honorarioGrupal.set(false);
    this.honorarioGrupalForm.set({ importe: '', modalidad: 'Neto' });

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
    // El honorario grupal solo tiene sentido con más de un proyecto elegido.
    if (actual.size <= 1) this.honorarioGrupal.set(false);
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

  protected actualizarHonorarioGrupalImporte(importe: string): void {
    this.honorarioGrupalForm.update((h) => ({ ...h, importe }));
  }

  protected actualizarHonorarioGrupalModalidad(modalidad: Modalidad): void {
    this.honorarioGrupalForm.update((h) => ({ ...h, modalidad }));
  }

  /** Las fechas y demás campos los valida también el backend; aquí se exige elegir a quién, poner
   * inicio y fin (o "Indefinido") al crear, y un honorario para cada proyecto elegido. */
  protected guardarContrato(): void {
    const esEdicion = this.modoFormulario() === 'editar';
    const tmrColaboradorId = this.colaboradorElegidoId();
    if (!tmrColaboradorId) { this.erroresContrato.set({ colaborador: 'Elige el colaborador.' }); return; }

    if (!this.inicioForm()) {
      this.erroresContrato.set({ fechaInicio: 'Es obligatoria.' });
      return;
    }

    if (!esEdicion && !this.indefinidoForm() && !this.finForm()) {
      this.erroresContrato.set({ fechaFin: 'Pon la fecha de fin o marca "Indefinido".' });
      return;
    }

    const esGrupal = this.honorarioGrupal() && this.proyectosElegidos().size > 1;
    let honorarios: HonorarioDeRegistro[] = [];

    if (this.proyectosElegidos().size > 0) {
      if (esGrupal) {
        const g = this.honorarioGrupalForm();
        const importeMensual = g.importe.trim() ? Number(g.importe.replace(',', '.')) : null;
        if (importeMensual === null || importeMensual <= 0) {
          this.errorContrato.set('Pon el importe del honorario.');
          return;
        }
        honorarios = [...this.proyectosElegidos()].map((tmrProyectoId) => ({ tmrProyectoId, importeMensual, modalidad: g.modalidad }));
      } else {
        for (const tmrProyectoId of this.proyectosElegidos()) {
          const h = this.honorarioDe(tmrProyectoId);
          const importeMensual = h.importe.trim() ? Number(h.importe.replace(',', '.')) : null;
          if (importeMensual === null || importeMensual <= 0) {
            this.errorContrato.set('Pon el honorario de todos los proyectos elegidos.');
            return;
          }
          honorarios.push({ tmrProyectoId, importeMensual, modalidad: h.modalidad });
        }
      }
    }

    // Al editar, el formulario viene precargado: solo se reenvía lo que de verdad cambió (reenviar
    // lo mismo choca con los duplicados del backend). Un proyecto que aún no tenía honorario es
    // configuración inicial (rige desde el inicio del contrato); uno que cambia, rige desde el mes
    // siguiente (RN 19) o desde el inicio del contrato si este empieza más adelante.
    if (esEdicion) {
      const originales = this.honorariosOriginales();
      const mesSiguiente = primerDia(periodoSiguiente());
      const mesInicioContrato = primerDia(this.inicioForm().slice(0, 7));
      const mesDelCambio = mesInicioContrato > mesSiguiente ? mesInicioContrato : mesSiguiente;
      honorarios = honorarios
        .filter((h) => {
          const o = originales[h.tmrProyectoId];
          return !o || !o.importe || Number(o.importe) !== h.importeMensual || o.modalidad !== h.modalidad;
        })
        .map((h) => (originales[h.tmrProyectoId]?.importe ? { ...h, mesInicioVigencia: mesDelCambio } : h));
    }

    // Al registrar, tipo de servicio, frecuencia y cuenta son obligatorios (salvo que la persona ya
    // los tenga y vengan precargados): sin ellos el colaborador queda Pendiente y fuera del cálculo.
    if (!esEdicion) {
      if (this.cargandoConfiguracion()) { this.errorContrato.set('Espera a que cargue la configuración del colaborador.'); return; }
      const faltan: Record<string, string> = {};
      if (!this.clasificacionForm()) faltan['clasificacion'] = 'Es obligatorio.';
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

  // ── Registrar / editar adenda (mismo formulario para las dos) ────────
  protected readonly agregandoAdenda = signal(false);
  /** null: se está creando una adenda nueva. Con valor: se está corrigiendo esa adenda existente. */
  protected readonly editandoAdendaId = signal<string | null>(null);
  protected readonly nuevaFinForm = signal('');
  protected readonly observacionesAdendaForm = signal('');
  protected readonly guardandoAdenda = signal(false);
  protected readonly errorAdendaCampo = signal<string | null>(null);
  protected readonly errorAdenda = signal<string | null>(null);

  protected abrirAdenda(): void {
    this.editandoAdendaId.set(null);
    this.nuevaFinForm.set('');
    this.observacionesAdendaForm.set('');
    this.errorAdendaCampo.set(null);
    this.errorAdenda.set(null);
    this.agregandoAdenda.set(true);
  }

  /** Corrige una adenda ya registrada (ej. se escribió mal la fecha). */
  protected abrirEditarAdenda(a: Adenda): void {
    this.editandoAdendaId.set(a.id);
    this.nuevaFinForm.set(a.nuevaFechaFin);
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
    const request = { nuevaFechaFin: this.nuevaFinForm(), observaciones: this.observacionesAdendaForm().trim() || null };
    const adendaId = this.editandoAdendaId();

    this.guardandoAdenda.set(true);
    this.errorAdendaCampo.set(null);
    this.errorAdenda.set(null);
    (adendaId ? this.api.editarAdenda(d.id, adendaId, request) : this.api.registrarAdenda(d.id, request)).subscribe({
      next: (actualizado) => {
        this.guardandoAdenda.set(false);
        this.agregandoAdenda.set(false);
        this.detalle.set(actualizado);
        this.avisos.ok(adendaId
          ? `Adenda corregida. Fin vigente: ${actualizado.fechaFinVigente}.`
          : `Adenda ${actualizado.numeroAdendas} registrada. Fin vigente: ${actualizado.fechaFinVigente}.`);
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
