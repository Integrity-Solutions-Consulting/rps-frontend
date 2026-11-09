import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ConfiguracionService } from '../../services/configuracion.service';
import { ActualizarConfiguracionRequest, CAMPOS_CONFIGURACION, Configuracion as DatosConfiguracion } from '../../models/configuracion.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { SoloNumeros } from '../../../../shared/directives/solo-numeros.directive';
import { SessionService } from '../../../../core/services/session.service';
import { RolSistema } from '../../models/accesos.models';
import { TabRoles } from '../../components/tab-roles/tab-roles';
import { TabUsuarios } from '../../components/tab-usuarios/tab-usuarios';

type Borrador = Record<keyof ActualizarConfiguracionRequest, string>;
type Pestana = 'general' | 'roles' | 'usuarios';

/**
 * Configuración: los campos de ConfiguracionGlobal de rps-backend.
 * Se guarda todo junto (PUT /api/configuracion); los rangos los valida el backend y los errores vuelven por campo.
 */
@Component({
  selector: 'app-configuracion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, Icon, SoloNumeros, TabRoles, TabUsuarios],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
})
export class Configuracion {
  private readonly api = inject(ConfiguracionService);
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

  protected readonly campos = CAMPOS_CONFIGURACION;
  protected readonly grupos = [...new Set(CAMPOS_CONFIGURACION.map((c) => c.grupo))];

  protected readonly datos = signal<DatosConfiguracion | null>(null);
  protected readonly borrador = signal<Borrador | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errores = signal<Record<string, string>>({});

  protected readonly hayCambios = computed(() => {
    const d = this.datos();
    const b = this.borrador();
    return !!d && !!b && this.campos.some((c) => String(d[c.clave]) !== b[c.clave]);
  });

  constructor() {
    this.cargar();
  }

  protected camposDe(grupo: string) {
    return this.campos.filter((c) => c.grupo === grupo);
  }

  protected cambiar(clave: keyof ActualizarConfiguracionRequest, valor: string): void {
    this.borrador.update((b) => (b ? { ...b, [clave]: valor } : b));
  }

  protected deshacer(): void {
    const d = this.datos();
    if (d) this.llenar(d);
  }

  protected guardar(): void {
    const b = this.borrador();
    if (!b) return;
    const request = Object.fromEntries(this.campos.map((c) => [
      c.clave, c.tipo === 'texto' || c.tipo === 'ruc' ? b[c.clave].trim() : Number(b[c.clave].replace(',', '.')),
    ])) as unknown as ActualizarConfiguracionRequest;
    this.guardando.set(true);
    this.errores.set({});
    this.error.set(null);
    this.api.guardar(request).subscribe({
      next: (c) => { this.guardando.set(false); this.datos.set(c); this.llenar(c); this.avisos.ok('Configuración guardada.'); },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        if (Object.keys(err.campos).length) this.errores.set(err.campos);
        else this.error.set(err.mensaje);
      },
    });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.api.obtener().subscribe({
      next: (c) => { this.datos.set(c); this.llenar(c); this.cargando.set(false); },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }

  private llenar(c: DatosConfiguracion): void {
    this.borrador.set(Object.fromEntries(this.campos.map((x) => [x.clave, String(c[x.clave]).replace('.', ',')])) as Borrador);
    this.errores.set({});
  }
}
