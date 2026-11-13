import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';

import { RolSistemaDetalle, UsuarioSistema } from '../../models/accesos.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { iniciales, tonoAvatar } from '../avatar';

/**
 * Confirmación antes de desactivar una cuenta o un rol. Se pasa uno de los dos: [usuario] o [rol].
 * El PATCH (/api/usuarios/{id}/estado o /api/roles/{id}/estado) lo hace quien abre esta ventana.
 */
@Component({
  selector: 'app-dialogo-confirmar-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { '(document:keydown.escape)': 'cancelar.emit()' },
  templateUrl: './dialogo-confirmar-estado.html',
  styleUrl: './dialogo-confirmar-estado.scss',
})
export class DialogoConfirmarEstado {
  readonly usuario = input<UsuarioSistema | null>(null);
  readonly rol = input<RolSistemaDetalle | null>(null);
  /** Descripción del rol tal como la muestra la tabla de Roles. */
  readonly descripcionRol = input('');
  readonly guardando = input(false);
  readonly cancelar = output<void>();
  readonly confirmar = output<void>();

  private readonly botonCancelar = viewChild<ElementRef<HTMLButtonElement>>('botonCancelar');

  protected readonly iniciales = iniciales;
  protected readonly tonoAvatar = tonoAvatar;

  constructor() {
    // Foco en "Cancelar": la acción segura queda a mano si se presiona Enter por costumbre.
    afterNextRender(() => this.botonCancelar()?.nativeElement.focus());
  }
}
