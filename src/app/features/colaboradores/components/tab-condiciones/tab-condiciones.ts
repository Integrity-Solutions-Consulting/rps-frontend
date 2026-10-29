import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { ColaboradoresService } from '../../services/colaboradores.service';
import {
  Clasificacion, ColaboradorDetalle, DETALLE_CLASIFICACION, ETIQUETA_CLASIFICACION, ETIQUETA_FRECUENCIA,
  Frecuencia, FrecuenciaVigencia,
} from '../../models/colaborador.models';
import { HonorariosService } from '../../../honorarios/services/honorarios.service';
import {
  DETALLE_MODALIDAD, ETIQUETA_MODALIDAD, HonorarioProyecto, Modalidad,
} from '../../../honorarios/models/honorario.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { nombrePeriodo, periodoActual, periodoDeFecha, periodoSiguiente, primerDia } from '../../../../shared/utils/periodo';

type QueCambia = 'honorario' | 'frecuencia';
type EstadoVigencia = 'Vigente' | 'Programada' | 'Anterior';

interface FilaFrecuencia extends FrecuenciaVigencia {
  estado: EstadoVigencia;
  modificable: boolean;
}

/**
 * Pestaña "Condiciones económicas". Tres partes:
 *   1. Configuración del colaborador: tipo de servicio y frecuencia de pago. Son una sola para
 *      todos sus proyectos (RN 05, RN 36) → API real /api/colaboradores.
 *   2. Honorarios por proyecto: importe y modalidad de cada proyecto (RN 17, RN 18) → /api/honorarios (hoy de ejemplo).
 *   3. Cambio programado: nuevo honorario o nueva frecuencia, desde un mes que aún no empieza (RN 19, RN 20).
 * Emite `actualizado` para que la ficha vuelva a leer el estado de configuración.
 */
@Component({
  selector: 'app-tab-condiciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, FormsModule, Icon, EstadoChip],
  templateUrl: './tab-condiciones.html',
  styleUrl: './tab-condiciones.scss',
})
export class TabCondiciones {
  private readonly colaboradores = inject(ColaboradoresService);
  private readonly honorariosApi = inject(HonorariosService);
  private readonly avisos = inject(NotificationService);

  readonly colaborador = input.required<ColaboradorDetalle>();
  readonly frecuencias = input<FrecuenciaVigencia[]>([]);
  readonly actualizado = output<void>();

  protected readonly etiquetaClasificacion = ETIQUETA_CLASIFICACION;
  protected readonly detalleClasificacion = DETALLE_CLASIFICACION;
  protected readonly etiquetaFrecuencia = ETIQUETA_FRECUENCIA;
  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;
  protected readonly detalleModalidad = DETALLE_MODALIDAD;
  protected readonly clasificaciones: Clasificacion[] = ['Profesional', 'Junior'];
  protected readonly nombrePeriodo = nombrePeriodo;
  protected readonly periodoDeFecha = periodoDeFecha;

  protected readonly bloqueado = computed(() => !this.colaborador().activo);

  constructor() {
    // Al abrir la pestaña (o cambiar de colaborador) se cargan sus honorarios y se ajusta el formulario.
    effect(() => {
      const c = this.colaborador();
      untracked(() => {
        this.clasificacionForm.set(c.clasificacion ?? '');
        this.cargarHonorarios(c.tmrColaboradorId);
      });
    });
  }

  // ── 1. Configuración del colaborador ─────────────────────────────────
  protected readonly clasificacionForm = signal<Clasificacion | ''>('');
  protected readonly guardandoClasificacion = signal(false);
  protected readonly clasificacionCambio = computed(
    () => (this.clasificacionForm() || null) !== this.colaborador().clasificacion);

  /** Distribución ordinaria según la frecuencia vigente (RN 36, RN 37). */
  protected readonly distribucion = computed(() => {
    const f = this.colaborador().frecuenciaVigente?.frecuencia;
    if (f === 'DosPagos') return [{ corte: 'Quincena (1–15)', porcentaje: '50 %' }, { corte: 'Fin de mes (16–fin)', porcentaje: '50 %' }];
    if (f === 'FinDeMes') return [{ corte: 'Fin de mes', porcentaje: '100 %' }];
    return [];
  });

  protected readonly filasFrecuencia = computed<FilaFrecuencia[]>(() => {
    const mesActual = primerDia(periodoActual());
    const vigenteId = this.colaborador().frecuenciaVigente?.id;
    return [...this.frecuencias()]
      .sort((a, b) => b.vigenteDesdeMes.localeCompare(a.vigenteDesdeMes))
      .map((f) => ({
        ...f,
        estado: f.id === vigenteId ? 'Vigente' : f.vigenteDesdeMes > mesActual ? 'Programada' : 'Anterior',
        modificable: f.vigenteDesdeMes > mesActual,
      }));
  });

  protected guardarClasificacion(): void {
    this.guardandoClasificacion.set(true);
    this.colaboradores.actualizarClasificacion(this.colaborador().id, this.clasificacionForm() || null).subscribe({
      next: () => {
        this.guardandoClasificacion.set(false);
        this.avisos.ok('Tipo de servicio guardado. Aplica a todos sus proyectos.');
        this.actualizado.emit();
      },
      error: (e: unknown) => {
        this.guardandoClasificacion.set(false);
        this.avisos.error(leerErrorApi(e).mensaje);
      },
    });
  }

  protected tonoVigencia(e: EstadoVigencia): TonoChip {
    return e === 'Vigente' ? 'ok' : e === 'Programada' ? 'info' : 'neutral';
  }

