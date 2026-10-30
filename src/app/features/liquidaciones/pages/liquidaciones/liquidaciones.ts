import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { LiquidacionesService } from '../../services/liquidaciones.service';
import {
  LiquidacionDetalle, LiquidacionResumen, LiquidacionesPeriodo, corteDe,
} from '../../models/liquidacion.models';
import { ETIQUETA_CLASIFICACION, ETIQUETA_FRECUENCIA } from '../../../colaboradores/models/colaborador.models';
import { ETIQUETA_MODALIDAD } from '../../../honorarios/models/honorario.models';
import { ETIQUETA_ESTADO_CONTRATO } from '../../../contratos/models/contrato.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { NotificacionesService } from '../../../notificaciones/services/notificaciones.service';
import { ETIQUETA_CORTE, TipoCorte, rangoCorte } from '../../../../shared/models/corte';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';

type Vista = 'resumen' | 'cortes';

/**
 * Liquidaciones del mes (secciones 6 a 9 y 11 de los requisitos).
 * Lista a la izquierda y, al elegir a alguien, su detalle a la derecha:
 * proyecto por proyecto (días, impuestos, neto), cortes y la casilla "Revisado para envío".
 *
 * API propuesta: /api/liquidaciones (hoy de ejemplo).
 * Query params: ?periodo=2026-11 y ?liquidacion=<id> (llegan desde el historial del colaborador).
 */
