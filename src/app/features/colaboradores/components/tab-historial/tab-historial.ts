import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ColaboradoresService } from '../../services/colaboradores.service';
import { EventoHistorial, TipoEvento } from '../../models/colaborador.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { nombrePeriodo } from '../../../../shared/utils/periodo';

const ICONO_POR_TIPO: Record<TipoEvento, IconName> = {
  'Vinculación': 'users',
  'Frecuencia': 'calendar',
  'Contrato': 'file',
  'Adenda': 'file',
  'Honorario': 'cash',
  'Liquidación': 'calculator',
  'Anticipo': 'card',
};

/**
 * Pestaña "Historial": lo que devuelve GET /api/colaboradores/{id}/historial (vinculación, frecuencias,
 * contratos, adendas, honorarios, liquidaciones y anticipos).
 * Se filtra por año y tipo; cada fila lleva a la pantalla donde está el detalle.
 */
@Component({
  selector: 'app-tab-historial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, Icon, EstadoChip, DineroPipe],
  templateUrl: './tab-historial.html',
  styleUrl: './tab-historial.scss',
})
export class TabHistorial {
  private readonly api = inject(ColaboradoresService);

  readonly colaboradorId = input.required<string>();
  /** La ficha lo incrementa cuando algo cambia, para volver a cargar. */
  readonly version = input(0);

  protected readonly iconos = ICONO_POR_TIPO;
  protected readonly nombrePeriodo = nombrePeriodo;
  protected readonly eventos = signal<EventoHistorial[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly anio = signal<string>(String(new Date().getFullYear()));
  protected readonly tipo = signal<TipoEvento | ''>('');

  /** Años con movimientos, del más reciente al más antiguo. */
  protected readonly anios = computed(() => {
    const lista = [...new Set(this.eventos().map((e) => e.fecha.slice(0, 4)))].sort().reverse();
    return lista.length ? lista : [String(new Date().getFullYear())];
  });

  protected readonly delAnio = computed(() => this.eventos().filter((e) => e.fecha.startsWith(this.anio())));

  protected readonly tipos = computed(() => [...new Set(this.delAnio().map((e) => e.tipo))]);

  protected readonly visibles = computed(() => {
    const t = this.tipo();
    return t ? this.delAnio().filter((e) => e.tipo === t) : this.delAnio();
  });

  protected readonly contadores = computed(() => {
    const cuenta = (t: TipoEvento) => this.delAnio().filter((e) => e.tipo === t).length;
    return { liquidaciones: cuenta('Liquidación'), anticipos: cuenta('Anticipo') };
  });

  constructor() {
    effect(() => {
      const id = this.colaboradorId();
      this.version();
      untracked(() => this.cargar(id));
    });
  }

  /** Color del chip según el estado que manda el backend. */
  protected tono(estado: string | null | undefined): TonoChip {
    if (estado === 'Programado') return 'warn';
    if (estado === 'Revisada') return 'ok';
    return 'neutral';
  }

  private cargar(id: string): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.historial(id).subscribe({
      next: (lista) => {
        this.eventos.set(lista);
        this.cargando.set(false);
        if (!this.anios().includes(this.anio())) this.anio.set(this.anios()[0]);
      },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }
}
