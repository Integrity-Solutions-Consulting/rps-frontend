import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ROL_ADMINISTRADOR, ROL_ADMINISTRADOR_CONTABLE, ROL_ASISTENTE_CONTABLE, RolSistema, UsuarioSistema } from '../../models/accesos.models';
import { UsuariosService } from '../../services/usuarios.service';
import { SessionService } from '../../../../core/services/session.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { Icon } from '../../../../shared/components/icon/icon';
import { DialogoCrearUsuario } from '../dialogo-crear-usuario/dialogo-crear-usuario';
import { DialogoCambiarRol } from '../dialogo-cambiar-rol/dialogo-cambiar-rol';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

/**
 * Pestaña Usuarios: todas las cuentas de RPS, activas e inactivas.
 * Agregar usuario solo para Administrador (el backend exige ese rol en /api/auth/register).
 * El menú de cada fila solo aparece donde el backend lo permitiría: nunca en la propia cuenta,
 * y el Administrador Contable solo sobre Asistentes Contables. Cambiar rol: Administrador y Administrador Contable (este con límites).
 */
@Component({
  selector: 'app-tab-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EstadoChip, Icon, DialogoCrearUsuario, DialogoCambiarRol],
  host: {
    '(document:click)': 'menuAbierto.set(null)',
    '(document:keydown.escape)': 'menuAbierto.set(null)',
    '(window:scroll)': 'menuAbierto.set(null)',
    '(window:resize)': 'menuAbierto.set(null)',
  },
  templateUrl: './tab-usuarios.html',
  styleUrl: './tab-usuarios.scss',
})
export class TabUsuarios {
  private readonly api = inject(UsuariosService);
  private readonly session = inject(SessionService);
  private readonly avisos = inject(NotificationService);

  readonly rolSesion = input.required<RolSistema>();

  protected readonly busqueda = signal('');
  protected readonly estado = signal<FiltroEstado>('todos');
  protected readonly creando = signal(false);
  protected readonly cambiandoRol = signal<UsuarioSistema | null>(null);
  protected readonly menuAbierto = signal<{ id: string; top: number; left: number } | null>(null);

  protected readonly usuarios = this.api.usuarios;
  protected readonly cargando = this.api.cargando;
  protected readonly error = this.api.error;
  protected readonly activos = computed(() => this.usuarios().filter((u) => u.activo).length);
  protected readonly puedeCrear = computed(() => this.rolSesion() === ROL_ADMINISTRADOR);

  protected readonly filas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const e = this.estado();
    return this.usuarios().filter((u) =>
      (e === 'todos' || (e === 'activos') === u.activo) &&
      (!q || [u.nombre, u.email, u.rol, this.alias(u.email)].some((t) => t.toLowerCase().includes(q))));
  });

  constructor() {
    this.api.cargar();
  }

  /** Nombre de usuario: la parte del correo antes de la @. */
  protected alias(email: string): string {
    return email.split('@')[0];
  }

  protected puedeCambiar(u: UsuarioSistema): boolean {
    if (u.email === this.session.usuario()?.email) return false;
    return this.rolSesion() === ROL_ADMINISTRADOR || u.rol === ROL_ASISTENTE_CONTABLE;
  }

  /**
   * Mismas reglas que PUT /api/usuarios/{id}/rol: nunca sobre la propia cuenta; el Administrador sobre cualquiera,
   * el Administrador Contable solo sobre cuentas que no sean Administrador ni Administrador Contable.
   */
  protected puedeCambiarRol(u: UsuarioSistema): boolean {
    if (u.email === this.session.usuario()?.email) return false;
    if (this.rolSesion() === ROL_ADMINISTRADOR) return true;
    return this.rolSesion() === ROL_ADMINISTRADOR_CONTABLE && u.rol !== ROL_ADMINISTRADOR && u.rol !== ROL_ADMINISTRADOR_CONTABLE;
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

  protected cambiarEstado(u: UsuarioSistema): void {
    this.menuAbierto.set(null);
    this.api.cambiarEstado(u.id, !u.activo).subscribe({
      next: (r) => this.avisos.ok(`${r.nombre} quedó ${r.activo ? 'activado' : 'desactivado'}.`),
      error: (e: unknown) => this.avisos.error(leerErrorApi(e).mensaje),
    });
  }

  protected abrirCambiarRol(u: UsuarioSistema): void {
    this.menuAbierto.set(null);
    this.cambiandoRol.set(u);
  }

  protected alCambiarRol(u: UsuarioSistema): void {
    this.cambiandoRol.set(null);
    this.avisos.ok(`${u.nombre} ahora tiene el rol ${u.rol}.`);
  }

  protected alCrear(email: string): void {
    this.creando.set(false);
    this.avisos.ok(`Usuario ${email} creado.`);
  }
}
