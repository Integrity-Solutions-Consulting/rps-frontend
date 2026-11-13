import { ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { PeriodoEnPantallaService } from '../../../../core/services/periodo-en-pantalla.service';
import { DatePipe, formatCurrency, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AnticiposService } from '../../services/anticipos.service';
import { Anticipo, ResumenAnticipos } from '../../models/anticipo.models';
import { ColaboradoresService } from '../../../colaboradores/services/colaboradores.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { DURACION_CON_ACCION, NotificationService } from '../../../../core/services/notification.service';
import { DialogoEliminarAnticipo } from '../../components/dialogo-eliminar-anticipo/dialogo-eliminar-anticipo';
import { Icon } from '../../../../shared/components/icon/icon';
import { Buscador } from '../../../../shared/components/buscador/buscador';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { SoloNumeros } from '../../../../shared/directives/solo-numeros.directive';
import { ETIQUETA_CORTE, TipoCorte } from '../../../../shared/models/corte';
import { esPeriodoValido, nombrePeriodo, periodoActual, periodoDeFecha, primerDia } from '../../../../shared/utils/periodo';

interface OpcionColaborador { id: string; nombre: string }
interface CuotaForm { clave: number; corte: TipoCorte; importe: string }
/** Eliminación confirmada que espera el tiempo de "Deshacer" antes de enviar el DELETE. */
interface EliminacionPendiente {
  anticipo: Anticipo;
  colaboradorId: string;
  descripcion: string;
  temporizador: ReturnType<typeof setTimeout>;
  avisoId: number | null;
}

/** "1250,50" o "1250.5" → 1250.5 (el campo solo acepta esos formatos); vacío → null y el backend responde que falta. */
const aNumero = (texto: string): number | null => {
  const limpio = texto.trim().replace(',', '.');
  if (!limpio) return null;
  const v = Number(limpio);
  return Number.isFinite(v) ? v : null;
};

/**
 * Anticipos adicionales. Sigue el flujo de rps-backend:
 *   1. Registrar el anticipo (monto y observaciones).
 *   2. Registrar o reemplazar su plan de cuotas para un mes.
 *   3. Eliminarlo si todavía no tiene cuotas. Se pide confirmación y, al confirmar, la fila se oculta y el
 *      DELETE se envía cuando vence el aviso con "Deshacer" (no hay endpoint para recuperar un anticipo).
 * Neto, límite, saldo y disponible vienen de GET .../anticipos/resumen; las validaciones las hace el backend.
 * Query param: ?colaborador=<id de RPS>.
 */
@Component({
  selector: 'app-anticipos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, Icon, Buscador, DineroPipe, SoloNumeros, DialogoEliminarAnticipo],
  templateUrl: './anticipos.html',
  styleUrl: './anticipos.scss',
})
export class Anticipos {
  private readonly api = inject(AnticiposService);
  private readonly colaboradoresApi = inject(ColaboradoresService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly etiquetaCorte = ETIQUETA_CORTE;
  protected readonly nombrePeriodo = nombrePeriodo;
  protected readonly mesDeFecha = (fecha: string) => nombrePeriodo(periodoDeFecha(fecha));

  // ── Colaborador y mes ────────────────────────────────────────────────
  protected readonly opciones = signal<OpcionColaborador[]>([]);
  protected readonly colaboradorId = signal<string>(this.ruta.snapshot.queryParamMap.get('colaborador') ?? '');
  /** Mes del resumen y del plan de cuotas ("yyyy-MM"). */
  protected readonly periodo = signal(periodoActual());
  /** El menú lateral muestra el mes elegido aquí (solo interfaz). */
  private readonly periodoEnPantalla = inject(PeriodoEnPantallaService);
  private readonly publicarPeriodo = effect(() => this.periodoEnPantalla.periodo.set(this.periodo()));
  protected readonly nombreMes = computed(() => nombrePeriodo(this.periodo()));

  protected readonly resumen = signal<ResumenAnticipos | null>(null);
  protected readonly cargandoResumen = signal(false);
  protected readonly errorResumen = signal<string | null>(null);
  protected readonly anticipos = signal<Anticipo[]>([]);

  // ── 1. Registrar anticipo ────────────────────────────────────────────
  protected readonly monto = signal('');
  protected readonly observaciones = signal('');
  protected readonly guardando = signal(false);
  protected readonly errorGuardar = signal<string | null>(null);

  // ── 2. Plan de cuotas de un anticipo ─────────────────────────────────
  protected readonly planDe = signal<string | null>(null);
  protected readonly cuotas = signal<CuotaForm[]>([]);
  protected readonly guardandoPlan = signal(false);
  protected readonly errorPlan = signal<string | null>(null);
  private siguienteClave = 1;

  protected readonly anticipoDelPlan = computed(() => this.anticipos().find((a) => a.id === this.planDe()) ?? null);

  // ── 3. Eliminar (con confirmación y "Deshacer") ──────────────────────
  private readonly locale = inject(LOCALE_ID);
  protected readonly segundosParaDeshacer = DURACION_CON_ACCION / 1000;
  /** Anticipo cuya confirmación está abierta. */
  protected readonly porEliminar = signal<Anticipo | null>(null);
  /** Anticipos confirmados para eliminar que todavía se pueden deshacer: no se muestran en la tabla. */
  private readonly ocultos = signal<ReadonlySet<string>>(new Set());
  protected readonly anticiposVisibles = computed(() => this.anticipos().filter((a) => !this.ocultos().has(a.id)));
  protected readonly nombreColaborador = computed(() => this.opciones().find((o) => o.id === this.colaboradorId())?.nombre ?? '');
  private pendiente: EliminacionPendiente | null = null;
  private destruido = false;

  constructor() {
    // Si se sale de la pantalla durante el "Deshacer", la eliminación ya confirmada se envía igual.
    inject(DestroyRef).onDestroy(() => { this.destruido = true; this.enviarEliminacion(); });
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
    this.cerrarPlan();
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: id ? { colaborador: id } : {} });
  }

  protected cambiarPeriodo(valor: string): void {
    if (esPeriodoValido(valor)) this.periodo.set(valor);
  }

  /** POST .../anticipos */
  protected registrar(): void {
    if (!this.colaboradorId()) return;
    this.guardando.set(true);
    this.errorGuardar.set(null);
    this.api.registrar(this.colaboradorId(), aNumero(this.monto()), this.observaciones().trim() || null).subscribe({
      next: (a) => {
        this.guardando.set(false);
        this.avisos.ok('Anticipo registrado. Ahora registra su plan de cuotas.');
        this.limpiarFormulario();
        this.recargar(a.id);
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        this.errorGuardar.set(Object.values(err.campos)[0] ?? err.mensaje);
      },
    });
  }

  /** Abre el plan de un anticipo; si ya tiene cuotas, se cargan para corregirlas. */
  protected abrirPlan(a: Anticipo): void {
    if (this.planDe() === a.id) { this.cerrarPlan(); return; }
    this.planDe.set(a.id);
    this.errorPlan.set(null);
    if (a.cuotas.length) this.periodo.set(periodoDeFecha(a.cuotas[0].periodo));
    this.cuotas.set(a.cuotas.map((c) => ({ clave: this.siguienteClave++, corte: c.corte, importe: String(c.importe).replace('.', ',') })));
  }

  protected cerrarPlan(): void {
    this.planDe.set(null);
    this.cuotas.set([]);
    this.errorPlan.set(null);
  }

  /** Una cuota por corte: se propone el corte que todavía no tiene cuota. */
  protected agregarCuota(): void {
    const permitidos = this.resumen()?.cortesPermitidos ?? ['FinDeMes'];
    const usados = new Set(this.cuotas().map((c) => c.corte));
    const corte = permitidos.find((k) => !usados.has(k));
    if (!corte) return;
    this.cuotas.update((l) => [...l, { clave: this.siguienteClave++, corte, importe: '' }]);
  }

  /** Ya hay una cuota en cada corte que se le paga: no se puede agregar otra. */
  protected readonly cortesCompletos = computed(() => {
    const permitidos = this.resumen()?.cortesPermitidos ?? ['FinDeMes'];
    const usados = new Set(this.cuotas().map((c) => c.corte));
    return permitidos.every((k) => usados.has(k));
  });

  /**
   * Máximo que esta cuota puede descontar en el corte: lo disponible según el backend más lo que
   * este mismo anticipo ya tenía en ese mes y corte (el plan nuevo reemplaza al anterior).
   * El backend vuelve a validar al guardar.
   */
  protected maximoPara(corte: TipoCorte): number | null {
    const tope = this.resumen()?.topesPorCorte?.find((t) => t.corte === corte);
    if (!tope) return null;
    const periodo = primerDia(this.periodo());
    const propio = (this.anticipoDelPlan()?.cuotas ?? [])
      .filter((c) => c.corte === corte && c.periodo === periodo)
      .reduce((s, c) => s + c.importe, 0);
    return Math.round((tope.disponible + propio) * 100) / 100;
  }

  /**
   * Cuota de quincena que este anticipo ya tenía en un mes cuya quincena ya se pagó: ya se
   * descontó, así que se muestra pero no se puede cambiar ni quitar (el backend lo vuelve a validar).
   */
  protected cuotaYaPagada(c: { corte: TipoCorte; importe: string }): boolean {
    if (c.corte !== 'Quincena' || !this.resumen()?.quincenaCerrada) return false;
    const periodo = primerDia(this.periodo());
    const original = (this.anticipoDelPlan()?.cuotas ?? []).find((o) => o.corte === 'Quincena' && o.periodo === periodo);
    return !!original && aNumero(c.importe) === original.importe;
  }

  /** Cortes que se pueden elegir en la fila: los permitidos, más el suyo si es una quincena ya pagada. */
  protected opcionesCorte(corte: TipoCorte): TipoCorte[] {
    const permitidos = this.resumen()?.cortesPermitidos ?? ['FinDeMes'];
    return permitidos.includes(corte) ? permitidos : [corte, ...permitidos];
  }

  protected valorBaseDe(corte: TipoCorte): number | null {
    return this.resumen()?.topesPorCorte?.find((t) => t.corte === corte)?.valorBase ?? null;
  }

  /** El mismo aviso que da el backend, antes de enviar. */
  private errorDeCortes(): string | null {
    const permitidos = this.resumen()?.cortesPermitidos ?? ['FinDeMes'];
    const fueraDeCorte = this.cuotas().find((c) => !permitidos.includes(c.corte) && !this.cuotaYaPagada(c));
    if (fueraDeCorte) {
      return fueraDeCorte.corte === 'Quincena' && this.resumen()?.quincenaCerrada
        ? `La quincena de ${this.nombreMes().toLowerCase()} ya se pagó: solo se le puede descontar de lo que le queda, en el fin de mes.`
        : 'Este colaborador cobra solo a fin de mes: no se le puede descontar en la quincena porque ese día no se le paga. Pon la cuota en Fin de mes.';
    }
    const vistos = new Set<TipoCorte>();
    for (const c of this.cuotas()) {
      if (vistos.has(c.corte)) {
        return `Estás poniendo dos cuotas en el mismo corte (${ETIQUETA_CORTE[c.corte]}). Deja una sola cuota por corte con el importe total.`;
      }
      vistos.add(c.corte);
    }
    for (const c of this.cuotas()) {
      if (this.cuotaYaPagada(c)) continue;
      const importe = aNumero(c.importe);
      const maximo = this.maximoPara(c.corte);
      if (importe !== null && maximo !== null && importe > maximo) {
        const dinero = (v: number) => v.toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
        const base = this.valorBaseDe(c.corte) ?? maximo;
        const otros = maximo < base ? ` y otros anticipos ya tienen programados ${dinero(base - maximo)}, así que como máximo puedes poner ${dinero(maximo)}` : '';
        const nombre = c.corte === 'Quincena' ? 'la quincena' : 'el fin de mes';
        return `En ${nombre} de ${this.nombreMes().toLowerCase()} solo se le pagan ${dinero(base)}${otros}. No se le puede descontar más de lo que se le paga.`;
      }
    }
    return null;
  }

  protected cambiarCuota(clave: number, cambio: Partial<CuotaForm>): void {
    this.cuotas.update((l) => l.map((c) => (c.clave === clave ? { ...c, ...cambio } : c)));
  }

  protected quitarCuota(clave: number): void {
    this.cuotas.update((l) => l.filter((c) => c.clave !== clave));
  }

  /** PUT .../anticipos/{id}/plan (reemplaza el plan completo). */
  protected guardarPlan(): void {
    const id = this.planDe();
    if (!id) return;
    const periodo = primerDia(this.periodo());
    const errorCortes = this.errorDeCortes();
    if (errorCortes) { this.errorPlan.set(errorCortes); return; }
    this.guardandoPlan.set(true);
    this.errorPlan.set(null);
    this.api.registrarPlan(this.colaboradorId(), id,
      this.cuotas().map((c) => ({ periodo, corte: c.corte, importe: aNumero(c.importe) ?? 0 }))).subscribe({
      next: () => {
        this.guardandoPlan.set(false);
        this.avisos.ok(`Plan guardado para ${this.nombreMes().toLowerCase()}.`);
        this.cerrarPlan();
        this.recargar(null);
      },
      error: (e: unknown) => {
        this.guardandoPlan.set(false);
        const err = leerErrorApi(e);
        this.errorPlan.set(Object.values(err.campos)[0] ?? err.mensaje);
      },
    });
  }

  /** Botón "Eliminar" de la tabla: solo abre la confirmación (ui-dialog devuelve el foco al cerrar). */
  protected eliminar(a: Anticipo): void {
    this.porEliminar.set(a);
  }

  protected cancelarEliminar(): void {
    this.porEliminar.set(null);
  }

  /** Confirmado: se oculta la fila y se ofrece "Deshacer"; el DELETE sale cuando vence el aviso. */
  protected confirmarEliminar(): void {
    const a = this.porEliminar();
    if (!a) return;
    this.porEliminar.set(null);
    // Una sola eliminación en espera: si había otra, se envía ya.
    this.enviarEliminacion();
    if (this.planDe() === a.id) this.cerrarPlan();
    this.ocultos.update((s) => new Set(s).add(a.id));

    const descripcion = `el anticipo de ${formatCurrency(a.monto, this.locale, '$', 'USD', '1.2-2')} del ${formatDate(a.fecha, 'dd MMM yyyy', this.locale)}`;
    const pendiente: EliminacionPendiente = {
      anticipo: a, colaboradorId: this.colaboradorId(), descripcion, avisoId: null,
      temporizador: setTimeout(() => this.enviarEliminacion(), DURACION_CON_ACCION),
    };
    this.pendiente = pendiente;
    const mensaje = `Se eliminará ${descripcion}.`;
    this.avisos.info(mensaje, { texto: 'Deshacer', ejecutar: () => this.deshacerEliminar(pendiente) });
    pendiente.avisoId = this.avisos.avisos().find((v) => v.mensaje === mensaje)?.id ?? null;
  }

  private deshacerEliminar(p: EliminacionPendiente): void {
    if (this.pendiente !== p) return; // ya se envió: el aviso se cierra en ese momento, no debería llegar aquí
    clearTimeout(p.temporizador);
    this.pendiente = null;
    this.mostrarDeNuevo(p.anticipo.id);
    this.avisos.ok(`No se eliminó ${p.descripcion}.`);
  }

  /** DELETE .../anticipos/{id} de la eliminación en espera, si la hay. */
  private enviarEliminacion(): void {
    const p = this.pendiente;
    if (!p) return;
    this.pendiente = null;
    clearTimeout(p.temporizador);
    if (p.avisoId !== null) this.avisos.cerrar(p.avisoId);
    this.api.eliminar(p.colaboradorId, p.anticipo.id).subscribe({
      next: () => {
        this.avisos.ok(`Se eliminó ${p.descripcion}.`);
        if (!this.destruido && p.colaboradorId === this.colaboradorId()) this.recargar(null);
      },
      error: (e: unknown) => {
        if (!this.destruido) this.mostrarDeNuevo(p.anticipo.id);
        this.avisos.error(`No se pudo eliminar ${p.descripcion}: ${leerErrorApi(e).mensaje}`);
      },
    });
  }

  private mostrarDeNuevo(id: string): void {
    this.ocultos.update((s) => { const n = new Set(s); n.delete(id); return n; });
  }

  protected limpiarFormulario(): void {
    this.monto.set('');
    this.observaciones.set('');
    this.errorGuardar.set(null);
  }

  protected textoCuotas(a: Anticipo): string {
    return a.cuotas.map((c) => `${this.mesDeFecha(c.periodo)} · ${ETIQUETA_CORTE[c.corte]} ${c.importe.toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}`).join(' · ');
  }

  // ── Carga ────────────────────────────────────────────────────────────
  private recargar(abrirPlanDe: string | null): void {
    this.cargarResumen(this.colaboradorId(), this.periodo());
    this.cargarAnticipos(this.colaboradorId(), abrirPlanDe);
  }

  private cargarColaboradores(): void {
    this.colaboradoresApi.listar({ estado: null, activo: true }).subscribe({
      next: (rps) => {
        const opciones = rps.map((c) => ({
          id: c.id, nombre: `${c.nombres ?? ''} ${c.apellidos ?? ''}`.trim() || `ID TMR ${c.tmrColaboradorId}`,
        }));
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
      next: (r) => { this.resumen.set(r); this.cargandoResumen.set(false); },
      error: (e: unknown) => { this.cargandoResumen.set(false); this.errorResumen.set(leerErrorApi(e).mensaje); },
    });
  }

  private cargarAnticipos(id: string, abrirPlanDe: string | null = null): void {
    if (!id) { this.anticipos.set([]); return; }
    this.api.listar(id).subscribe({
      next: (l) => {
        this.anticipos.set(l);
        const nuevo = abrirPlanDe ? l.find((a) => a.id === abrirPlanDe) : undefined;
        if (nuevo) this.abrirPlan(nuevo);
      },
      error: () => this.anticipos.set([]),
    });
  }
}
