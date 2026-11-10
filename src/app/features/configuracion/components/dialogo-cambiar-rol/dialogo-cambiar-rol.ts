import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { DESCRIPCION_ROL, ROL_ADMINISTRADOR, ROL_ADMINISTRADOR_CONTABLE, RolSistema, UsuarioSistema } from '../../models/accesos.models';
import { RolesService } from '../../services/roles.service';
import { UsuariosService } from '../../services/usuarios.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';
import { iniciales, tonoAvatar } from '../avatar';

/** Ventana "Cambiar rol". Las reglas (rol activo, último Administrador, propia cuenta) las aplica el backend. */
@Component({
  selector: 'app-dialogo-cambiar-rol',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { '(document:keydown.escape)': 'cancelar.emit()' },
  templateUrl: './dialogo-cambiar-rol.html',
  styleUrl: './dialogo-cambiar-rol.scss',
})
export class DialogoCambiarRol {
  private readonly usuariosApi = inject(UsuariosService);
  private readonly rolesApi = inject(RolesService);

  readonly usuario = input.required<UsuarioSistema>();
  /** Rol de quien edita: el Administrador Contable no ve los roles de administración. */
  readonly rolSesion = input.required<RolSistema>();
  readonly cancelar = output<void>();
  readonly cambiado = output<UsuarioSistema>();

  protected readonly roles = signal<RolSistema[]>([]);
  protected readonly elegido = signal<RolSistema | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);

  protected readonly rol = computed(() => this.elegido() ?? this.usuario().rol);
  protected readonly hayCambio = computed(() => this.rol() !== this.usuario().rol);

  /** Cada rol con su descripción y cuántos módulos abre (si se conocen sus permisos). */
  protected readonly opciones = computed(() => this.roles().map((nombre) => {
    const detalle = this.rolesApi.roles().find((r) => r.nombre === nombre);
    return {
      nombre,
      descripcion: detalle?.descripcion || DESCRIPCION_ROL[nombre] || '',
      modulos: detalle ? detalle.permisos.length : null,
      actual: nombre === this.usuario().rol,
    };
  }));

  protected readonly iniciales = iniciales;
  protected readonly tonoAvatar = tonoAvatar;

  constructor() {
    this.rolesApi.asignables().subscribe({
      next: (r) => this.roles.set(this.rolSesion() === ROL_ADMINISTRADOR ? r
        : r.filter((x) => x !== ROL_ADMINISTRADOR && x !== ROL_ADMINISTRADOR_CONTABLE)),
      error: (e: unknown) => this.error.set(leerErrorApi(e).mensaje),
    });
    if (this.rolesApi.roles().length === 0) this.rolesApi.cargar();
  }

  protected guardar(): void {
    if (!this.hayCambio()) return;
    this.guardando.set(true);
    this.error.set(null);
    this.usuariosApi.cambiarRol(this.usuario().id, this.rol()).subscribe({
      next: (u) => { this.guardando.set(false); this.cambiado.emit(u); },
      error: (e: unknown) => { this.guardando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }
}
