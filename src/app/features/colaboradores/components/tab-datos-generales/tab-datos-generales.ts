import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ColaboradorDetalle } from '../../models/colaborador.models';
import { TmrColaboradorDetalle, identificacionEnmascarada } from '../../../integracion-tmr/models/tmr.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';

type Destino = 'contratos' | 'condiciones' | 'bancarios';

/**
 * Pestaña "Datos generales": datos personales de TMR (solo lectura) y accesos
 * a lo que se administra en RPS. No llama a la API: recibe todo de la ficha.
 */
@Component({
  selector: 'app-tab-datos-generales',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, EstadoChip],
  templateUrl: './tab-datos-generales.html',
  styleUrl: './tab-datos-generales.scss',
})
export class TabDatosGenerales {
  readonly colaborador = input.required<ColaboradorDetalle>();
  /** null si la copia de TMR no tiene a esta persona o no respondió. */
  readonly datosTmr = input<TmrColaboradorDetalle | null>(null);
  readonly errorTmr = input<string | null>(null);
  readonly proyectosActivos = input(0);
  readonly irA = output<Destino>();

  protected readonly enmascarar = identificacionEnmascarada;

  protected readonly accesos: { destino: Destino; titulo: string; texto: string; icono: 'file' | 'sliders' | 'card' }[] = [
    { destino: 'contratos', titulo: 'Contratos', texto: 'Contratos por proyecto, adendas y vencimientos.', icono: 'file' },
    { destino: 'condiciones', titulo: 'Condiciones económicas', texto: 'Tipo de servicio, frecuencia de pago y honorarios.', icono: 'sliders' },
    { destino: 'bancarios', titulo: 'Datos bancarios', texto: 'Cuenta que se usa en el Excel de pago.', icono: 'card' },
  ];
}
