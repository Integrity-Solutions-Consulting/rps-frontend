import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
import { DialogoConfirmarEstado } from '../dialogo-confirmar-estado/dialogo-confirmar-estado';
import { iniciales, tonoAvatar } from '../avatar';
import { coincide } from '../../../../shared/utils/texto';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

/**
 * Pestaña Usuarios: todas las cuentas de RPS, activas e inactivas.
 * Agregar usuario solo para Administrador (el backend exige ese rol en /api/auth/register).
 * Las acciones de cada fila solo aparecen donde el backend lo permitiría: nunca en la propia cuenta,
 * y el Administrador Contable solo sobre Asistentes Contables. Desactivar pide confirmación; activar no.
 */
@Component({
  selector: 'app-tab-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, EstadoChip, Icon, DialogoCrearUsuario, DialogoCambiarRol, DialogoConfirmarEstado],
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
  protected readonly filtroRol = signal('');
  protected readonly creando = signal(false);
  protected readonly cambiandoRol = signal<UsuarioSistema | null>(null);
  protected readonly desactivando = signal<UsuarioSistema | null>(null);
  protected readonly guardandoEstado = signal(false);
  protected readonly menuAbierto = signal<{ id: string; top: number; left: number } | null>(null);

  protected readonly usuarios = this.api.usuarios;
  protected readonly cargando = this.api.cargando;
  protected readonly error = this.api.error;
  protected readonly activos = computed(() => this.usuarios().filter((u) => u.activo).length);
  protected readonly inactivos = computed(() => this.usuarios().length - this.activos());
  protected readonly puedeCrear = computed(() => this.rolSesion() === ROL_ADMINISTRADOR);
  /** Roles que tienen las cuentas de la lista, para el filtro. */
  protected readonly rolesEnLista = computed(() => [...new Set(this.usuarios().map((u) => u.rol))].sort((a, b) => a.localeCompare(b)));

  protected readonly filas = computed(() => {
    const q = this.busqueda();
    const e = this.estado();
    const r = this.filtroRol();
    return this.usuarios().filter((u) =>
      (e === 'todos' || (e === 'activos') === u.activo) &&
      (!r || u.rol === r) &&
      coincide(`${u.nombre} ${u.email} ${u.rol}`, q));
  });
  protected readonly hayFiltros = computed(() => !!(this.busqueda().trim() || this.filtroRol() || this.estado() !== 'todos'));

  protected readonly iniciales = iniciales;
  protected readonly tonoAvatar = tonoAvatar;

  constructor() {
    this.api.cargar();
  }

  protected esYo(u: UsuarioSistema): boolean {
    return u.email === this.session.usuario()?.email;
  }

  protected puedeCambiar(u: UsuarioSistema): boolean {
    if (this.esYo(u)) return false;
    return this.rolSesion() === ROL_ADMINISTRADOR || u.rol === ROL_ASISTENTE_CONTABLE;
  }

  /**
   * Mismas reglas que PUT /api/usuarios/{id}/rol: nunca sobre la propia cuenta; el Administrador sobre cualquiera,
   * el Administrador Contable solo sobre cuentas que no sean Administrador ni Administrador Contable.
   */
  protected puedeCambiarRol(u: UsuarioSistema): boolean {
    if (this.esYo(u)) return false;
    if (this.rolSesion() === ROL_ADMINISTRADOR) return true;
    return this.rolSesion() === ROL_ADMINISTRADOR_CONTABLE && u.rol !== ROL_ADMINISTRADOR && u.rol !== ROL_ADMINISTRADOR_CONTABLE;
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.estado.set('todos');
    this.filtroRol.set('');
  }

  protected abrirMenu(id: string, evento: Event): void {
    evento.stopPropagation();
    if (this.menuAbierto()?.id === id) {
      this.menuAbierto.set(null);
      return;
    }
    const boton = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    const ancho = 220;
    const alto = 56;
    const abajo = boton.bottom + 6 + alto <= window.innerHeight;
    this.menuAbierto.set({ id, top: abajo ? boton.bottom + 6 : boton.top - 6 - alto, left: Math.max(8, boton.right - ancho) });
  }

  /** Desactivar pide confirmación (la persona deja de poder entrar); activar se hace directo. */
  protected pedirCambioEstado(u: UsuarioSistema): void {
    this.menuAbierto.set(null);
    if (u.activo) this.desactivando.set(u);
    else this.cambiarEstado(u, true);
  }

  protected confirmarDesactivar(): void {
    const u = this.desactivando();
    if (u) this.cambiarEstado(u, false);
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

  private cambiarEstado(u: UsuarioSistema, activo: boolean): void {
    this.guardandoEstado.set(true);
    this.api.cambiarEstado(u.id, activo).subscribe({
      next: (r) => {
        this.guardandoEstado.set(false);
        this.desactivando.set(null);
        this.avisos.ok(`${r.nombre} quedó ${r.activo ? 'activado' : 'desactivado'}.`);
      },
      error: (e: unknown) => {
        this.guardandoEstado.set(false);
        this.avisos.error(leerErrorApi(e).mensaje);
      },
    });
  }
}
