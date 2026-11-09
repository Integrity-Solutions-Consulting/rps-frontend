import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { RolSistema } from '../../models/accesos.models';
import { RolesService } from '../../services/roles.service';
import { UsuariosService } from '../../services/usuarios.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';

/**
 * Ventana "Agregar usuario". Valida lo básico para avisar antes de enviar;
 * las reglas reales (correo único, contraseña, rol existente) las aplica el backend en POST /api/auth/register.
 */
@Component({
  selector: 'app-dialogo-crear-usuario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon],
  host: { '(document:keydown.escape)': 'cancelar.emit()' },
  templateUrl: './dialogo-crear-usuario.html',
  styleUrl: './dialogo-crear-usuario.scss',
})
export class DialogoCrearUsuario {
  private readonly api = inject(UsuariosService);
  private readonly rolesApi = inject(RolesService);

  readonly cancelar = output<void>();
  readonly creado = output<string>();

  /** Roles activos que da el backend (GET /api/roles/asignables). */
  protected readonly roles = signal<RolSistema[]>([]);
  protected readonly nombre = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly verPassword = signal(false);
  protected readonly rol = signal<RolSistema | null>(null);
  protected readonly errores = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);

  constructor() {
    this.rolesApi.asignables().subscribe({
      next: (r) => this.roles.set(r),
      error: (e: unknown) => this.error.set(leerErrorApi(e).mensaje),
    });
  }

  protected limpiar(campo: string): void {
    if (this.errores()[campo]) this.errores.update(({ [campo]: _, ...resto }) => resto);
  }

  protected elegirRol(r: RolSistema): void {
    this.rol.set(r);
    this.limpiar('rol');
  }

  protected crear(): void {
    const errores: Record<string, string> = {};
    const email = this.email().trim();
    const password = this.password();
    if (!this.nombre().trim()) errores['nombre'] = 'Escribe el nombre del usuario.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores['email'] = 'Escribe un correo válido.';
    if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
      errores['password'] = 'Mínimo 10 caracteres, con letras y números.';
    if (!this.rol()) errores['rol'] = 'Elige un rol.';
    this.errores.set(errores);
    this.error.set(null);
    if (Object.keys(errores).length) return;

    this.guardando.set(true);
    this.api.crear({ nombre: this.nombre().trim(), email, password, rol: this.rol()! }).subscribe({
      next: () => { this.guardando.set(false); this.creado.emit(email); },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        if (Object.keys(err.campos).length) this.errores.set(err.campos);
        else this.error.set(err.mensaje);
      },
    });
  }
}
