import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { PrestamosService } from '../../services/prestamos.service';
import { CuotaPlanPrestamo, Prestamo, ResumenPrestamos } from '../../models/prestamo.models';
import { ColaboradoresService } from '../../../colaboradores/services/colaboradores.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { DialogoEliminarPrestamo } from '../../components/dialogo-eliminar-prestamo/dialogo-eliminar-prestamo';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { Buscador } from '../../../../shared/components/buscador/buscador';
import { DineroPipe } from '../../../../shared/pipes/dinero.pipe';
import { SoloNumeros } from '../../../../shared/directives/solo-numeros.directive';
import { ETIQUETA_CORTE, TipoCorte } from '../../../../shared/models/corte';
import { nombrePeriodo, periodoDeFecha, primerDia } from '../../../../shared/utils/periodo';

interface OpcionColaborador { id: string; nombre: string }

/** Una fila del plan de pagos en el formulario. bloqueada: su fecha ya llegó (no se cambia ni se quita). */
interface CuotaForm {
  clave: number;
  /** "yyyy-MM" */
  periodo: string;
  corte: TipoCorte;
  importe: string;
  bloqueada: boolean;
}

type ModoRepartir = 'ambos' | 'quincena' | 'fin';

/** "1250,50" o "1250.5" → 1250.5; vacío o inválido → null. */
const aNumero = (texto: string): number | null => {
  const limpio = texto.trim().replace(',', '.');
  if (!limpio) return null;
  const v = Number(limpio);
  return Number.isFinite(v) ? v : null;
};

/** 1250.5 → "1250,50" (como se escribe en los campos de dinero). */
const aTexto = (valor: number): string => valor.toFixed(2).replace('.', ',');

const centavos = (valor: number): number => Math.round(valor * 100);

const dinero = (v: number): string => v.toLocaleString('es-EC', { style: 'currency', currency: 'USD' });

/** Día en que se cobra: la quincena el 15 y el fin de mes el último día del mes. "yyyy-MM" → "yyyy-MM-dd". */
const fechaDeCobro = (periodo: string, corte: TipoCorte): string => {
  const [anio, mes] = periodo.split('-').map(Number);
  const dia = corte === 'Quincena' ? 15 : new Date(anio, mes, 0).getDate();
  return `${periodo}-${String(dia).padStart(2, '0')}`;
};

