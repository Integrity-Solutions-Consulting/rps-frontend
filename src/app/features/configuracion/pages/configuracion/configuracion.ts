import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ConfiguracionService } from '../../services/configuracion.service';
import { AuditoriaService, CambioConfiguracion } from '../../services/auditoria.service';
import { ActualizarConfiguracionRequest, CAMPOS_CONFIGURACION, Configuracion as DatosConfiguracion } from '../../models/configuracion.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { PestanaUi, UiTabPanel, UiTabs } from '../../../../shared/components/ui-tabs/ui-tabs';
import { SoloNumeros } from '../../../../shared/directives/solo-numeros.directive';
import { SessionService } from '../../../../core/services/session.service';
import { RolSistema } from '../../models/accesos.models';
import { TabRoles } from '../../components/tab-roles/tab-roles';
import { TabUsuarios } from '../../components/tab-usuarios/tab-usuarios';
import { DialogoHistorial } from '../../components/dialogo-historial/dialogo-historial';

type Clave = keyof ActualizarConfiguracionRequest;
type Borrador = Record<Clave, string>;
type Pestana = 'general' | 'roles' | 'usuarios';

/** Ayuda de cada impuesto: qué hace el porcentaje en el cálculo (CalculoTributario del backend). */
const AYUDA_IMPUESTO: Partial<Record<Clave, string>> = {
  porcentajeIva: 'Se suma al subtotal del honorario',
  porcentajeRetencionFuente: 'Se descuenta del subtotal',
  porcentajeRetencionIvaProfesional: 'Parte del IVA que se retiene a profesionales',
  porcentajeRetencionIvaJunior: 'Parte del IVA que se retiene a juniors',
};

/**
 * Configuración: los campos de ConfiguracionGlobal de rps-backend.
 * Se guarda todo junto (PUT /api/configuracion); los rangos los valida el backend y los errores vuelven por campo.
 * Al costado: los últimos cambios (GET /api/auditoria).
 */
@Component({
  selector: 'app-configuracion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, Icon, SoloNumeros, TabRoles, TabUsuarios, DialogoHistorial, UiTabs, UiTabPanel],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
})
export class Configuracion {
  private readonly api = inject(ConfiguracionService);
  private readonly auditoria = inject(AuditoriaService);
  private readonly avisos = inject(NotificationService);
  private readonly session = inject(SessionService);

  /** Rol de mayor nivel del usuario en sesión. */
  protected readonly rol = computed<RolSistema>(() => {
    const roles = this.session.roles();
    if (roles.includes('Administrador')) return 'Administrador';
    if (roles.includes('Administrador Contable')) return 'Administrador Contable';
    return roles[0] ?? 'Asistente Contable';
  });
  /** Roles y Usuarios solo para quien administra cuentas (Administrador y Administrador Contable). */
  protected readonly administraCuentas = computed(() => this.rol() === 'Administrador' || this.rol() === 'Administrador Contable');
  protected readonly pestana = signal<Pestana>('general');
  protected readonly pestanas: PestanaUi<Pestana>[] = [
    { id: 'general', titulo: 'General' },
    { id: 'roles', titulo: 'Roles y permisos' },
    { id: 'usuarios', titulo: 'Usuarios' },
  ];

  protected readonly campos = CAMPOS_CONFIGURACION;
  protected readonly ayudaImpuesto = AYUDA_IMPUESTO;
  protected readonly impuestos = CAMPOS_CONFIGURACION.filter((c) => c.grupo === 'Impuestos');

  protected readonly datos = signal<DatosConfiguracion | null>(null);
  protected readonly borrador = signal<Borrador | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errores = signal<Record<string, string>>({});

  // ── Cambios sin guardar ───────────────────────────────────────────
  /** Campos cuyo valor del borrador difiere del guardado (compara números, no textos: "15" = "15,0"). */
  protected readonly cambiados = computed<Clave[]>(() => {
    const d = this.datos();
    const b = this.borrador();
    if (!d || !b) return [];
    return this.campos.filter((c) => !iguales(c.tipo, d[c.clave], b[c.clave])).map((c) => c.clave);
  });
  protected readonly hayCambios = computed(() => this.cambiados().length > 0);
  protected readonly nombresCambiados = computed(() =>
    this.cambiados().map((k) => this.campos.find((c) => c.clave === k)!.etiqueta).join(' · '));

  /** Ancho de la barra del límite de anticipos (0 a 100). */
  protected readonly anchoAnticipo = computed(() => Math.min(100, Math.max(0, this.numero('porcentajeMaximoAnticipo'))));

