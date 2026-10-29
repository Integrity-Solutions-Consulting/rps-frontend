import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ColaboradoresService } from '../../services/colaboradores.service';
import { ColaboradorDetalle, FrecuenciaVigencia } from '../../models/colaborador.models';
import { IntegracionTmrService } from '../../../integracion-tmr/services/integracion-tmr.service';
import {
  TmrColaboradorDetalle, asignacionActiva, identificacionEnmascarada, nombreCompleto,
} from '../../../integracion-tmr/models/tmr.models';
import { ContratosService } from '../../../contratos/services/contratos.service';
import { ContratoResumen } from '../../../contratos/models/contrato.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { hoy } from '../../../../shared/utils/fechas';

import { TabDatosGenerales } from '../../components/tab-datos-generales/tab-datos-generales';
import { TabProyectos } from '../../components/tab-proyectos/tab-proyectos';
import { TabCondiciones } from '../../components/tab-condiciones/tab-condiciones';
import { TabBancarios } from '../../components/tab-bancarios/tab-bancarios';
import { TabContratos } from '../../components/tab-contratos/tab-contratos';
import { TabHistorial } from '../../components/tab-historial/tab-historial';

export type PestanaFicha = 'generales' | 'proyectos' | 'condiciones' | 'bancarios' | 'contratos' | 'historial';

/**
 * Ficha del colaborador. Esta página solo carga los datos y arma la cabecera;
 * cada pestaña es un componente propio en features/colaboradores/components.
 *
 * De dónde sale cada dato:
 *   - Clasificación, frecuencia, cuenta, estado → /api/colaboradores (backend real de RPS)
 *   - Nombre, identificación, proyectos         → /api/integracion-tmr (copia de TMR; hoy de ejemplo)
 *   - Contratos                                 → /api/contratos (hoy de ejemplo)
 */
@Component({
  selector: 'app-colaborador-ficha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, Icon, EstadoChip,
    TabDatosGenerales, TabProyectos, TabCondiciones, TabBancarios, TabContratos, TabHistorial,
  ],
  templateUrl: './ficha.html',
  styleUrl: './ficha.scss',
  host: { '(document:click)': 'cerrarMenuSiEsAfuera($event)' },
})
export class ColaboradorFicha {
  private readonly colaboradores = inject(ColaboradoresService);
  private readonly tmr = inject(IntegracionTmrService);
  private readonly contratosApi = inject(ContratosService);
  private readonly avisos = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly elemento = inject(ElementRef<HTMLElement>);

  /** :id de la ruta (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly pestanas: { id: PestanaFicha; titulo: string }[] = [
    { id: 'generales', titulo: 'Datos generales' },
    { id: 'proyectos', titulo: 'Proyectos' },
    { id: 'condiciones', titulo: 'Condiciones económicas' },
    { id: 'bancarios', titulo: 'Datos bancarios' },
    { id: 'contratos', titulo: 'Contratos' },
    { id: 'historial', titulo: 'Historial' },
  ];
  protected readonly pestana = signal<PestanaFicha>('generales');

  // ── Datos ────────────────────────────────────────────────────────────
  protected readonly colaborador = signal<ColaboradorDetalle | null>(null);
  protected readonly frecuencias = signal<FrecuenciaVigencia[]>([]);
  protected readonly datosTmr = signal<TmrColaboradorDetalle | null>(null);
  protected readonly errorTmr = signal<string | null>(null);
  protected readonly contratos = signal<ContratoResumen[]>([]);
  protected readonly cargando = signal(true);
  protected readonly errorCarga = signal<string | null>(null);
  /** Se incrementa cada vez que algo cambia, para que el historial se vuelva a cargar. */
  protected readonly version = signal(0);

  protected readonly nombre = computed(() => {
    const t = this.datosTmr();
    return t ? nombreCompleto(t) : `Colaborador ${this.colaborador()?.tmrColaboradorId ?? ''}`;
  });

  protected readonly identificacion = computed(() => {
    const t = this.datosTmr();
    return t ? identificacionEnmascarada(t.identificacion) : `ID TMR ${this.colaborador()?.tmrColaboradorId ?? ''}`;
  });

