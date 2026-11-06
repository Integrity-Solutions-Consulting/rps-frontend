import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TmrAsignacion } from '../../../integracion-tmr/models/tmr.models';
import { ContratoResumen, ETIQUETA_ESTADO_CONTRATO } from '../../../contratos/models/contrato.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';

interface FilaProyecto extends TmrAsignacion {
  contratos: ContratoResumen[];
}

/**
 * Pestaña "Proyectos": asignaciones que vienen de TMR (GET /api/colaboradores/{id}/asignaciones), con sus fechas
 * y los contratos registrados para cada proyecto. Los días reconocidos los calcula el backend al generar honorarios.
 * No llama a la API: recibe las asignaciones y los contratos de la ficha.
 */
@Component({
  selector: 'app-tab-proyectos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, EstadoChip],
  templateUrl: './tab-proyectos.html',
  styleUrl: './tab-proyectos.scss',
})
export class TabProyectos {
  readonly asignaciones = input<TmrAsignacion[]>([]);
  readonly contratos = input<ContratoResumen[]>([]);
  readonly errorTmr = input<string | null>(null);

  protected readonly etiquetaContrato = ETIQUETA_ESTADO_CONTRATO;

  protected readonly filas = computed<FilaProyecto[]>(() =>
    this.asignaciones().map((a) => ({ ...a, contratos: this.contratos().filter((c) => c.tmrProyectoId === a.tmrProyectoId) })));

  protected tonoContrato(c: ContratoResumen): TonoChip {
    return c.estado === 'Vencido' ? 'danger' : c.estado === 'ProximoAVencer' ? 'warn' : c.estado === 'Vigente' ? 'ok' : 'neutral';
  }
}
