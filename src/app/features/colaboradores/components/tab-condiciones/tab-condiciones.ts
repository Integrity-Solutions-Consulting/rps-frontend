import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ColaboradoresService } from '../../services/colaboradores.service';
import {
  Clasificacion, ColaboradorDetalle, DETALLE_CLASIFICACION, ETIQUETA_CLASIFICACION, ETIQUETA_FRECUENCIA,
  Frecuencia, FrecuenciaVigencia,
} from '../../models/colaborador.models';
import { HonorariosService } from '../../../honorarios/services/honorarios.service';
import { ETIQUETA_MODALIDAD, HonorarioProyecto } from '../../../honorarios/models/honorario.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { nombrePeriodo, periodoActual, periodoDeFecha, primerDia } from '../../../../shared/utils/periodo';

type EstadoVigencia = 'Vigente' | 'Programada' | 'Anterior';

interface FilaFrecuencia extends FrecuenciaVigencia {
  estado: EstadoVigencia;
  modificable: boolean;
}

/**
 * Pestaña "Condiciones económicas". Tres partes:
 *   1. Configuración del colaborador: tipo de servicio y frecuencia de pago (RN 05, RN 36) → /api/colaboradores.
 *   2. Honorarios por proyecto (RN 17, RN 18) → /api/colaboradores/{id}/condiciones-economicas. Solo
 *      lectura: se registran o cambian desde Contratos, al crear o revisar el contrato de ese proyecto.
 *   3. Registrar una frecuencia desde un mes. La regla la valida el backend.
 * Emite `actualizado` para que la ficha vuelva a leer el estado de configuración.
 */
@Component({
  selector: 'app-tab-condiciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, FormsModule, RouterLink, Icon, EstadoChip],
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

  /**
   * DELETE /api/colaboradores/{id}/frecuencias/{frecuenciaId}. El backend borra el registro y solo lo
   * permite si el mes todavía no empieza (FrecuenciaNoModificable).
   */
  protected cancelarFrecuencia(f: FilaFrecuencia): void {
    const mes = nombrePeriodo(periodoDeFecha(f.vigenteDesdeMes)).toLowerCase();
    this.colaboradores.eliminarFrecuencia(this.colaborador().id, f.id).subscribe({
      next: () => {
        this.actualizado.emit();
        this.avisos.ok(`Se eliminó la frecuencia registrada para ${mes}.`);
      },
      error: (e: unknown) => this.avisos.error(leerErrorApi(e).mensaje),
    });
  }

  // ── 2. Honorarios por proyecto (solo lectura; se editan desde Contratos) ──
  protected readonly honorarios = signal<HonorarioProyecto[]>([]);
  protected readonly cargandoHonorarios = signal(true);
  protected readonly errorHonorarios = signal<string | null>(null);
  protected readonly historialAbierto = signal<string | null>(null);

  private cargarHonorarios(tmrColaboradorId: string): void {
    this.cargandoHonorarios.set(true);
    this.errorHonorarios.set(null);
    this.honorariosApi.porColaborador(tmrColaboradorId).subscribe({
      next: (lista) => { this.honorarios.set(lista); this.cargandoHonorarios.set(false); },
      error: (e: unknown) => { this.cargandoHonorarios.set(false); this.errorHonorarios.set(leerErrorApi(e).mensaje); },
    });
  }

  // ── 3. Registrar frecuencia ───────────────────────────────────────────
  protected readonly frecuenciaForm = signal<Frecuencia>('DosPagos');
  protected readonly mesForm = signal(periodoActual());
  protected readonly guardandoCambio = signal(false);
  protected readonly erroresCambio = signal<Record<string, string>>({});
  protected readonly errorCambio = signal<string | null>(null);

  /** Envía al backend lo que se escribió; los errores de validación los devuelve el backend por campo. */
  protected programarCambio(): void {
    const vigenteDesdeMes = primerDia(this.mesForm());

    this.guardandoCambio.set(true);
    this.erroresCambio.set({});
    this.errorCambio.set(null);
    this.colaboradores.registrarFrecuencia(this.colaborador().id, { frecuencia: this.frecuenciaForm(), vigenteDesdeMes }).subscribe({
      next: () => {
        this.guardandoCambio.set(false);
        this.avisos.ok(`Frecuencia registrada desde ${nombrePeriodo(this.mesForm())}.`);
        this.actualizado.emit();
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
