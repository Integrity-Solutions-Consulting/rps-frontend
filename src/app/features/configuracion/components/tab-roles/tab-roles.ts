import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  DESCRIPCION_ROL, MODULOS_PERMISO, Permisos, ROL_ADMINISTRADOR, RolSistema, RolSistemaDetalle,
  listaDesdePermisos, permisosDesdeLista,
} from '../../models/accesos.models';
import { RolesService } from '../../services/roles.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { Icon } from '../../../../shared/components/icon/icon';
import { DialogoPermisos } from '../dialogo-permisos/dialogo-permisos';
import { DialogoCrearRol } from '../dialogo-crear-rol/dialogo-crear-rol';
import { DialogoConfirmarEstado } from '../dialogo-confirmar-estado/dialogo-confirmar-estado';
import { coincide } from '../../../../shared/utils/texto';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

/**
 * Pestaña Roles: roles que el usuario en sesión puede administrar (el backend decide cuáles).
 * Administrador: todos menos el propio rol Administrador, y puede crear roles.
 * Administrador Contable: Asistente Contable y los roles nuevos.
 * Igual que en Usuarios, desactivar pide confirmación; activar no.
 */
@Component({
  selector: 'app-tab-roles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EstadoChip, Icon, DialogoPermisos, DialogoCrearRol, DialogoConfirmarEstado],
  host: {
    '(document:click)': 'menuAbierto.set(null)',
    '(document:keydown.escape)': 'menuAbierto.set(null)',
    // El menú flota sobre la página (position: fixed); si la página se mueve, se cierra.
    '(window:scroll)': 'menuAbierto.set(null)',
    '(window:resize)': 'menuAbierto.set(null)',
  },
  templateUrl: './tab-roles.html',
  styleUrl: './tab-roles.scss',
})
export class TabRoles {
  private readonly api = inject(RolesService);
  private readonly avisos = inject(NotificationService);

  readonly rolSesion = input.required<RolSistema>();

  protected readonly busqueda = signal('');
  protected readonly estado = signal<FiltroEstado>('todos');
  /** Menú de acciones abierto: fila y posición en pantalla, para que no lo recorte la tabla. */
  protected readonly menuAbierto = signal<{ id: string; top: number; left: number } | null>(null);
  protected readonly editando = signal<RolSistemaDetalle | null>(null);
  protected readonly errorPermisos = signal<string | null>(null);
  protected readonly creando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly desactivando = signal<RolSistemaDetalle | null>(null);
  protected readonly guardandoEstado = signal(false);

  protected readonly roles = this.api.roles;
  protected readonly cargando = this.api.cargando;
  protected readonly error = this.api.error;
  protected readonly activos = computed(() => this.roles().filter((r) => r.activo).length);
  protected readonly puedeCrear = computed(() => this.rolSesion() === ROL_ADMINISTRADOR);

  protected readonly filas = computed(() => {
    const q = this.busqueda();
    const e = this.estado();
    return this.roles().filter((r) =>
      (e === 'todos' || (e === 'activos') === r.activo) &&
      coincide(`${r.nombre} ${this.descripcion(r)}`, q));
  });

  constructor() {
    this.api.cargar();
  }

  protected descripcion(r: RolSistemaDetalle): string {
    return r.descripcion ?? DESCRIPCION_ROL[r.nombre] ?? 'Rol personalizado';
  }

  protected modulosDe(r: RolSistemaDetalle): string[] {
    return MODULOS_PERMISO.filter((m) => r.permisos.includes(m.clave)).map((m) => m.etiqueta);
  }

  protected permisosDe(r: RolSistemaDetalle): Permisos {
    return permisosDesdeLista(r.permisos);
  }

  protected abrirMenu(id: string, evento: Event): void {
    evento.stopPropagation();
    if (this.menuAbierto()?.id === id) {
      this.menuAbierto.set(null);
      return;
    }
    const boton = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    const ancho = 210;
    const alto = 92;
    const abajo = boton.bottom + 6 + alto <= window.innerHeight;
    this.menuAbierto.set({ id, top: abajo ? boton.bottom + 6 : boton.top - 6 - alto, left: Math.max(8, boton.right - ancho) });
  }

  /** Desactivar pide confirmación (sus usuarios pierden esos permisos); activar se hace directo. */
  protected pedirCambioEstado(r: RolSistemaDetalle): void {
    this.menuAbierto.set(null);
    if (r.activo) this.desactivando.set(r);
    else this.cambiarEstado(r, true);
  }

  protected confirmarDesactivar(): void {
    const r = this.desactivando();
    if (r) this.cambiarEstado(r, false);
  }

  private cambiarEstado(r: RolSistemaDetalle, activo: boolean): void {
    this.guardandoEstado.set(true);
    this.api.cambiarEstado(r.id, activo).subscribe({
      next: (x) => {
        this.guardandoEstado.set(false);
        this.desactivando.set(null);
        this.avisos.ok(`Rol ${x.nombre} ${x.activo ? 'activado' : 'desactivado'}.`);
      },
      error: (e: unknown) => {
        this.guardandoEstado.set(false);
        this.avisos.error(leerErrorApi(e).mensaje);
      },
    });
  }

  protected editarPermisos(r: RolSistemaDetalle): void {
    this.menuAbierto.set(null);
    this.errorPermisos.set(null);
    this.editando.set(r);
  }

  protected guardarPermisos(permisos: Permisos): void {
    const r = this.editando();
    if (!r) return;
    this.guardando.set(true);
    this.errorPermisos.set(null);
    this.api.actualizarPermisos(r.id, listaDesdePermisos(permisos)).subscribe({
      next: (x) => { this.guardando.set(false); this.editando.set(null); this.avisos.ok(`Permisos del rol ${x.nombre} guardados.`); },
      error: (e: unknown) => { this.guardando.set(false); this.errorPermisos.set(leerErrorApi(e).mensaje); },
    });
  }

  protected alCrear(r: RolSistemaDetalle): void {
    this.creando.set(false);
    this.avisos.ok(`Rol ${r.nombre} creado.`);
  }
}
