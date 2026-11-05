import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ExportacionesService } from '../../services/exportaciones.service';
import { FormatoExportacion, TipoExportacion } from '../../models/exportacion.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';

interface OpcionExportacion { tipo: TipoExportacion; titulo: string; detalle: string; icono: IconName; porMes: boolean; pdf?: boolean }

/**
 * Exportaciones: descarga los CSV que genera rps-backend. El contenido y las columnas los decide el backend.
 * Query param: ?periodo=2026-11 (llega desde Inicio y Liquidaciones).
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
  /** true: honorarios y liquidaciones de todos los meses (el backend lo permite sin período). */
  protected readonly todosLosMeses = signal(false);
  protected readonly nombreMes = computed(() => nombrePeriodo(this.periodo()));
  /** Qué se está descargando, p. ej. "liquidaciones-pdf". */
  protected readonly descargando = signal<string | null>(null);

  protected readonly opciones: OpcionExportacion[] = [
    { tipo: 'liquidaciones', titulo: 'Liquidaciones', detalle: 'Liquidaciones del mes con sus cortes. En PDF, con logo, encabezado y totales.', icono: 'calculator', porMes: true, pdf: true },
    { tipo: 'honorarios', titulo: 'Honorarios', detalle: 'Honorarios calculados por proyecto.', icono: 'cash', porMes: true },
    { tipo: 'colaboradores', titulo: 'Colaboradores', detalle: 'Colaboradores registrados en RPS.', icono: 'users', porMes: false },
  ];

  protected cambiarPeriodo(valor: string): void {
    if (esPeriodoValido(valor)) this.periodo.set(valor);
  }

  protected descargar(o: OpcionExportacion, formato: FormatoExportacion = 'csv'): void {
    this.descargando.set(`${o.tipo}-${formato}`);
    this.api.descargar(o.tipo, this.todosLosMeses() ? null : this.periodo(), formato).subscribe({
      next: (archivo) => {
        this.descargando.set(null);
        const url = URL.createObjectURL(archivo.contenido);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = archivo.nombre;
        enlace.click();
        URL.revokeObjectURL(url);
      },
      error: (e: unknown) => { this.descargando.set(null); this.avisos.error(leerErrorApi(e).mensaje); },
    });
  }

  private periodoInicial(): string {
    const p = this.ruta.snapshot.queryParamMap.get('periodo');
    return p && esPeriodoValido(p) ? p : periodoActual();
  }
}
