import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icon } from '../../../../shared/components/icon/icon';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';

/**
 * Aviso antes de exportar liquidaciones de un mes que tiene liquidaciones sin revisar. No bloquea: exportar con
 * pendientes está permitido (la especificación lo deja como advertencia) y el archivo marca cuáles están pendientes.
 */
@Component({
  selector: 'app-dialogo-exportar-pendientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, UiDialog],
  templateUrl: './dialogo-exportar-pendientes.html',
  styleUrl: './dialogo-exportar-pendientes.scss',
})
export class DialogoExportarPendientes {
  /** "Liquidaciones · Consolidado (Excel)" */
  readonly reporte = input.required<string>();
  /** "noviembre 2026" */
  readonly mes = input.required<string>();
  /** "yyyy-MM" para el enlace a Liquidaciones. */
  readonly periodo = input.required<string>();
  readonly sinRevisar = input.required<number>();
  readonly calculadas = input.required<number>();
  readonly cancelar = output<void>();
  readonly confirmar = output<void>();
}
