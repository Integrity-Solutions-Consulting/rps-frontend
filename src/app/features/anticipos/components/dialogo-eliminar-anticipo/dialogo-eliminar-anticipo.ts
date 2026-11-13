import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';

import { Anticipo } from '../../models/anticipo.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';

/**
 * Confirmación antes de eliminar un anticipo adicional. Solo pregunta: quien abre la ventana decide qué hacer
 * (DELETE .../anticipos/{id}, que el backend permite solo si el anticipo todavía no tiene cuotas).
 * El foco empieza en "Cancelar" (data-foco-inicial) y vuelve al botón "Eliminar" al cerrar (ui-dialog).
 */
@Component({
  selector: 'app-dialogo-eliminar-anticipo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, DineroPipe, UiDialog],
  templateUrl: './dialogo-eliminar-anticipo.html',
  styleUrl: './dialogo-eliminar-anticipo.scss',
})
export class DialogoEliminarAnticipo {
  readonly anticipo = input.required<Anticipo>();
  readonly colaborador = input<string>('');
  /** Segundos que se ofrece "Deshacer" después de confirmar. */
  readonly segundosParaDeshacer = input.required<number>();
  readonly cancelar = output<void>();
  readonly confirmar = output<void>();
}