  protected cancelarFrecuencia(f: FilaFrecuencia): void {
    this.colaboradores.eliminarFrecuencia(this.colaborador().id, f.id).subscribe({
      next: () => { this.avisos.ok('Frecuencia programada cancelada.'); this.actualizado.emit(); },
      error: (e: unknown) => this.avisos.error(leerErrorApi(e).mensaje),
    });
  }

  // ── 2. Honorarios por proyecto ───────────────────────────────────────
  protected readonly honorarios = signal<HonorarioProyecto[]>([]);
  protected readonly cargandoHonorarios = signal(true);
  protected readonly errorHonorarios = signal<string | null>(null);
  protected readonly historialAbierto = signal<string | null>(null);

  private cargarHonorarios(tmrColaboradorId: string): void {
    this.cargandoHonorarios.set(true);
    this.errorHonorarios.set(null);
    this.honorariosApi.porColaborador(tmrColaboradorId).subscribe({
      next: (lista) => {
        this.honorarios.set(lista);
        this.cargandoHonorarios.set(false);
        if (!this.proyectoForm() && lista.length) this.proyectoForm.set(lista.find((h) => h.asignacionActiva)?.tmrProyectoId ?? '');
      },
      error: (e: unknown) => { this.cargandoHonorarios.set(false); this.errorHonorarios.set(leerErrorApi(e).mensaje); },
    });
  }

  protected cancelarHonorario(h: HonorarioProyecto): void {
    if (!h.programado) return;
    this.honorariosApi.cancelarProgramado(h.programado.id).subscribe({
      next: () => { this.avisos.ok(`Se canceló el cambio programado de ${h.proyecto}.`); this.recargarHonorarios(); },
      error: (e: unknown) => this.avisos.error(leerErrorApi(e).mensaje),
    });
  }

  private recargarHonorarios(): void {
    this.cargarHonorarios(this.colaborador().tmrColaboradorId);
    this.actualizado.emit();
  }

  // ── 3. Cambio programado ─────────────────────────────────────────────
  protected readonly queCambia = signal<QueCambia>('honorario');
  protected readonly proyectoForm = signal('');
  protected readonly importeForm = signal<number | null>(null);
  protected readonly modalidadForm = signal<Modalidad>('Neto');
  protected readonly frecuenciaForm = signal<Frecuencia>('DosPagos');
  protected readonly mesForm = signal(periodoSiguiente());
  protected readonly guardandoCambio = signal(false);
  protected readonly erroresCambio = signal<Record<string, string>>({});
  protected readonly errorCambio = signal<string | null>(null);

  protected readonly proyectoElegido = computed(() => this.honorarios().find((h) => h.tmrProyectoId === this.proyectoForm()) ?? null);

  /** La primera configuración de un proyecto puede ser del mes en curso; los cambios, desde el siguiente. */
  protected readonly mesMinimo = computed(() => {
    if (this.queCambia() === 'honorario') return this.proyectoElegido()?.historial.length ? periodoSiguiente() : periodoActual();
    return this.frecuencias().length ? periodoSiguiente() : periodoActual();
  });

  /** Al elegir proyecto se proponen su importe y modalidad actuales. */
  protected elegirProyecto(tmrProyectoId: string): void {
    this.proyectoForm.set(tmrProyectoId);
    const h = this.proyectoElegido();
    this.importeForm.set(h?.vigente?.importe ?? null);
    this.modalidadForm.set(h?.vigente?.modalidad ?? 'Neto');
    if (this.mesForm() < this.mesMinimo()) this.mesForm.set(this.mesMinimo());
  }

  protected programarCambio(): void {
    const errores: Record<string, string> = {};
    if (this.mesForm() < this.mesMinimo()) errores['vigenteDesdeMes'] = 'Los cambios aplican desde el mes siguiente.';
    if (this.queCambia() === 'honorario') {
      if (!this.proyectoForm()) errores['tmrProyectoId'] = 'Elige el proyecto.';
      const importe = this.importeForm();
      if (importe === null || !(importe > 0)) errores['importe'] = 'Escribe un importe mayor que cero.';
    }
    if (Object.keys(errores).length) { this.erroresCambio.set(errores); return; }

    const vigenteDesdeMes = primerDia(this.mesForm());
    const llamada: Observable<unknown> = this.queCambia() === 'honorario'
      ? this.honorariosApi.programar({
          tmrColaboradorId: this.colaborador().tmrColaboradorId,
          tmrProyectoId: this.proyectoForm(),
          importe: Math.round((this.importeForm() ?? 0) * 100) / 100,
          modalidad: this.modalidadForm(),
          vigenteDesdeMes,
        })
      : this.colaboradores.registrarFrecuencia(this.colaborador().id, { frecuencia: this.frecuenciaForm(), vigenteDesdeMes });

    this.guardandoCambio.set(true);
    this.erroresCambio.set({});
    this.errorCambio.set(null);
    llamada.subscribe({
      next: () => {
        this.guardandoCambio.set(false);
        this.avisos.ok(`Cambio programado desde ${nombrePeriodo(this.mesForm())}.`);
        if (this.queCambia() === 'honorario') this.recargarHonorarios();
        else this.actualizado.emit();
      },
      error: (e: unknown) => {
        this.guardandoCambio.set(false);
        const err = leerErrorApi(e);
        if (Object.keys(err.campos).length) this.erroresCambio.set(err.campos);
        else this.errorCambio.set(err.mensaje);
      },
    });
  }
}
