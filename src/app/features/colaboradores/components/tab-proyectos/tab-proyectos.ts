import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TmrAsignacion, asignacionActiva } from '../../../integracion-tmr/models/tmr.models';
import { ContratoResumen, ETIQUETA_ESTADO_CONTRATO } from '../../../contratos/models/contrato.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { diasCubiertosEnMes, diasDelMes, hoy } from '../../../../shared/utils/fechas';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';

type FiltroEstado = 'activos' | 'finalizados' | 'todos';

interface FilaProyecto extends TmrAsignacion {
  activa: boolean;
  diasEnMes: number;
  contrato: ContratoResumen | null;
}

/**
 * Pestaña "Proyectos": asignaciones de TMR (solo lectura) y días reconocidos en el mes elegido.
 * Cada proyecto se reconoce por separado (RN 25); dentro de un mismo proyecto no se duplican días.
 * No llama a la API: recibe las asignaciones y los contratos de la ficha.
 */
@Component({
  selector: 'app-tab-proyectos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, Icon, EstadoChip],
  templateUrl: './tab-proyectos.html',
  styleUrl: './tab-proyectos.scss',
})
export class TabProyectos {
  readonly asignaciones = input<TmrAsignacion[]>([]);
  readonly contratos = input<ContratoResumen[]>([]);
  readonly errorTmr = input<string | null>(null);

  protected readonly etiquetaContrato = ETIQUETA_ESTADO_CONTRATO;
  protected readonly filtro = signal<FiltroEstado>('activos');
  protected readonly periodo = signal(periodoActual());
  protected readonly nombrePeriodo = computed(() => nombrePeriodo(this.periodo()));
  protected readonly diasMes = computed(() => diasDelMes(this.periodo()));

  private readonly filas = computed<FilaProyecto[]>(() =>
    this.asignaciones().map((a) => ({
      ...a,
      activa: asignacionActiva(a, hoy()),
      diasEnMes: diasCubiertosEnMes(this.periodo(), a.fechaAsignacion, a.fechaFinAsignacion),
      contrato: this.contratoDe(a.tmrProyectoId),
    })));

  protected readonly visibles = computed(() => {
    const f = this.filtro();
    return this.filas().filter((x) => f === 'todos' || (f === 'activos' ? x.activa : !x.activa));
  });

  /** Proyectos con al menos un día en el mes: cada uno genera su propio honorario (RN 25). */
  protected readonly enElMes = computed(() => this.filas().filter((x) => x.diasEnMes > 0));

  protected cambiarPeriodo(valor: string): void {
    if (esPeriodoValido(valor)) this.periodo.set(valor);
  }

  protected tonoContrato(c: ContratoResumen): TonoChip {
    return c.estado === 'Vencido' ? 'danger' : c.estado === 'ProximoAVencer' ? 'warn' : 'ok';
  }

  /** El contrato más reciente de ese proyecto. */
  private contratoDe(tmrProyectoId: string): ContratoResumen | null {
    return this.contratos()
      .filter((c) => c.tmrProyectoId === tmrProyectoId)
      .sort((a, b) => b.fechaFinVigente.localeCompare(a.fechaFinVigente))[0] ?? null;
  }
}