@Component({
  selector: 'app-liquidaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Icon, EstadoChip, DineroPipe],
  templateUrl: './liquidaciones.html',
  styleUrl: './liquidaciones.scss',
})
export class Liquidaciones {
  private readonly api = inject(LiquidacionesService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bandeja = inject(NotificacionesService);

  protected readonly etiquetaCorte = ETIQUETA_CORTE;
  protected readonly etiquetaClasificacion = ETIQUETA_CLASIFICACION;
  protected readonly etiquetaFrecuencia = ETIQUETA_FRECUENCIA;
  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;
  protected readonly etiquetaContrato = ETIQUETA_ESTADO_CONTRATO;
  protected readonly corteDe = corteDe;
  protected readonly rangoCorte = rangoCorte;

  // ── Estado de la pantalla ────────────────────────────────────────────
  protected readonly periodo = signal(this.periodoInicial());
  protected readonly vista = signal<Vista>('resumen');
  protected readonly datos = signal<LiquidacionesPeriodo | null>(null);
  protected readonly cargando = signal(true);
  protected readonly calculando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly seleccionadoId = signal<string | null>(this.ruta.snapshot.queryParamMap.get('liquidacion'));
  protected readonly detalle = signal<LiquidacionDetalle | null>(null);
  protected readonly cargandoDetalle = signal(false);
  protected readonly errorDetalle = signal<string | null>(null);
  protected readonly guardandoRevision = signal(false);

  protected readonly nombreMes = computed(() => nombrePeriodo(this.periodo()));
  protected readonly filas = computed(() => this.datos()?.filas ?? []);

  /** Totales del mes para los indicadores y la fila "Total del período". */
  protected readonly totales = computed(() => {
    const f = this.filas();
    const suma = (fn: (l: LiquidacionResumen) => number) => Math.round(f.reduce((s, l) => s + fn(l), 0) * 100) / 100;
    return {
      neto: suma((l) => l.netoConsolidado),
      descQ: suma((l) => corteDe(l, 'Quincena').descuento),
      valorQ: suma((l) => corteDe(l, 'Quincena').valor),
      descF: suma((l) => corteDe(l, 'FinDeMes').descuento),
      valorF: suma((l) => corteDe(l, 'FinDeMes').valor),
      revisadas: f.filter((l) => l.revisado).length,
      recalcular: f.filter((l) => l.requiereRecalculo).length,
      sinDocumento: f.filter((l) => l.documento === 'Pendiente').length,
    };
  });

  constructor() {
    effect(() => {
      const periodo = this.periodo();
      untracked(() => this.cargar(periodo));
    });
    effect(() => {
      const id = this.seleccionadoId();
      untracked(() => this.cargarDetalle(id));
    });
  }

  // ── Acciones ─────────────────────────────────────────────────────────
  protected cambiarPeriodo(valor: string): void {
    if (!esPeriodoValido(valor) || valor === this.periodo()) return;
    this.seleccionadoId.set(null);
    this.periodo.set(valor);
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: { periodo: valor } });
  }

  protected calcular(): void {
    this.calculando.set(true);
    this.error.set(null);
    this.api.calcular(this.periodo()).subscribe({
      next: (d) => {
        this.calculando.set(false);
        const antes = this.datos();
        this.datos.set(d);
        const nuevas = d.filas.filter((f) => !antes?.filas.some((a) => a.id === f.id && a.version === f.version)).length;
        this.avisos.ok(nuevas === 0
          ? `${this.nombreMes()} ya estaba al día: no cambió ningún importe.`
          : `${this.nombreMes()} calculado: ${nuevas} ${nuevas === 1 ? 'liquidación nueva o actualizada' : 'liquidaciones nuevas o actualizadas'}.`);
        this.cargarDetalle(this.seleccionadoId());
      },
      error: (e: unknown) => { this.calculando.set(false); this.avisos.error(leerErrorApi(e).mensaje); },
    });
  }

  /** Abre la ventana de notificaciones filtrada en "Configuración incompleta". */
  protected verPendientes(): void {
    this.bandeja.abrir('Configuracion');
  }

  protected elegir(l: LiquidacionResumen): void {
    this.seleccionadoId.set(this.seleccionadoId() === l.id ? null : l.id);
  }

  protected cambiarRevision(l: Pick<LiquidacionResumen, 'id' | 'revisado'>, revisado: boolean): void {
    this.guardandoRevision.set(true);
    this.api.marcarRevisado(l.id, revisado).subscribe({
      next: (actualizada) => {
        this.guardandoRevision.set(false);
        this.reemplazarFila(actualizada);
        const d = this.detalle();
        if (d?.id === actualizada.id) this.detalle.set({ ...d, ...actualizada });
      },
      error: (e: unknown) => {
        this.guardandoRevision.set(false);
        this.avisos.error(leerErrorApi(e).mensaje);
        // Devuelve la casilla a su estado real.
        this.cargar(this.periodo());
      },
    });
  }

  // ── Presentación ─────────────────────────────────────────────────────
  protected iniciales(nombre: string): string {
    return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }

  protected textoCorteExportado(l: LiquidacionResumen, corte: TipoCorte): string | null {
    const v = corteDe(l, corte).versionExportada;
    return v ? `Exportado v${v}` : null;
  }

  protected tieneCorte(l: LiquidacionResumen, corte: TipoCorte): boolean {
    return l.cortes.some((c) => c.corte === corte);
  }

  // ── Carga ────────────────────────────────────────────────────────────
  private cargar(periodo: string): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.listar(periodo).subscribe({
      next: (d) => { this.datos.set(d); this.cargando.set(false); },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }

  private cargarDetalle(id: string | null): void {
    if (!id) { this.detalle.set(null); return; }
    this.cargandoDetalle.set(true);
    this.errorDetalle.set(null);
    this.api.obtener(id).subscribe({
      next: (d) => { this.detalle.set(d); this.cargandoDetalle.set(false); },
      error: (e: unknown) => { this.cargandoDetalle.set(false); this.errorDetalle.set(leerErrorApi(e).mensaje); },
    });
  }

  private reemplazarFila(fila: LiquidacionResumen): void {
    const d = this.datos();
    if (d) this.datos.set({ ...d, filas: d.filas.map((f) => (f.id === fila.id ? fila : f)) });
  }

  private periodoInicial(): string {
    const p = this.ruta.snapshot.queryParamMap.get('periodo');
    return p && esPeriodoValido(p) ? p : periodoActual();
  }
}
