import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { PeriodoEnPantallaService } from '../../../../core/services/periodo-en-pantalla.service';
import { ActivatedRoute } from '@angular/router';
import { ExportacionesService } from '../../services/exportaciones.service';
import { FormatoExportacion, TipoExportacion } from '../../models/exportacion.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';

interface OpcionExportacion { tipo: TipoExportacion; titulo: string; detalle: string; icono: IconName; porMes: boolean }

/**
 * Exportaciones: reportes en Excel y PDF de liquidaciones, honorarios y colaboradores
 * (/api/exportaciones). Query param: ?periodo=2026-11 (llega desde Inicio y Liquidaciones).
 */
@Component({
  selector: 'app-exportaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './exportaciones.html',
  styleUrl: './exportaciones.scss',
})
export class Exportaciones {
  private readonly api = inject(ExportacionesService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly periodo = signal(this.periodoInicial());
  /** El menú lateral muestra el mes elegido aquí (solo interfaz). */
  private readonly periodoEnPantalla = inject(PeriodoEnPantallaService);
  private readonly publicarPeriodo = effect(() => this.periodoEnPantalla.periodo.set(this.periodo()));
  protected readonly nombreMes = computed(() => nombrePeriodo(this.periodo()));

  protected cambiarPeriodo(valor: string): void {
    if (esPeriodoValido(valor)) this.periodo.set(valor);
  }

  // ── Reportes (Excel y PDF) ────────────────────────────────
  protected readonly todosLosMeses = signal(false);
  protected readonly descargando = signal<string | null>(null);

  protected readonly opciones: OpcionExportacion[] = [
    { tipo: 'liquidaciones', titulo: 'Liquidaciones', detalle: 'Todo el detalle: por colaborador, sus honorarios (proporcional, IVA, retenciones, neto) y sus cortes (base, cuotas de anticipos, valor preparado).', icono: 'calculator', porMes: true },
    { tipo: 'honorarios', titulo: 'Honorarios', detalle: 'Honorarios calculados por proyecto (o por contrato), con impuestos, retenciones y totales.', icono: 'cash', porMes: true },
    { tipo: 'colaboradores', titulo: 'Colaboradores', detalle: 'Colaboradores registrados en RPS: identificación, clasificación, frecuencia y estado.', icono: 'users', porMes: false },
  ];

  protected descargar(o: OpcionExportacion, formato: FormatoExportacion): void {
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

