import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { HonorariosService } from '../../../honorarios/services/honorarios.service';
import {
  ColaboradorDetalle, DETALLE_CLASIFICACION, ETIQUETA_CLASIFICACION, ETIQUETA_FRECUENCIA, FrecuenciaVigencia,
} from '../../models/colaborador.models';
import { ETIQUETA_MODALIDAD, HonorarioContrato, HonorarioProyecto } from '../../../honorarios/models/honorario.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { nombrePeriodo, periodoActual, periodoDeFecha, primerDia } from '../../../../shared/utils/periodo';

type EstadoVigencia = 'Vigente' | 'Programada' | 'Anterior';

interface FilaFrecuencia extends FrecuenciaVigencia {
  estado: EstadoVigencia;
}

/**
 * Pestaña "Condiciones económicas", de solo lectura. Dos partes:
 *   1. Configuración del colaborador: tipo de servicio y frecuencia de pago (RN 05, RN 36). Se
 *      registran o corrigen desde Contratos, al crear o editar el contrato de ese colaborador.
 *   2. Honorarios por proyecto (RN 17, RN 18) → /api/colaboradores/{id}/condiciones-economicas. También
 *      solo lectura: se registran o cambian desde Contratos, al crear o revisar el contrato de ese proyecto.
 */
@Component({
  selector: 'app-tab-condiciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, RouterLink, Icon, EstadoChip],
  templateUrl: './tab-condiciones.html',
  styleUrl: './tab-condiciones.scss',
})
export class TabCondiciones {
  private readonly honorariosApi = inject(HonorariosService);

  readonly colaborador = input.required<ColaboradorDetalle>();
  readonly frecuencias = input<FrecuenciaVigencia[]>([]);

  protected readonly etiquetaClasificacion = ETIQUETA_CLASIFICACION;
  protected readonly detalleClasificacion = DETALLE_CLASIFICACION;
  protected readonly etiquetaFrecuencia = ETIQUETA_FRECUENCIA;
  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;
  protected readonly nombrePeriodo = nombrePeriodo;
  protected readonly periodoDeFecha = periodoDeFecha;

  constructor() {
    // Al abrir la pestaña (o cambiar de colaborador) se cargan sus honorarios.
    effect(() => {
      const c = this.colaborador();
      untracked(() => this.cargarHonorarios(c.tmrColaboradorId));
    });
  }

  // ── 1. Configuración del colaborador (solo lectura) ──────────────────
  protected readonly filasFrecuencia = computed<FilaFrecuencia[]>(() => {
    const mesActual = primerDia(periodoActual());
    const vigenteId = this.colaborador().frecuenciaVigente?.id;
    return [...this.frecuencias()]
      .sort((a, b) => b.vigenteDesdeMes.localeCompare(a.vigenteDesdeMes))
      .map((f) => ({
        ...f,
        estado: f.id === vigenteId ? 'Vigente' : f.vigenteDesdeMes > mesActual ? 'Programada' : 'Anterior',
      }));
  });

  protected tonoVigencia(e: EstadoVigencia): TonoChip {
    return e === 'Vigente' ? 'ok' : e === 'Programada' ? 'info' : 'neutral';
  }

  // ── 2. Honorarios por proyecto (solo lectura; se editan desde Contratos) ──
  protected readonly honorarios = signal<HonorarioProyecto[]>([]);
  /** Contratos que se pagan por contrato (un solo monto, sin proyecto). */
  protected readonly honorariosContrato = signal<HonorarioContrato[]>([]);
  protected readonly cargandoHonorarios = signal(true);
  protected readonly errorHonorarios = signal<string | null>(null);
  protected readonly historialAbierto = signal<string | null>(null);

  private cargarHonorarios(tmrColaboradorId: string): void {
    this.cargandoHonorarios.set(true);
    this.errorHonorarios.set(null);
    this.honorariosApi.porContrato(tmrColaboradorId).subscribe({ next: (lista) => this.honorariosContrato.set(lista) });
    this.honorariosApi.porColaborador(tmrColaboradorId).subscribe({
      next: (lista) => { this.honorarios.set(lista); this.cargandoHonorarios.set(false); },
      error: (e: unknown) => { this.cargandoHonorarios.set(false); this.errorHonorarios.set(leerErrorApi(e).mensaje); },
    });
  }
}
