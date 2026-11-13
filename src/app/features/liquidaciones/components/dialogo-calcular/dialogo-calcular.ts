import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Icon } from '../../../../shared/components/icon/icon';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';

/** Lo que la pantalla ya sabe antes de calcular. null = no se pudo cargar (la ventana lo dice y no inventa). */
export interface ResumenAntesDeCalcular {
  /** Colaboradores con configuración completa hoy (GET /api/dashboard). */
  configurados: number | null;
  /** Colaboradores pendientes de configuración hoy: el backend no los incluye. */
  sinConfigurar: number | null;
  /** Liquidaciones que ya existen en el mes y cuántas están revisadas (GET /api/liquidaciones). */
  yaCalculadas: number;
  revisadas: number;
}

/**
 * Confirmación antes de "Calcular período" (POST /api/honorarios/generar + /api/liquidaciones/generar, lo hace quien
 * abre la ventana). Muestra el resumen previo y qué pasa al volver a calcular, tal como lo hace rps-backend:
 * lo ya calculado se conserva, los honorarios nuevos se suman a la liquidación de la persona y, si eso cambia el total
 * de una liquidación revisada, el backend le quita la marca "Revisada".
 * Quién entra exactamente lo decide el backend (configuración vigente en el período y días asignados en el mes).
 */
@Component({
  selector: 'app-dialogo-calcular',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, UiDialog],
  templateUrl: './dialogo-calcular.html',
  styleUrl: './dialogo-calcular.scss',
})
export class DialogoCalcular {
  /** "Noviembre 2026" */
  readonly mes = input.required<string>();
  readonly resumen = input.required<ResumenAntesDeCalcular>();
  readonly calculando = input(false);
  readonly cancelar = output<void>();
  readonly confirmar = output<void>();

  protected readonly mesMinusculas = computed(() => this.mes().toLowerCase());
  protected readonly recalculo = computed(() => this.resumen().yaCalculadas > 0);
  protected readonly nadieConfigurado = computed(() => this.resumen().configurados === 0);

  protected cantidad(n: number | null): string {
    return n === null ? '—' : String(n);
  }
}
