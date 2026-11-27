import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { BANCOS, BANCOS_PRINCIPALES } from '../../../colaboradores/models/colaborador.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';
import { coincide } from '../../../../shared/utils/texto';

/** Ventana "Elegir banco" (desde "Ver más…" en el formulario de contrato): todos los bancos con buscador. */
@Component({
  selector: 'app-dialogo-elegir-banco',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, UiDialog],
  templateUrl: './dialogo-elegir-banco.html',
  styleUrl: './dialogo-elegir-banco.scss',
})
export class DialogoElegirBanco {
  /** Banco que ya tiene el formulario, para marcarlo al abrir. */
  readonly actual = input('');
  readonly cancelar = output<void>();
  readonly elegido = output<string>();

  protected readonly busqueda = signal('');
  protected readonly seleccion = signal<string | null>(null);
  protected readonly banco = computed(() => this.seleccion() ?? this.actual());

  protected readonly principales = computed(() => BANCOS_PRINCIPALES.filter((b) => coincide(b, this.busqueda())));
  protected readonly otros = computed(() =>
    BANCOS.filter((b) => !BANCOS_PRINCIPALES.includes(b) && coincide(b, this.busqueda())));

  protected usar(): void {
    const banco = this.banco();
    if (banco) this.elegido.emit(banco);
  }
}
