import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ColaboradoresService } from '../../services/colaboradores.service';
import { EventoHistorial, TipoEvento } from '../../models/colaborador.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon, IconName } from '../../../../shared/components/icon/icon';

const ICONO_POR_TIPO: Record<TipoEvento, IconName> = {
  'Vinculación': 'users',
  'Clasificación': 'sliders',
  'Frecuencia': 'calendar',
  'Cuenta bancaria': 'card',
  'Estado': 'refresh',
  'Contrato': 'file',
  'Adenda': 'file',
  'Honorario': 'cash',
};

/**
 * Pestaña "Historial": movimientos del colaborador (configuración, contratos, adendas, honorarios),
 * del más reciente al más antiguo (RN 48, RC 03).
 * API propuesta: GET /api/colaboradores/{id}/historial (hoy de ejemplo).
 */
@Component({
  selector: 'app-tab-historial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon],
  templateUrl: './tab-historial.html',
  styleUrl: './tab-historial.scss',
})
export class TabHistorial {
  private readonly api = inject(ColaboradoresService);

  readonly colaboradorId = input.required<string>();
  /** La ficha lo incrementa cuando algo cambia, para volver a cargar. */
  readonly version = input(0);

  protected readonly iconos = ICONO_POR_TIPO;
  protected readonly eventos = signal<EventoHistorial[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly filtro = signal<TipoEvento | 'Todos'>('Todos');

  protected readonly tipos = computed(() => {
    const conteo = new Map<TipoEvento, number>();
    for (const e of this.eventos()) conteo.set(e.tipo, (conteo.get(e.tipo) ?? 0) + 1);
    return [...conteo.entries()].map(([tipo, total]) => ({ tipo, total }));
  });

  protected readonly visibles = computed(() => {
    const f = this.filtro();
    return f === 'Todos' ? this.eventos() : this.eventos().filter((e) => e.tipo === f);
  });

  constructor() {
    effect(() => {
      const id = this.colaboradorId();
      this.version();
      untracked(() => this.cargar(id));
    });
  }

  private cargar(id: string): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.historial(id).subscribe({
      next: (lista) => { this.eventos.set(lista); this.cargando.set(false); },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }
}
