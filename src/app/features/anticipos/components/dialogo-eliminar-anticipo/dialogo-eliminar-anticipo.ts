import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';

import { Anticipo } from '../../models/anticipo.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';

/**
 * Confirmación antes de eliminar un anticipo adicional. Solo pregunta: quien abre la ventana decide qué hacer
 * (DELETE .../anticipos/{id}, que el backend permite solo si el anticipo todavía no tiene cuotas).
 */
@Component({
  selector: 'app-dialogo-eliminar-anticipo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, DineroPipe],
  host: { '(document:keydown.escape)': 'cancelar.emit()' },
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

  private readonly botonCancelar = viewChild<ElementRef<HTMLButtonElement>>('botonCancelar');

  constructor() {
    // Foco en "Cancelar": la acción segura queda a mano si se presiona Enter por costumbre.
    afterNextRender(() => this.botonCancelar()?.nativeElement.focus());
  }
}
