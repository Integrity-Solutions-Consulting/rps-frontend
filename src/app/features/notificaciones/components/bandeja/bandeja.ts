import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotificacionesService } from '../../services/notificaciones.service';
import { ETIQUETA_TIPO, Notificacion, Severidad, TipoNotificacion } from '../../models/notificacion.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';

const POR_PAGINA = 20;

/**
 * Ventana con todas las notificaciones ("Ver todas" de la campana, o desde una pantalla con
 * filtro). Tiene búsqueda por nombre o texto, filtro por tipo y severidad, y páginas de 20,
 * para que siga siendo usable con cientos de avisos.
 * Se cierra con Esc, con la X o haciendo clic fuera.
 */
@Component({
  selector: 'app-bandeja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, Icon, EstadoChip],
  templateUrl: './bandeja.html',
  styleUrl: './bandeja.scss',
  host: { '(document:keydown.escape)': 'cerrar()' },
})
export class Bandeja implements AfterViewInit {
  protected readonly servicio = inject(NotificacionesService);
  private readonly buscador = viewChild<ElementRef<HTMLInputElement>>('buscador');

  protected readonly etiquetaTipo = ETIQUETA_TIPO;
  protected readonly busqueda = signal('');
  protected readonly tipo = signal<TipoNotificacion | ''>(this.servicio.filtroInicial() ?? '');
  protected readonly severidad = signal<Severidad | ''>('');
  protected readonly pagina = signal(1);

  /** Tipos que tienen al menos una notificación, con su cantidad. */
  protected readonly tipos = computed(() => {
    const conteo = new Map<TipoNotificacion, number>();
    for (const n of this.servicio.lista()) conteo.set(n.tipo, (conteo.get(n.tipo) ?? 0) + 1);
    return [...conteo.entries()].map(([t, total]) => ({ tipo: t, total }));
  });

  protected readonly filtradas = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    return this.servicio.ordenadas().filter((n) =>
      (!this.tipo() || n.tipo === this.tipo())
      && (!this.severidad() || n.severidad === this.severidad())
      && (!texto || `${n.colaborador ?? ''} ${n.titulo} ${n.mensaje}`.toLowerCase().includes(texto)));
  });

  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.filtradas().length / POR_PAGINA)));
  protected readonly visibles = computed(() => {
    const inicio = (Math.min(this.pagina(), this.totalPaginas()) - 1) * POR_PAGINA;
    return this.filtradas().slice(inicio, inicio + POR_PAGINA);
  });
  protected readonly rango = computed(() => {
    const total = this.filtradas().length;
    const desde = total === 0 ? 0 : (Math.min(this.pagina(), this.totalPaginas()) - 1) * POR_PAGINA + 1;
    return { desde, hasta: Math.min(desde + POR_PAGINA - 1, total), total };
  });

  constructor() {
    // Cualquier cambio de filtro vuelve a la primera página.
    effect(() => {
      this.busqueda(); this.tipo(); this.severidad();
      untracked(() => this.pagina.set(1));
    });
  }

  ngAfterViewInit(): void {
    this.buscador()?.nativeElement.focus();
  }

  protected cerrar(): void {
    this.servicio.cerrar();
  }

  protected limpiar(): void {
    this.busqueda.set('');
    this.tipo.set('');
    this.severidad.set('');
  }

  protected tono(n: Notificacion): TonoChip {
    return n.severidad === 'Critica' ? 'danger' : n.severidad === 'Advertencia' ? 'warn' : 'info';
  }

  protected textoSeveridad(n: Notificacion): string {
    return n.severidad === 'Critica' ? 'Crítica' : n.severidad;
  }
}