  // ── Alertas de vencimiento (RN 13) ────────────────────────────────
  protected readonly plazosAviso: Clave[] = ['diasAvisoVencimiento1', 'diasAvisoVencimiento2', 'diasAvisoVencimiento3'];
  protected readonly etiquetasAviso = ['Primer aviso', 'Segundo aviso', 'Último aviso'];
  /** Línea de tiempo: posición de cada aviso entre el primero (0 %) y el fin del contrato (100 %). */
  protected readonly lineaAvisos = computed(() => {
    const dias = this.plazosAviso.map((k) => this.numero(k));
    const escala = Math.max(...dias, 1);
    return dias.map((d, i) => ({ dias: d, posicion: Math.min(100, Math.max(0, ((escala - d) / escala) * 100)), ultimo: i === dias.length - 1 }));
  });
  /** Misma regla que el backend: cada aviso menor que el anterior. */
  protected readonly avisosDesordenados = computed(() => {
    const [a, b, c] = this.plazosAviso.map((k) => this.numero(k));
    return !(a > b && b > c);
  });

  // ── Cambios recientes ─────────────────────────────────────────────
  protected readonly historial = signal<CambioConfiguracion[]>([]);
  protected readonly nombres = signal<Record<string, string>>({});
  protected readonly cargandoHistorial = signal(true);
  protected readonly errorHistorial = signal<string | null>(null);
  protected readonly recientes = computed(() => this.historial().slice(0, 3));
  protected readonly verHistorial = signal(false);

  constructor() {
    this.cargar();
    this.cargarHistorial();
    if (this.administraCuentas()) this.auditoria.nombresUsuarios().subscribe((n) => this.nombres.set(n));
  }

  protected campo(clave: Clave) {
    return this.campos.find((c) => c.clave === clave)!;
  }

  protected cambiado(clave: Clave): boolean {
    return this.cambiados().includes(clave);
  }

  /** Valor guardado, para la marca "Modificado · antes …". */
  protected antes(clave: Clave): string {
    const d = this.datos();
    if (!d) return '';
    const valor = String(d[clave]).replace('.', ',');
    return this.campo(clave).tipo === 'porcentaje' ? `${valor} %` : valor;
  }

  protected autor(c: CambioConfiguracion): string {
    if (!c.usuarioId) return 'Sistema';
    return this.nombres()[c.usuarioId] ?? 'Usuario';
  }

  protected cambiar(clave: Clave, valor: string): void {
    this.borrador.update((b) => (b ? { ...b, [clave]: valor } : b));
    if (this.errores()[clave]) this.errores.update(({ [clave]: _, ...resto }) => resto);
  }

  protected deshacer(): void {
    const d = this.datos();
    if (d) this.llenar(d);
  }

  protected guardar(): void {
    const b = this.borrador();
    if (!b || !this.hayCambios()) return;
    const request = Object.fromEntries(this.campos.map((c) => [
      c.clave, c.tipo === 'texto' || c.tipo === 'ruc' ? b[c.clave].trim() : Number(b[c.clave].replace(',', '.')),
    ])) as unknown as ActualizarConfiguracionRequest;
    this.guardando.set(true);
    this.errores.set({});
    this.error.set(null);
    this.api.guardar(request).subscribe({
      next: (c) => {
        this.guardando.set(false);
        this.datos.set(c);
        this.llenar(c);
        this.avisos.ok('Configuración guardada.');
        this.cargarHistorial();
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        if (Object.keys(err.campos).length) this.errores.set(err.campos);
        else this.error.set(err.mensaje);
      },
    });
  }

  /** Valor numérico del borrador; si el campo está vacío o a medio escribir, el guardado. */
  private numero(clave: Clave): number {
    const n = Number((this.borrador()?.[clave] ?? '').replace(',', '.'));
    if (this.borrador()?.[clave] !== '' && !Number.isNaN(n)) return n;
    return Number(this.datos()?.[clave] ?? 0);
  }

  private cargar(): void {
    this.cargando.set(true);
    this.api.obtener().subscribe({
      next: (c) => { this.datos.set(c); this.llenar(c); this.cargando.set(false); },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }

  private cargarHistorial(): void {
    this.cargandoHistorial.set(true);
    this.errorHistorial.set(null);
    this.auditoria.cambiosConfiguracion().subscribe({
      next: (lista) => { this.historial.set(lista); this.cargandoHistorial.set(false); },
      error: (e: unknown) => { this.cargandoHistorial.set(false); this.errorHistorial.set(leerErrorApi(e).mensaje); },
    });
  }

  private llenar(c: DatosConfiguracion): void {
    this.borrador.set(Object.fromEntries(this.campos.map((x) => [x.clave, String(c[x.clave]).replace('.', ',')])) as Borrador);
    this.errores.set({});
  }
}

/** Compara el valor guardado con el del borrador según el tipo del campo. */
function iguales(tipo: string, guardado: unknown, borrador: string): boolean {
  if (tipo === 'texto' || tipo === 'ruc') return String(guardado).trim() === borrador.trim();
  const n = Number(borrador.replace(',', '.'));
  return borrador.trim() !== '' && !Number.isNaN(n) && n === Number(guardado);
}
