import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ExportacionesService } from '../../services/exportaciones.service';
import { CandidatoExportacion, Exportacion, PreparacionExportacion } from '../../models/exportacion.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { ETIQUETA_CORTE, TipoCorte, rangoCorte } from '../../../../shared/models/corte';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';

/**
 * Exportaciones (sección 12). Arriba se prepara el archivo de un mes y corte: se eligen
 * colaboradores, se ven importes y advertencias y el total antes de generar (RN 53).
 * Abajo, las versiones ya generadas para volver a descargarlas (RN 55).
 *
 * RPS no hace transferencias ni marca nada como pagado (RN 52, RN 56).
 * API propuesta: /api/exportaciones (hoy de ejemplo). Query params: ?periodo= y ?corte=.
 */
@Component({
  selector: 'app-exportaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Icon, EstadoChip, DineroPipe],
  templateUrl: './exportaciones.html',
  styleUrl: './exportaciones.scss',
})
export class Exportaciones {
  private readonly api = inject(ExportacionesService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly etiquetaCorte = ETIQUETA_CORTE;
  protected readonly rangoCorte = rangoCorte;
  protected readonly nombrePeriodo = nombrePeriodo;
  protected readonly cortes: TipoCorte[] = ['Quincena', 'FinDeMes'];

  // ── Preparación ──────────────────────────────────────────────────────
  protected readonly periodo = signal(this.periodoInicial());
  protected readonly corte = signal<TipoCorte>(this.ruta.snapshot.queryParamMap.get('corte') === 'Quincena' ? 'Quincena' : 'FinDeMes');
  protected readonly preparacion = signal<PreparacionExportacion | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly elegidos = signal<Set<string>>(new Set());
  protected readonly generando = signal(false);
  /** Paso de confirmación cuando la selección repite colaboradores ya exportados. */
  protected readonly confirmando = signal(false);

  protected readonly seleccion = computed(() => {
    const ids = this.elegidos();
    const lista = (this.preparacion()?.candidatos ?? []).filter((c) => ids.has(c.liquidacionId));
    return {
      lista,
      total: Math.round(lista.reduce((s, c) => s + c.valor, 0) * 100) / 100,
      repetidos: lista.filter((c) => c.versionExportada).length,
      sinRevisar: lista.filter((c) => !c.revisado).length,
      sinDocumento: lista.filter((c) => !c.documentoRegistrado).length,
    };
  });
  protected readonly todosElegidos = computed(() => {
    const c = this.preparacion()?.candidatos ?? [];
    return c.length > 0 && c.every((x) => this.elegidos().has(x.liquidacionId));
  });

  // ── Versiones generadas ──────────────────────────────────────────────
  protected readonly versiones = signal<Exportacion[]>([]);
  protected readonly soloEsteMes = signal(true);
  protected readonly abierta = signal<string | null>(null);
  protected readonly descargando = signal<string | null>(null);

  constructor() {
    effect(() => {
      const periodo = this.periodo();
      const corte = this.corte();
      untracked(() => this.cargarPreparacion(periodo, corte));
    });
    effect(() => {
      const periodo = this.soloEsteMes() ? this.periodo() : null;
      untracked(() => this.cargarVersiones(periodo));
    });
  }

  // ── Acciones ─────────────────────────────────────────────────────────
  protected cambiarPeriodo(valor: string): void {
    if (!esPeriodoValido(valor) || valor === this.periodo()) return;
    this.periodo.set(valor);
    this.actualizarUrl();
  }

  protected cambiarCorte(corte: TipoCorte): void {
    this.corte.set(corte);
    this.actualizarUrl();
  }

  protected alternar(c: CandidatoExportacion, marcado: boolean): void {
    const s = new Set(this.elegidos());
    if (marcado) s.add(c.liquidacionId); else s.delete(c.liquidacionId);
    this.elegidos.set(s);
    this.confirmando.set(false);
  }

  protected alternarTodos(marcado: boolean): void {
    this.elegidos.set(new Set(marcado ? (this.preparacion()?.candidatos ?? []).map((c) => c.liquidacionId) : []));
    this.confirmando.set(false);
  }

  protected generar(): void {
    const s = this.seleccion();
    if (s.lista.length === 0) return;
    // Control propuesto: advertir antes de repetir colaboradores ya exportados.
    if (s.repetidos > 0 && !this.confirmando()) { this.confirmando.set(true); return; }
    this.confirmando.set(false);
    this.generando.set(true);
    this.api.generar({ periodo: this.periodo(), corte: this.corte(), liquidacionIds: s.lista.map((c) => c.liquidacionId) }).subscribe({
      next: (e) => {
        this.generando.set(false);
        this.avisos.ok(`Versión ${e.version} generada: ${e.filas.length} ${e.filas.length === 1 ? 'colaborador' : 'colaboradores'}. Descargando el archivo…`);
        this.descargar(e);
        this.cargarPreparacion(this.periodo(), this.corte());
        this.cargarVersiones(this.soloEsteMes() ? this.periodo() : null);
      },
      error: (err: unknown) => { this.generando.set(false); this.avisos.error(leerErrorApi(err).mensaje); },
    });
  }

  /** Descarga otra vez el archivo guardado. No crea una versión nueva. */
  protected descargar(e: Exportacion): void {
    this.descargando.set(e.id);
    this.api.descargar(e.id).subscribe({
      next: (archivo) => {
        this.descargando.set(null);
        const url = URL.createObjectURL(archivo);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = e.nombreArchivo;
        enlace.click();
        URL.revokeObjectURL(url);
      },
      error: (err: unknown) => { this.descargando.set(null); this.avisos.error(leerErrorApi(err).mensaje); },
    });
  }

  // ── Carga ────────────────────────────────────────────────────────────
  private cargarPreparacion(periodo: string, corte: TipoCorte): void {
    this.cargando.set(true);
    this.error.set(null);
    this.confirmando.set(false);
    this.api.preparar(periodo, corte).subscribe({
      next: (p) => {
        this.preparacion.set(p);
        this.cargando.set(false);
        // Por defecto se eligen los revisados que todavía no salieron en este corte.
        this.elegidos.set(new Set(p.candidatos.filter((c) => c.revisado && !c.versionExportada && !c.requiereRecalculo).map((c) => c.liquidacionId)));
      },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }

  private cargarVersiones(periodo: string | null): void {
    this.api.listar(periodo).subscribe({
      next: (l) => this.versiones.set(l),
      error: () => this.versiones.set([]),
    });
  }

  private actualizarUrl(): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: { periodo: this.periodo(), corte: this.corte() } });
  }

  private periodoInicial(): string {
    const p = this.ruta.snapshot.queryParamMap.get('periodo');
    return p && esPeriodoValido(p) ? p : periodoActual();
  }
}
