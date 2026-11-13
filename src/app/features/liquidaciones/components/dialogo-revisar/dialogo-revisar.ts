import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { LiquidacionResumen } from '../../models/liquidacion.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';

/** Cuántos nombres se listan antes de resumir "y N más". */
const NOMBRES_VISIBLES = 5;

/**
 * Confirmación antes de "Marcar revisada para envío" (RN 49; POST /api/liquidaciones/{id}/revisar lo hace quien abre
 * la ventana). Recibe una lista: hoy se abre con una liquidación y la revisión de varias a la vez usará la misma ventana
 * pasándole todas las elegidas. La marca es definitiva: RPS no permite quitarla (solo la retira el backend si un nuevo
 * cálculo cambia el total).
 */
@Component({
  selector: 'app-dialogo-revisar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, DineroPipe, UiDialog],
  templateUrl: './dialogo-revisar.html',
  styleUrl: './dialogo-revisar.scss',
})
export class DialogoRevisar {
  readonly liquidaciones = input.required<readonly Pick<LiquidacionResumen, 'id' | 'colaborador' | 'netoConsolidado'>[]>();
  /** "Noviembre 2026" */
  readonly mes = input.required<string>();
  readonly guardando = input(false);
  readonly cancelar = output<void>();
  readonly confirmar = output<void>();

  protected readonly cantidad = computed(() => this.liquidaciones().length);
  protected readonly una = computed(() => (this.cantidad() === 1 ? this.liquidaciones()[0] : null));
  protected readonly visibles = computed(() => this.liquidaciones().slice(0, NOMBRES_VISIBLES));
  protected readonly restantes = computed(() => Math.max(0, this.cantidad() - NOMBRES_VISIBLES));
  protected readonly netoTotal = computed(() => this.liquidaciones().reduce((s, l) => s + l.netoConsolidado, 0));
  protected readonly mesMinusculas = computed(() => this.mes().toLowerCase());
}
