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
  'Clasificación': 'sliders',
  'Frecuencia': 'calendar',
  'Cuenta bancaria': 'card',
  'Estado': 'refresh',
  'Contrato': 'file',
  'Adenda': 'file',
  'Honorario': 'cash',
  'Liquidación': 'calculator',
  'Anticipo': 'card',
  'Documento': 'folder',
  'Exportación': 'upload',
};

/**
 * Pestaña "Historial": todo lo que pasó con el colaborador (sección 12, "Historial por colaborador"):
 * configuración, contratos, honorarios, liquidaciones, anticipos, documentos y exportaciones.
 * Se filtra por año y tipo; cada fila lleva a la pantalla donde está el detalle.
 *
 * El estado dice lo que ocurrió con palabras exactas: un cambio de honorario no se etiqueta como
 * exportación, y una exportación no es un pago.
 * API propuesta: GET /api/colaboradores/{id}/historial (hoy de ejemplo).
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
    return { liquidaciones: cuenta('Liquidación'), anticipos: cuenta('Anticipo'), exportaciones: cuenta('Exportación') };
  });

  constructor() {
    effect(() => {
      const id = this.colaboradorId();
      this.version();
      untracked(() => this.cargar(id));
    });
  }

  /** Color del estado: exportado ≠ pagado, por eso va en azul y no en verde. */
  protected tono(estado: string | null | undefined): TonoChip {
    if (!estado) return 'neutral';
    if (estado.startsWith('Exportado')) return 'info';
    if (estado.startsWith('Recalculada') || estado === 'Programado' || estado === 'Cancelado' || estado.startsWith('Revisión retirada')) return 'warn';
    if (estado.startsWith('Revisada') || estado === 'Recuperado' || estado === 'Restaurado') return 'ok';
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
