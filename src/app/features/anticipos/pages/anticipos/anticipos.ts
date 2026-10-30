import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of, catchError } from 'rxjs';

import { AnticiposService } from '../../services/anticipos.service';
import { Anticipo, ResumenAnticipos } from '../../models/anticipo.models';
import { ColaboradoresService } from '../../../colaboradores/services/colaboradores.service';
import { ETIQUETA_CLASIFICACION, ETIQUETA_FRECUENCIA } from '../../../colaboradores/models/colaborador.models';
import { IntegracionTmrService } from '../../../integracion-tmr/services/integracion-tmr.service';
import { TmrColaborador, identificacionEnmascarada, nombreCompleto } from '../../../integracion-tmr/models/tmr.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { SoloNumeros } from '../../../../shared/directives/solo-numeros.directive';
import { ETIQUETA_CORTE, TipoCorte } from '../../../../shared/models/corte';
import { hoy } from '../../../../shared/utils/fechas';
import { nombrePeriodo } from '../../../../shared/utils/periodo';

interface OpcionColaborador { id: string; nombre: string }
interface CuotaForm { clave: number; corte: TipoCorte; monto: string }

const r2 = (v: number) => Math.round(v * 100) / 100;
const numero = (texto: string) => {
  const v = Number(texto.replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
};

/**
 * Anticipos adicionales (sección 10). Se elige al colaborador y la fecha; la pantalla muestra
 * su neto de referencia, saldo pendiente, límite y lo que queda en cada corte, y valida el plan
 * de recuperación mientras se escribe. El backend vuelve a validar todo al guardar.
 *
 * API propuesta: /api/anticipos (hoy de ejemplo). Query param: ?colaborador=<id de RPS>.
 */
@Component({
  selector: 'app-anticipos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, Icon, EstadoChip, DineroPipe, SoloNumeros],
  templateUrl: './anticipos.html',
  styleUrl: './anticipos.scss',
})
export class Anticipos {
  private readonly api = inject(AnticiposService);
  private readonly colaboradoresApi = inject(ColaboradoresService);
  private readonly tmrApi = inject(IntegracionTmrService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly etiquetaCorte = ETIQUETA_CORTE;
  protected readonly etiquetaClasificacion = ETIQUETA_CLASIFICACION;
  protected readonly etiquetaFrecuencia = ETIQUETA_FRECUENCIA;
  protected readonly enmascarar = identificacionEnmascarada;

  // ── Colaborador y mes ────────────────────────────────────────────────
  protected readonly opciones = signal<OpcionColaborador[]>([]);
  protected readonly colaboradorId = signal<string>(this.ruta.snapshot.queryParamMap.get('colaborador') ?? '');
  protected readonly fecha = signal(hoy());
  /** Desde el primer día del mes en curso: los meses pasados ya no admiten anticipos. */
  protected readonly minFecha = `${hoy().slice(0, 7)}-01`;
  /** El anticipo se recupera en el mes de su fecha (RN 45). */
  protected readonly periodo = computed(() => (this.fecha() || hoy()).slice(0, 7));
  protected readonly nombreMes = computed(() => nombrePeriodo(this.periodo()));

  protected readonly resumen = signal<ResumenAnticipos | null>(null);
  protected readonly cargandoResumen = signal(false);
  protected readonly errorResumen = signal<string | null>(null);
  protected readonly anticipos = signal<Anticipo[]>([]);

  // ── Formulario ───────────────────────────────────────────────────────
  protected readonly monto = signal('');
  protected readonly observaciones = signal('');
  protected readonly cuotas = signal<CuotaForm[]>([]);
  protected readonly guardando = signal(false);
  protected readonly errorGuardar = signal<string | null>(null);
  private siguienteClave = 1;

  /** Cortes en los que se puede programar una cuota: los del colaborador que aún no se exportan. */
  protected readonly cortesPermitidos = computed(() =>
    (this.resumen()?.cortes ?? []).filter((c) => !c.versionExportada).map((c) => c.corte));

  /** Cuentas del formulario y validación en vivo (las mismas reglas que el backend). */
  protected readonly validacion = computed(() => {
    const r = this.resumen();
    const monto = r2(numero(this.monto()));
    const cuotas = this.cuotas().map((c) => ({ ...c, valor: r2(numero(c.monto)) }));
    const distribuido = r2(cuotas.reduce((s, c) => s + c.valor, 0));
    const saldo = r?.saldoPendiente ?? 0;
    const proyectado = r2(saldo + monto);
    const limite = r?.limite ?? null;
    const disponibleDespues = limite === null ? null : r2(limite - proyectado);

    const porCorte = (r?.cortes ?? []).map((c) => {
      const pedido = r2(cuotas.filter((q) => q.corte === c.corte).reduce((s, q) => s + q.valor, 0));
      return { ...c, pedido, queda: r2(c.disponible - pedido) };
    });

    const errores: string[] = [];
    if (monto <= 0) errores.push('Escribe el monto del anticipo.');
    if (cuotas.length === 0) errores.push('Agrega al menos una cuota al plan de recuperación.');
    if (cuotas.some((c) => c.valor <= 0)) errores.push('Cada cuota debe ser mayor que cero.');
    if (monto > 0 && distribuido !== monto) errores.push('Las cuotas deben sumar exactamente el monto del anticipo (RN 47).');
    if (limite !== null && proyectado > limite) errores.push('Supera el límite: el total pendiente no puede pasar del límite (RN 42).');
    for (const c of porCorte) if (c.queda < 0) errores.push(`${ETIQUETA_CORTE[c.corte]} no alcanza para la cuota (RN 47).`);

    return { monto, distribuido, porDistribuir: r2(monto - distribuido), saldo, proyectado, limite, disponibleDespues,
      dentroLimite: limite !== null && proyectado <= limite, porCorte, errores };
  });

  constructor() {
    this.cargarColaboradores();
    effect(() => {
      const id = this.colaboradorId();
      const periodo = this.periodo();
      untracked(() => this.cargarResumen(id, periodo));
    });
    effect(() => {
      const id = this.colaboradorId();
      untracked(() => this.cargarAnticipos(id));
    });
  }

  // ── Acciones ─────────────────────────────────────────────────────────
  protected elegirColaborador(id: string): void {
    this.colaboradorId.set(id);
    this.limpiarFormulario();
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: id ? { colaborador: id } : {} });
  }

  protected agregarCuota(): void {
    const permitidos = this.cortesPermitidos();
    const usados = this.cuotas().map((c) => c.corte);
    const corte = permitidos.find((c) => !usados.includes(c)) ?? permitidos[0] ?? 'FinDeMes';
    const pendiente = this.validacion().porDistribuir;
    this.cuotas.update((l) => [...l, { clave: this.siguienteClave++, corte, monto: pendiente > 0 ? String(pendiente) : '' }]);
  }

  protected cambiarCuota(clave: number, cambio: Partial<CuotaForm>): void {
    this.cuotas.update((l) => l.map((c) => (c.clave === clave ? { ...c, ...cambio } : c)));
  }

  protected quitarCuota(clave: number): void {
    this.cuotas.update((l) => l.filter((c) => c.clave !== clave));
  }

  protected guardar(): void {
    const v = this.validacion();
    if (v.errores.length || !this.colaboradorId()) return;
    this.guardando.set(true);
    this.errorGuardar.set(null);
    this.api.registrar({
      colaboradorId: this.colaboradorId(),
      fecha: this.fecha(),
      monto: v.monto,
      observaciones: this.observaciones().trim() || null,
      cuotas: this.cuotas().map((c) => ({ corte: c.corte, monto: r2(numero(c.monto)) })),
    }).subscribe({
      next: (a) => {
        this.guardando.set(false);
        this.avisos.ok(`Anticipo de ${a.monto.toLocaleString('es-EC', { style: 'currency', currency: 'USD' })} registrado. Recalcula la liquidación de ${this.nombreMes().toLowerCase()} para que se descuente.`);
        this.limpiarFormulario();
        this.cargarResumen(this.colaboradorId(), this.periodo());
        this.cargarAnticipos(this.colaboradorId());
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        this.errorGuardar.set(Object.values(err.campos)[0] ?? err.mensaje);
      },
    });
  }

  protected limpiarFormulario(): void {
    this.monto.set('');
    this.observaciones.set('');
    this.cuotas.set([]);
    this.errorGuardar.set(null);
  }

  protected textoCuotas(a: Anticipo): string {
    return a.cuotas.map((c) => `${ETIQUETA_CORTE[c.corte]} ${c.monto.toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}`).join(' · ');
  }

  protected nombrePeriodo = nombrePeriodo;

  // ── Carga ────────────────────────────────────────────────────────────
  private cargarColaboradores(): void {
    forkJoin({
      rps: this.colaboradoresApi.listar({ estado: null, activo: true }),
      tmr: this.tmrApi.colaboradores().pipe(catchError(() => of<TmrColaborador[]>([]))),
    }).subscribe({
      next: ({ rps, tmr }) => {
        const opciones = rps.map((c) => {
          const p = tmr.find((t) => t.tmrColaboradorId === c.tmrColaboradorId);
          return { id: c.id, nombre: p ? nombreCompleto(p) : `ID TMR ${c.tmrColaboradorId}` };
        }).sort((a, b) => a.nombre.localeCompare(b.nombre));
        this.opciones.set(opciones);
        if (!this.colaboradorId() && opciones.length) this.colaboradorId.set(opciones[0].id);
      },
      error: (e: unknown) => this.errorResumen.set(leerErrorApi(e).mensaje),
    });
  }

  private cargarResumen(id: string, periodo: string): void {
    if (!id) { this.resumen.set(null); return; }
    this.cargandoResumen.set(true);
    this.errorResumen.set(null);
    this.api.resumen(id, periodo).subscribe({
      next: (r) => {
        this.resumen.set(r);
        this.cargandoResumen.set(false);
        // Quita del plan los cortes que ya no se pueden usar (por ejemplo, al cambiar de mes).
        const permitidos = this.cortesPermitidos();
        this.cuotas.update((l) => l.map((c) => (permitidos.includes(c.corte) ? c : { ...c, corte: permitidos[0] ?? c.corte })));
      },
      error: (e: unknown) => { this.cargandoResumen.set(false); this.errorResumen.set(leerErrorApi(e).mensaje); },
    });
  }

  private cargarAnticipos(id: string): void {
    if (!id) { this.anticipos.set([]); return; }
    this.api.listar(id).subscribe({
      next: (l) => this.anticipos.set(l),
      error: () => this.anticipos.set([]),
    });
  }
}
