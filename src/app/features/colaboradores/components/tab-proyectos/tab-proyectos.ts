import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TmrAsignacion } from '../../../integracion-tmr/models/tmr.models';
import { ContratoResumen, ETIQUETA_ESTADO_CONTRATO, EstadoContrato } from '../../../contratos/models/contrato.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';

interface FilaProyecto extends TmrAsignacion {
  contratos: ContratoResumen[];
}

/**
 * Pestaña "Proyectos": asignaciones que vienen de TMR (GET /api/colaboradores/{id}/asignaciones), con sus fechas
 * y los contratos registrados para cada proyecto. Un contrato puede cubrir varios proyectos: aquí se
 * muestra, de cada contrato, el estado de ESTE proyecto en particular (RN 13-16), no el peor de todos.
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
    this.asignaciones().map((a) => ({
      ...a, contratos: this.contratos().filter((c) => c.proyectos.some((p) => p.proyectoId === a.tmrProyectoId)),
    })));

  /** El estado de este proyecto en particular dentro del contrato, no el peor de todos los que cubre. */
  protected estadoProyecto(c: ContratoResumen, tmrProyectoId: string): EstadoContrato {
    return c.proyectos.find((p) => p.proyectoId === tmrProyectoId)?.estado ?? c.estado;
  }

  protected tonoContrato(estado: EstadoContrato): TonoChip {
    return estado === 'Vencido' ? 'danger' : estado === 'ProximoAVencer' ? 'warn' : estado === 'Vigente' ? 'ok' : 'neutral';
  }
}
