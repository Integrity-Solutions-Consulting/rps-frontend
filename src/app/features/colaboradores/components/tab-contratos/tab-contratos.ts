import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ContratosService } from '../../../contratos/services/contratos.service';
import { ContratoDetalle, ContratoResumen, ETIQUETA_ESTADO_CONTRATO, EstadoContrato } from '../../../contratos/models/contrato.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';

/**
 * Pestaña "Contratos" del colaborador: un contrato por proyecto y sus adendas, como los devuelve
 * rps-backend. Para registrar contratos o adendas lleva a la pantalla Contratos.
 */
@Component({
  selector: 'app-tab-contratos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon, EstadoChip],
  templateUrl: './tab-contratos.html',
  styleUrl: './tab-contratos.scss',
})
export class TabContratos {
  private readonly api = inject(ContratosService);
  private readonly router = inject(Router);

  /** Resumen de contratos del colaborador, que ya cargó la ficha. */
  readonly contratos = input<ContratoResumen[]>([]);

  protected readonly etiquetaEstado = ETIQUETA_ESTADO_CONTRATO;
  protected readonly detalles = signal<ContratoDetalle[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly anteriorAbierto = signal<string | null>(null);

  /** Actuales: vigentes, por vencer o vencidos con asignación activa (estados que da el backend). */
  protected readonly actuales = computed(() => this.detalles().filter((d) => d.estado !== 'NoVigente'));

  /** Anteriores: el backend no los marca como vigentes ni con asignación activa. */
  protected readonly anteriores = computed(() => this.detalles().filter((d) => d.estado === 'NoVigente'));

  constructor() {
    effect(() => {
      const lista = this.contratos();
      untracked(() => this.cargarDetalles(lista));
    });
  }

  private cargarDetalles(lista: ContratoResumen[]): void {
    if (lista.length === 0) {
      this.detalles.set([]);
      this.cargando.set(false);
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    forkJoin(lista.map((c) => this.api.obtener(c.id))).subscribe({
      next: (d) => { this.detalles.set(d); this.cargando.set(false); },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }

  protected tono(estado: EstadoContrato): TonoChip {
    return estado === 'Vencido' ? 'danger' : estado === 'ProximoAVencer' ? 'warn' : estado === 'Vigente' ? 'ok' : 'neutral';
  }

  /** Abre la pantalla Contratos con este contrato seleccionado. */
  protected gestionar(contratoId: string | null, tmrColaboradorId: string | null): void {
    void this.router.navigate(['/contratos'], {
      queryParams: contratoId ? { contrato: contratoId } : { colaborador: tmrColaboradorId },
    });
  }
}