  protected readonly proyectosActivos = computed(() =>
    (this.datosTmr()?.asignaciones ?? []).filter((a) => asignacionActiva(a, hoy())).length);

  /** Etiqueta de contrato de la cabecera: vigente, vencido con asignación activa o sin contrato. */
  protected readonly chipContrato = computed<{ texto: string; tono: TonoChip }>(() => {
    const lista = this.contratos();
    if (lista.some((c) => c.estado === 'Vencido' && c.asignacionActiva)) return { texto: 'Contrato vencido', tono: 'danger' };
    if (lista.some((c) => c.estado === 'ProximoAVencer')) return { texto: 'Contrato por vencer', tono: 'warn' };
    if (lista.some((c) => c.estado === 'Vigente')) return { texto: 'Contrato vigente', tono: 'ok' };
    return { texto: 'Sin contrato', tono: 'warn' };
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.cargar(id));
    });
  }

  private cargar(id: string): void {
    this.cargando.set(true);
    this.errorCarga.set(null);
    this.colaboradores.obtener(id).subscribe({
      next: (c) => {
        this.colaborador.set(c);
        this.cargando.set(false);
        this.cargarFrecuencias();
        this.cargarTmr(c.tmrColaboradorId);
        this.cargarContratos(c.tmrColaboradorId);
      },
      error: (e: unknown) => {
        this.cargando.set(false);
        this.errorCarga.set(leerErrorApi(e).mensaje);
      },
    });
  }

  private cargarFrecuencias(): void {
    this.colaboradores.listarFrecuencias(this.id()).subscribe({ next: (l) => this.frecuencias.set(l) });
  }

  private cargarTmr(tmrId: string): void {
    this.errorTmr.set(null);
    this.tmr.colaborador(tmrId).subscribe({
      next: (t) => this.datosTmr.set(t),
      error: (e: unknown) => { this.datosTmr.set(null); this.errorTmr.set(leerErrorApi(e).mensaje); },
    });
  }

  private cargarContratos(tmrId: string): void {
    this.contratosApi.listar(null, tmrId).subscribe({ next: (l) => this.contratos.set(l) });
  }

  /** Lo llaman las pestañas cuando guardan algo: vuelve a leer el detalle (el backend recalcula el estado). */
  protected alActualizar(): void {
    this.colaboradores.obtener(this.id()).subscribe({ next: (c) => this.colaborador.set(c) });
    this.cargarFrecuencias();
    const c = this.colaborador();
    if (c) this.cargarContratos(c.tmrColaboradorId);
    this.version.update((v) => v + 1);
  }

  // ── Menú Acciones ────────────────────────────────────────────────────
  protected readonly menuAbierto = signal(false);
  protected readonly confirmarDesactivar = signal(false);
  protected readonly cambiandoActivo = signal(false);

  protected cerrarMenuSiEsAfuera(evento: MouseEvent): void {
    const menu = (this.elemento.nativeElement as HTMLElement).querySelector('.acciones');
    if (this.menuAbierto() && menu && !menu.contains(evento.target as Node)) this.menuAbierto.set(false);
  }

  protected cambiarActivo(activo: boolean): void {
    this.cambiandoActivo.set(true);
    this.colaboradores.cambiarActivo(this.id(), activo).subscribe({
      next: (c) => {
        this.colaborador.set(c);
        this.cambiandoActivo.set(false);
        this.confirmarDesactivar.set(false);
        this.menuAbierto.set(false);
        this.version.update((v) => v + 1);
        this.avisos.ok(activo ? 'Colaborador activado.' : 'Colaborador desactivado. Su historial se conserva.');
      },
      error: (e: unknown) => {
        this.cambiandoActivo.set(false);
        this.avisos.error(leerErrorApi(e).mensaje);
      },
    });
  }

  protected verEnContratos(): void {
    this.menuAbierto.set(false);
    void this.router.navigate(['/contratos'], { queryParams: { colaborador: this.colaborador()?.tmrColaboradorId } });
  }
}