/** "yyyy-MM" + n meses. */
const sumarMeses = (periodo: string, n: number): string => {
  const [anio, mes] = periodo.split('-').map(Number);
  const d = new Date(anio, mes - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const ordenCorte = (c: TipoCorte): number => (c === 'Quincena' ? 0 : 1);

/**
 * Préstamos a colaboradores. Sigue las reglas de rps-backend:
 *   - Uno o más préstamos en el mismo mes; el monto puede ser mayor que su honorario y se entrega completo.
 *   - El plan de pagos se arma a mano: varias fechas (quincena o fin de mes) desde el mes siguiente a la
 *     entrega, cada una con su valor. La suma tiene que dar exactamente el monto o no se guarda.
 *   - Sin tope por cobro: si un pago no alcanza, lo que falta se cobra en el siguiente; nunca queda negativo.
 *   - Los cobros cuya fecha ya llegó quedan fijos; los que vienen se pueden cambiar.
 * Aquí solo se avisa en vivo lo mismo que valida el backend; el backend vuelve a validar al guardar.
 * Query param: ?colaborador=<id de RPS>.
 */
@Component({
  selector: 'app-prestamos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, Icon, EstadoChip, Buscador, DineroPipe, SoloNumeros, DialogoEliminarPrestamo],
  templateUrl: './prestamos.html',
  styleUrl: './prestamos.scss',
})
export class Prestamos {
  private readonly api = inject(PrestamosService);
  private readonly colaboradoresApi = inject(ColaboradoresService);
  private readonly avisos = inject(NotificationService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locale = inject(LOCALE_ID);

  protected readonly etiquetaCorte = ETIQUETA_CORTE;
  protected readonly nombrePeriodo = nombrePeriodo;
  private readonly hoy = formatDate(new Date(), 'yyyy-MM-dd', this.locale);

  // ── Colaborador ──────────────────────────────────────────────────────
  protected readonly opciones = signal<OpcionColaborador[]>([]);
  protected readonly colaboradorId = signal<string>(this.ruta.snapshot.queryParamMap.get('colaborador') ?? '');
  protected readonly nombreColaborador = computed(() => this.opciones().find((o) => o.id === this.colaboradorId())?.nombre ?? '');

  protected readonly resumen = signal<ResumenPrestamos | null>(null);
  protected readonly cargando = signal(false);
  protected readonly errorCarga = signal<string | null>(null);
  protected readonly prestamos = signal<Prestamo[]>([]);
  /** Préstamos con el plan desplegado en la tabla. */
  protected readonly planVisible = signal<ReadonlySet<string>>(new Set());

  // ── Formulario: registrar o editar ───────────────────────────────────
  /** null: formulario cerrado. 'nuevo': registrar. Si no, el id del préstamo que se edita. */
  protected readonly editando = signal<string | null>(null);
  protected readonly monto = signal('');
  protected readonly fechaEntrega = signal(this.hoy);
  protected readonly observaciones = signal('');
  protected readonly cuotas = signal<CuotaForm[]>([]);
  protected readonly guardando = signal(false);
  protected readonly errorGuardar = signal<string | null>(null);
  private siguienteClave = 1;

  // Atajo "Repartir": llena la tabla y después se edita a mano.
  protected readonly repartirMeses = signal('3');
  protected readonly repartirModo = signal<ModoRepartir>('ambos');
  protected readonly repartirDesde = signal('');

  protected readonly prestamoEditado = computed(() => {
    const id = this.editando();
    return id && id !== 'nuevo' ? this.prestamos().find((p) => p.id === id) ?? null : null;
  });

  /** Mes desde el que se puede cobrar: el siguiente al de la entrega. "yyyy-MM". */
  protected readonly primerMes = computed(() => {
    const p = this.prestamoEditado();
    const entrega = p ? p.fecha : this.fechaEntrega() || this.hoy;
    return sumarMeses(periodoDeFecha(entrega), 1);
  });

  protected readonly cobraEnQuincena = computed(() => this.resumen()?.cobraEnQuincena ?? false);

  protected readonly montoNumero = computed(() => aNumero(this.monto()));
  protected readonly sumaPlan = computed(() =>
    this.cuotas().reduce((t, c) => t + centavos(aNumero(c.importe) ?? 0), 0) / 100);
  /** Positivo: falta asignar. Negativo: el plan se pasa del monto. */
  protected readonly faltaAsignar = computed(() => ((centavos(this.montoNumero() ?? 0) - centavos(this.sumaPlan())) / 100));

  /** El mismo aviso que daría el backend, recalculado con cada cambio. null = se puede guardar. */
  protected readonly errorPlan = computed<string | null>(() => {
    const monto = this.montoNumero();
    if (monto === null || monto <= 0) return 'Escribe el monto del préstamo.';
    const cuotas = this.cuotas();
    if (cuotas.length === 0) return 'Agrega al menos una fecha de cobro al plan de pagos.';

    const vistos = new Set<string>();
    for (const c of cuotas) {
      const importe = aNumero(c.importe);
      if (!c.periodo || importe === null || importe <= 0) return 'Cada fecha de cobro necesita su mes y un valor mayor a 0.';
      const clave = `${c.periodo}|${c.corte}`;
      if (vistos.has(clave)) {
        return `Hay dos cobros en ${c.corte === 'Quincena' ? 'la quincena' : 'el fin de mes'} de ${nombrePeriodo(c.periodo).toLowerCase()}. Deja uno solo con el valor total.`;
      }
      vistos.add(clave);
    }

    for (const c of cuotas) {
      if (c.bloqueada) continue;
      if (c.periodo < this.primerMes()) {
        return `Los cobros van desde ${nombrePeriodo(this.primerMes()).toLowerCase()}, el mes siguiente a la entrega del préstamo.`;
      }
      if (fechaDeCobro(c.periodo, c.corte) <= this.hoy) {
        return `El pago del ${formatDate(fechaDeCobro(c.periodo, c.corte), 'dd MMM yyyy', this.locale)} ya se hizo: elige una fecha posterior a hoy.`;
      }
      if (c.corte === 'Quincena' && !this.cobraEnQuincena()) {
        return 'Este colaborador cobra solo a fin de mes: no se le puede cobrar en la quincena porque ese día no se le paga.';
      }
    }

    const falta = this.faltaAsignar();
    if (falta > 0) return `Faltan ${dinero(falta)} para completar el préstamo. El plan tiene que sumar exactamente el monto prestado.`;
    if (falta < 0) return `El plan se pasa ${dinero(-falta)} del monto prestado. Tiene que sumar exactamente el monto.`;
    return null;
  });

  /** El error del backend al guardar, o el aviso en vivo una vez que se empezó a llenar el formulario. */
  protected readonly errorMostrado = computed(() =>
    this.errorGuardar() ?? (this.monto().trim() || this.cuotas().length ? this.errorPlan() : null));

  // ── Eliminar ─────────────────────────────────────────────────────────
  protected readonly porEliminar = signal<Prestamo | null>(null);
  protected readonly eliminando = signal(false);

  constructor() {
    this.cargarColaboradores();
    effect(() => {
      const id = this.colaboradorId();
      untracked(() => this.cargar(id));
    });
  }

  // ── Colaborador ──────────────────────────────────────────────────────
  protected elegirColaborador(id: string): void {
    this.colaboradorId.set(id);
    this.cerrarFormulario();
    this.planVisible.set(new Set());
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: id ? { colaborador: id } : {} });
  }

  // ── Formulario ───────────────────────────────────────────────────────
  protected nuevo(): void {
    this.editando.set('nuevo');
    this.monto.set('');
    this.fechaEntrega.set(this.hoy);
    this.observaciones.set('');
    this.cuotas.set([]);
    this.errorGuardar.set(null);
    this.repartirDesde.set(this.primerMes());
    this.repartirModo.set(this.cobraEnQuincena() ? 'ambos' : 'fin');
  }

  protected editar(p: Prestamo): void {
    this.editando.set(p.id);
    this.monto.set(aTexto(p.monto));
    this.observaciones.set(p.observaciones ?? '');
    this.cuotas.set(p.cuotas.map((c) => ({
      clave: this.siguienteClave++, periodo: periodoDeFecha(c.periodo), corte: c.corte,
      importe: aTexto(c.importe), bloqueada: c.bloqueada,
    })));
    this.errorGuardar.set(null);
    const proximo = sumarMeses(periodoDeFecha(this.hoy), 1);
    this.repartirDesde.set(proximo > this.primerMes() ? proximo : this.primerMes());
    this.repartirModo.set(this.cobraEnQuincena() ? 'ambos' : 'fin');
  }

  protected cerrarFormulario(): void {
    this.editando.set(null);
    this.cuotas.set([]);
    this.errorGuardar.set(null);
  }

  /** Al cambiar la fecha de entrega se mueve también el "desde" del atajo, si quedó antes del mes permitido. */
  protected cambiarFechaEntrega(valor: string): void {
    this.fechaEntrega.set(valor);
    if (!this.repartirDesde() || this.repartirDesde() < this.primerMes()) this.repartirDesde.set(this.primerMes());
  }

  /** Nueva fila: el siguiente cobro después del último de la tabla (o el primero permitido). */
  protected agregarCuota(): void {
    const ultima = [...this.cuotas()].sort((a, b) =>
      a.periodo.localeCompare(b.periodo) || ordenCorte(a.corte) - ordenCorte(b.corte)).pop();
    let periodo = this.primerMes();
    let corte: TipoCorte = this.cobraEnQuincena() ? 'Quincena' : 'FinDeMes';
    if (ultima) {
      if (ultima.corte === 'Quincena') { periodo = ultima.periodo; corte = 'FinDeMes'; }
      else { periodo = sumarMeses(ultima.periodo, 1); }
    }
    while (fechaDeCobro(periodo, corte) <= this.hoy) periodo = sumarMeses(periodo, 1);
    this.cuotas.update((l) => [...l, { clave: this.siguienteClave++, periodo, corte, importe: '', bloqueada: false }]);
  }

  protected cambiarCuota(clave: number, cambio: Partial<CuotaForm>): void {
    this.cuotas.update((l) => l.map((c) => (c.clave === clave && !c.bloqueada ? { ...c, ...cambio } : c)));
  }

  protected quitarCuota(clave: number): void {
    this.cuotas.update((l) => l.filter((c) => c.clave !== clave || c.bloqueada));
  }

  protected fechaDe(c: CuotaForm): string | null {
    return c.periodo ? fechaDeCobro(c.periodo, c.corte) : null;
  }

  /**
   * Atajo: reparte lo que falta cobrar (monto menos los cobros que ya quedaron fijos) en partes iguales
   * entre los cobros de N meses. Reemplaza las filas que se pueden editar; los centavos que sobran van al último.
   */
  protected repartir(): void {
    const monto = this.montoNumero();
    const meses = Math.trunc(Number(this.repartirMeses()));
    const desde = this.repartirDesde() < this.primerMes() ? this.primerMes() : this.repartirDesde();
    if (monto === null || monto <= 0 || !Number.isFinite(meses) || meses < 1 || !desde) return;

    const fijas = this.cuotas().filter((c) => c.bloqueada);
    const porRepartir = centavos(monto) - fijas.reduce((t, c) => t + centavos(aNumero(c.importe) ?? 0), 0);
    if (porRepartir <= 0) return;

    const modo: ModoRepartir = this.cobraEnQuincena() ? this.repartirModo() : 'fin';
    const cortes: TipoCorte[] = modo === 'ambos' ? ['Quincena', 'FinDeMes'] : modo === 'quincena' ? ['Quincena'] : ['FinDeMes'];
    const ocupadas = new Set(fijas.map((c) => `${c.periodo}|${c.corte}`));
    const huecos: { periodo: string; corte: TipoCorte }[] = [];
    for (let i = 0; i < meses; i++) {
      const periodo = sumarMeses(desde, i);
      for (const corte of cortes) {
        if (fechaDeCobro(periodo, corte) <= this.hoy || ocupadas.has(`${periodo}|${corte}`)) continue;
        huecos.push({ periodo, corte });
      }
    }
    if (huecos.length === 0) return;

    const parte = Math.floor(porRepartir / huecos.length);
    const nuevas: CuotaForm[] = huecos.map((h, i) => ({
      clave: this.siguienteClave++, periodo: h.periodo, corte: h.corte, bloqueada: false,
      importe: aTexto((i === huecos.length - 1 ? porRepartir - parte * (huecos.length - 1) : parte) / 100),
    }));
    this.cuotas.set([...fijas, ...nuevas]);
  }

  protected guardar(): void {
    const colaboradorId = this.colaboradorId();
    const editando = this.editando();
    if (!colaboradorId || !editando || this.errorPlan()) return;

    const cuotas: CuotaPlanPrestamo[] = [...this.cuotas()]
      .sort((a, b) => a.periodo.localeCompare(b.periodo) || ordenCorte(a.corte) - ordenCorte(b.corte))
      .map((c) => ({ periodo: primerDia(c.periodo), corte: c.corte, importe: aNumero(c.importe) ?? 0 }));
    const observaciones = this.observaciones().trim() || null;
    const monto = this.montoNumero();

    this.guardando.set(true);
    this.errorGuardar.set(null);
    const peticion = editando === 'nuevo'
      ? this.api.registrar(colaboradorId, { monto, fecha: this.fechaEntrega() || null, observaciones, cuotas })
      : this.api.actualizar(colaboradorId, editando, { monto, observaciones, cuotas });

    peticion.subscribe({
      next: (p) => {
        this.guardando.set(false);
        this.avisos.ok(editando === 'nuevo'
          ? `Préstamo de ${dinero(p.monto)} registrado con ${p.cuotas.length} ${p.cuotas.length === 1 ? 'cobro' : 'cobros'}.`
          : `Préstamo de ${dinero(p.monto)} actualizado.`);
        this.cerrarFormulario();
        this.planVisible.update((s) => new Set(s).add(p.id));
        this.cargar(colaboradorId);
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        this.errorGuardar.set(Object.values(err.campos)[0] ?? err.mensaje);
      },
    });
  }

  // ── Tabla ────────────────────────────────────────────────────────────
  protected alternarPlan(id: string): void {
    this.planVisible.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  /** Cobros que ya se descontaron completos. */
  protected cobrosHechos(p: Prestamo): number {
    return p.cuotas.filter((c) => c.cobrado >= c.importe).length;
  }

  protected avance(p: Prestamo): number {
    return p.monto > 0 ? Math.min(100, Math.round((p.cobrado / p.monto) * 100)) : 0;
  }

  /** Ya empezó a cobrarse: no se puede eliminar (igual que el backend). */
  protected empezoACobrarse(p: Prestamo): boolean {
    return p.cobrado > 0 || p.cuotas.some((c) => c.bloqueada);
  }

  protected importeProximo(p: Prestamo): number {
    return p.cuotas.filter((c) => c.fechaCobro === p.proximoCobro).reduce((t, c) => t + c.importe, 0);
  }

  // ── Eliminar ─────────────────────────────────────────────────────────
  protected eliminar(p: Prestamo): void {
    this.porEliminar.set(p);
  }

  protected cancelarEliminar(): void {
    if (!this.eliminando()) this.porEliminar.set(null);
  }

  protected confirmarEliminar(): void {
    const p = this.porEliminar();
    const colaboradorId = this.colaboradorId();
    if (!p || !colaboradorId) return;
    this.eliminando.set(true);
    this.api.eliminar(colaboradorId, p.id).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.porEliminar.set(null);
        if (this.editando() === p.id) this.cerrarFormulario();
        this.avisos.ok(`Se eliminó el préstamo de ${dinero(p.monto)}.`);
        this.cargar(colaboradorId);
      },
      error: (e: unknown) => {
        this.eliminando.set(false);
        this.porEliminar.set(null);
        this.avisos.error(`No se pudo eliminar el préstamo: ${leerErrorApi(e).mensaje}`);
      },
    });
  }

  // ── Carga ────────────────────────────────────────────────────────────
  private cargarColaboradores(): void {
    this.colaboradoresApi.listar({ estado: null, activo: true }).subscribe({
      next: (rps) => {
        const opciones = rps.map((c) => ({
          id: c.id, nombre: `${c.nombres ?? ''} ${c.apellidos ?? ''}`.trim() || `ID TMR ${c.tmrColaboradorId}`,
        }));
        this.opciones.set(opciones);
        if (!this.colaboradorId() && opciones.length) this.colaboradorId.set(opciones[0].id);
      },
      error: (e: unknown) => this.errorCarga.set(leerErrorApi(e).mensaje),
    });
  }

  private cargar(id: string): void {
    if (!id) { this.resumen.set(null); this.prestamos.set([]); return; }
    this.cargando.set(true);
    this.errorCarga.set(null);
    this.api.resumen(id).subscribe({
      next: (r) => { this.resumen.set(r); this.cargando.set(false); },
      error: (e: unknown) => { this.cargando.set(false); this.errorCarga.set(leerErrorApi(e).mensaje); },
    });
    this.api.listar(id).subscribe({
      next: (l) => this.prestamos.set(l),
      error: () => this.prestamos.set([]),
    });
  }
}
