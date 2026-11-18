import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';

import { Prestamo } from '../../models/prestamo.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';

/**
 * Confirmación antes de eliminar un préstamo que todavía no empezó a cobrarse. Solo pregunta: quien
 * abre la ventana envía el DELETE. El foco empieza en "Cancelar" (data-foco-inicial).
 */
@Component({
  selector: 'app-dialogo-eliminar-prestamo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, DineroPipe, UiDialog],
  templateUrl: './dialogo-eliminar-prestamo.html',
  styleUrl: './dialogo-eliminar-prestamo.scss',
})
export class DialogoEliminarPrestamo {
  readonly prestamo = input.required<Prestamo>();
  readonly colaborador = input<string>('');
  readonly eliminando = input(false);
  readonly cancelar = output<void>();
  readonly confirmar = output<void>();
}
