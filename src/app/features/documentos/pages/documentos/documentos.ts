import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { DocumentosService } from '../../services/documentos.service';
import { ETIQUETA_TIPO_DOCUMENTO, FilaDocumento, TipoDocumento } from '../../models/documento.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { hoy } from '../../../../shared/utils/fechas';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../../../shared/utils/periodo';

/**
 * Documentos tributarios (sección 8). Un documento por colaborador y mes (RN 32).
 * La lista muestra a todos los liquidados del mes: con documento ("Registrado") o sin él ("Pendiente").
 * Al elegir uno, el panel derecho permite registrarlo o corregirlo.
 *
 * API propuesta: /api/documentos (hoy de ejemplo). Query params: ?periodo= y ?colaborador=.
 */
@Component({
  selector: 'app-documentos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, Icon, EstadoChip, DineroPipe],
  templateUrl: './documentos.html',
  styleUrl: './documentos.scss',
})
export class Documentos {
  private readonly api = inject(DocumentosService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly etiquetaTipo = ETIQUETA_TIPO_DOCUMENTO;
  protected readonly tipos: TipoDocumento[] = ['Factura', 'NotaDeVenta'];
  protected readonly hoy = hoy();
  protected readonly nombrePeriodo = nombrePeriodo;

  // ── Lista y filtros ──────────────────────────────────────────────────
  protected readonly periodo = signal(this.periodoInicial());
  protected readonly filtroTipo = signal<TipoDocumento | ''>('');
  protected readonly filtroEstado = signal<'Registrado' | 'Pendiente' | ''>('');
  protected readonly filas = signal<FilaDocumento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly visibles = computed(() => this.filas().filter((f) => {
    if (this.filtroEstado() === 'Registrado' && !f.documento) return false;
    if (this.filtroEstado() === 'Pendiente' && f.documento) return false;
    if (this.filtroTipo() && f.documento?.tipo !== this.filtroTipo()) return false;
    return true;
  }));
  protected readonly pendientes = computed(() => this.filas().filter((f) => !f.documento).length);

  // ── Panel de registro ────────────────────────────────────────────────
  protected readonly seleccionadoId = signal<string | null>(this.ruta.snapshot.queryParamMap.get('colaborador'));
  protected readonly seleccionado = computed(() => this.filas().find((f) => f.colaboradorId === this.seleccionadoId()) ?? null);
  protected readonly tipo = signal<TipoDocumento>('Factura');
  protected readonly numero = signal('');
  protected readonly fechaEmision = signal('');
  protected readonly observaciones = signal('');
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string>>({});
  protected readonly errorGuardar = signal<string | null>(null);

  constructor() {
    effect(() => {
      const periodo = this.periodo();
      untracked(() => this.cargar(periodo));
    });
    // Al elegir a alguien se llena el formulario con su documento (para corregir) o vacío (para registrar).
    effect(() => {
      const f = this.seleccionado();
      untracked(() => this.llenarFormulario(f));
    });
  }

  protected cambiarPeriodo(valor: string): void {
    if (!esPeriodoValido(valor) || valor === this.periodo()) return;
    this.periodo.set(valor);
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: { periodo: valor } });
  }

  protected limpiarFiltros(): void {
    this.filtroTipo.set('');
    this.filtroEstado.set('');
  }

  protected guardar(): void {
    const f = this.seleccionado();
    if (!f) return;
    const errores: Record<string, string> = {};
    if (!/^\d{3}-\d{3}-\d{9}$/.test(this.numero().trim())) errores['numero'] = 'Usa el formato 001-001-000001234.';
    if (!this.fechaEmision()) errores['fechaEmision'] = 'Es obligatoria.';
    this.errores.set(errores);
    if (Object.keys(errores).length) return;

    const request = {
      colaboradorId: f.colaboradorId, periodo: f.periodo, tipo: this.tipo(), numero: this.numero().trim(),
      fechaEmision: this.fechaEmision(), observaciones: this.observaciones().trim() || null,
    };
    const llamada = f.documento ? this.api.corregir(f.documento.id, request) : this.api.registrar(request);
    this.guardando.set(true);
    this.errorGuardar.set(null);
    llamada.subscribe({
      next: (d) => {
        this.guardando.set(false);
        this.avisos.ok(f.documento ? `Documento corregido. La versión anterior queda en el historial.` : `${this.etiquetaTipo[d.tipo]} ${d.numero} registrada para ${f.colaborador}.`);
        this.cargar(this.periodo());
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        if (Object.keys(err.campos).length) this.errores.set(err.campos);
        else this.errorGuardar.set(err.mensaje);
      },
    });
  }

  private llenarFormulario(f: FilaDocumento | null): void {
    this.errores.set({});
    this.errorGuardar.set(null);
    this.tipo.set(f?.documento?.tipo ?? 'Factura');
    this.numero.set(f?.documento?.numero ?? '');
    this.fechaEmision.set(f?.documento?.fechaEmision ?? '');
    this.observaciones.set(f?.documento?.observaciones ?? '');
  }

  private cargar(periodo: string): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.listar(periodo).subscribe({
      next: (filas) => {
        this.filas.set(filas);
        this.cargando.set(false);
        // Si no hay nadie elegido, se propone el primer pendiente.
        if (!filas.some((f) => f.colaboradorId === this.seleccionadoId()))
          this.seleccionadoId.set(filas.find((f) => !f.documento)?.colaboradorId ?? filas[0]?.colaboradorId ?? null);
      },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }

  private periodoInicial(): string {
    const p = this.ruta.snapshot.queryParamMap.get('periodo');
    return p && esPeriodoValido(p) ? p : periodoActual();
  }
}
