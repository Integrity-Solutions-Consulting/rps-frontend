import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ExportacionesService } from '../../services/exportaciones.service';
import { ExportacionPago, FormatoExportacion, PreviewExportacionPago, TipoExportacion } from '../../models/exportacion.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { ETIQUETA_CORTE, TipoCorte } from '../../../../shared/models/corte';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';

interface OpcionExportacion { tipo: TipoExportacion; titulo: string; detalle: string; icono: IconName; porMes: boolean; pdf?: boolean }

/**
 * Exportaciones: el Excel de pago por corte (RN 52-57, POST/GET /api/exportaciones/pago) y,
 * debajo, los reportes CSV/PDF de solo lectura que ya existían (/api/exportaciones).
 * Query param: ?periodo=2026-11 (llega desde Inicio y Liquidaciones).
 */
@Component({
  selector: 'app-exportaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, DineroPipe, DatePipe],
  templateUrl: './exportaciones.html',
  styleUrl: './exportaciones.scss',
})
export class Exportaciones {
  private readonly api = inject(ExportacionesService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly etiquetaCorte = ETIQUETA_CORTE;
  protected readonly cortes: TipoCorte[] = ['Quincena', 'FinDeMes'];
  protected readonly periodo = signal(this.periodoInicial());
  protected readonly nombreMes = computed(() => nombrePeriodo(this.periodo()));

  // ── Excel de pago (RN 52-57) ──────────────────────────────────────────
  protected readonly corte = signal<TipoCorte>('Quincena');
  protected readonly preview = signal<PreviewExportacionPago | null>(null);
  protected readonly cargandoPreview = signal(false);
  protected readonly errorPreview = signal<string | null>(null);
  protected readonly seleccionados = signal<ReadonlySet<string>>(new Set());
  protected readonly generando = signal(false);
  protected readonly historial = signal<ExportacionPago[]>([]);
  protected readonly cargandoHistorial = signal(false);

  protected readonly totalSeleccionado = computed(() => {
    const p = this.preview();
    const sel = this.seleccionados();
    return p ? p.items.filter((i) => sel.has(i.colaboradorId)).reduce((s, i) => s + i.importe, 0) : 0;
  });

  protected readonly todosSeleccionados = computed(() => {
    const p = this.preview();
    return !!p && p.items.length > 0 && p.items.every((i) => this.seleccionados().has(i.colaboradorId));
  });

  constructor() {
    this.cargarPreview();
    this.cargarHistorial();
  }

  protected cambiarPeriodo(valor: string): void {
    if (!esPeriodoValido(valor)) return;
    this.periodo.set(valor);
    this.cargarPreview();
    this.cargarHistorial();
  }

  protected cambiarCorte(valor: TipoCorte): void {
    this.corte.set(valor);
    this.cargarPreview();
    this.cargarHistorial();
  }

  protected cargarPreview(): void {
    this.cargandoPreview.set(true);
    this.errorPreview.set(null);
    this.api.previsualizarPago(this.periodo(), this.corte()).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.seleccionados.set(new Set(p.items.map((i) => i.colaboradorId)));
        this.cargandoPreview.set(false);
      },
      error: (e: unknown) => {
        this.preview.set(null);
        this.cargandoPreview.set(false);
        this.errorPreview.set(leerErrorApi(e).mensaje);
      },
    });
  }

  private cargarHistorial(): void {
    this.cargandoHistorial.set(true);
    this.api.listarPago(this.periodo(), this.corte()).subscribe({
      next: (lista) => { this.historial.set(lista); this.cargandoHistorial.set(false); },
      error: () => this.cargandoHistorial.set(false),
    });
  }

  protected alternarSeleccion(colaboradorId: string): void {
    const actual = new Set(this.seleccionados());
    if (actual.has(colaboradorId)) actual.delete(colaboradorId); else actual.add(colaboradorId);
    this.seleccionados.set(actual);
  }

  protected alternarTodos(): void {
    const p = this.preview();
    if (!p) return;
    this.seleccionados.set(this.todosSeleccionados() ? new Set() : new Set(p.items.map((i) => i.colaboradorId)));
  }

  protected generar(): void {
    const seleccionIds = [...this.seleccionados()];
    if (seleccionIds.length === 0) return;
    this.generando.set(true);
    this.api.generarPago(this.periodo(), this.corte(), seleccionIds).subscribe({
      next: (e) => {
        this.generando.set(false);
        this.avisos.ok(`Excel de pago generado: versión ${e.version}, ${e.colaboradores} colaboradores, ${formatoDinero(e.total)}.`);
        this.cargarPreview();
        this.cargarHistorial();
      },
      error: (e: unknown) => { this.generando.set(false); this.avisos.error(leerErrorApi(e).mensaje); },
    });
  }

  protected descargarVersion(e: ExportacionPago): void {
    this.api.descargarPago(e.id).subscribe({
      next: (archivo) => descargarBlob(archivo.nombre, archivo.contenido),
      error: (err: unknown) => this.avisos.error(leerErrorApi(err).mensaje),
    });
  }

  // ── Reportes de solo lectura (CSV/PDF) ────────────────────────────────
  protected readonly todosLosMeses = signal(false);
  protected readonly descargando = signal<string | null>(null);

  protected readonly opciones: OpcionExportacion[] = [
    { tipo: 'liquidaciones', titulo: 'Liquidaciones', detalle: 'Neto consolidado por colaborador. El PDF suma cortes, anticipos y totales.', icono: 'calculator', porMes: true, pdf: true },
    { tipo: 'honorarios', titulo: 'Honorarios', detalle: 'Honorarios calculados por proyecto. El PDF incluye totales.', icono: 'cash', porMes: true, pdf: true },
    { tipo: 'colaboradores', titulo: 'Colaboradores', detalle: 'Colaboradores registrados en RPS. El PDF muestra nombres y estado.', icono: 'users', porMes: false, pdf: true },
  ];

  protected descargar(o: OpcionExportacion, formato: FormatoExportacion = 'csv'): void {
    this.descargando.set(`${o.tipo}-${formato}`);
    this.api.descargar(o.tipo, this.todosLosMeses() ? null : this.periodo(), formato).subscribe({
      next: (archivo) => { this.descargando.set(null); descargarBlob(archivo.nombre, archivo.contenido); },
      error: (e: unknown) => { this.descargando.set(null); this.avisos.error(leerErrorApi(e).mensaje); },
    });
  }

  private periodoInicial(): string {
    const p = this.ruta.snapshot.queryParamMap.get('periodo');
    return p && esPeriodoValido(p) ? p : periodoActual();
  }
}

function descargarBlob(nombre: string, contenido: Blob): void {
  const url = URL.createObjectURL(contenido);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

function formatoDinero(valor: number): string {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(valor);
}
