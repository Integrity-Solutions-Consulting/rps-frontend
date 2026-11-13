import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';

import { ExportacionRegistrada } from '../../models/exportacion.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';

/**
 * Confirmación antes de volver a generar una exportación cuyos datos cambiaron. RPS no guarda los archivos:
 * el nuevo sale con los datos de hoy y el anterior no se puede recuperar desde RPS.
 */
@Component({
  selector: 'app-dialogo-regenerar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, UiDialog],
  templateUrl: './dialogo-regenerar.html',
  styleUrl: './dialogo-regenerar.scss',
})
export class DialogoRegenerar {
  readonly exportacion = input.required<ExportacionRegistrada>();
  /** "Liquidaciones · Consolidado (Excel)" */
  readonly reporte = input.required<string>();
  /** "noviembre 2026", "todos los meses"… */
  readonly alcance = input.required<string>();
  readonly cancelar = output<void>();
  readonly confirmar = output<void>();
}
