import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ColaboradorDetalle } from '../../models/colaborador.models';
import { Icon } from '../../../../shared/components/icon/icon';

/**
 * Pestaña "Datos bancarios": solo lectura. Se registran o se cambian desde Contratos, al crear o
 * revisar el contrato del colaborador — no aquí (PUT /api/colaboradores/{id}/cuenta-bancaria sigue
 * existiendo en el backend, pero esta pantalla ya no lo expone).
 */
@Component({
  selector: 'app-tab-bancarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Icon],
  templateUrl: './tab-bancarios.html',
  styleUrl: './tab-bancarios.scss',
})
export class TabBancarios {
  readonly colaborador = input.required<ColaboradorDetalle>();
  /** Nombre de TMR; null si no se pudo leer. */
  readonly titular = input<string | null>(null);
}
