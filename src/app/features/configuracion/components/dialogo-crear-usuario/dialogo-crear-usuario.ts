import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MODULOS_PERMISO, RolSistema } from '../../models/accesos.models';
import { RolesService } from '../../services/roles.service';
import { UsuariosService } from '../../services/usuarios.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';
import { iniciales } from '../avatar';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';

/**
 * Ventana "Agregar usuario". Valida lo básico para avisar antes de enviar;
 * las reglas reales (correo único, contraseña, rol existente) las aplica el backend en POST /api/auth/register.
 * El resumen de módulos sale de los permisos de cada rol (GET /api/roles).
 */
@Component({
  selector: 'app-dialogo-crear-usuario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, UiDialog],
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
  /** Errores que solo puede dar el backend (correo ya usado, rol inexistente, etc.). */
  private readonly erroresServidor = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);

  /** Campos que el usuario ya visitó (blur) o que ya intentó guardar: a partir de ahí se muestra el error en vivo. */
  private readonly tocados = signal<ReadonlySet<string>>(new Set());
  private readonly intentoGuardar = signal(false);

  /** Reglas que se pueden validar sin backend, recalculadas en cada cambio. */
  private readonly erroresCliente = computed<Record<string, string>>(() => {
    const errores: Record<string, string> = {};
    const email = this.email().trim();
    const password = this.password();
    if (!this.nombre().trim()) errores['nombre'] = 'Escribe el nombre del usuario.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores['email'] = 'Escribe un correo válido.';
    if (password.length < 10) errores['password'] = 'Mínimo 10 caracteres.';
    if (!this.rol()) errores['rol'] = 'Elige un rol.';
    return errores;
  });

  protected readonly iniciales = computed(() => (this.nombre().trim() ? iniciales(this.nombre()) : ''));

  /** Módulos del rol elegido, con Sí/No por cada uno; null si no hay rol o no se conocen sus permisos. */
  protected readonly modulos = computed(() => {
    const elegido = this.rol();
    const detalle = elegido ? this.rolesApi.roles().find((r) => r.nombre === elegido) : null;
    if (!detalle) return null;
    return MODULOS_PERMISO.map((m) => ({ etiqueta: m.etiqueta, permitido: detalle.permisos.includes(m.clave) }));
  });

  constructor() {
    this.rolesApi.asignables().subscribe({
      next: (r) => this.roles.set(r),
      error: (e: unknown) => this.error.set(leerErrorApi(e).mensaje),
    });
    if (this.rolesApi.roles().length === 0) this.rolesApi.cargar();
  }

  protected limpiar(campo: string): void {
    if (this.erroresServidor()[campo]) this.erroresServidor.update(({ [campo]: _, ...resto }) => resto);
  }

  protected marcarTocado(campo: string): void {
    if (!this.tocados().has(campo)) this.tocados.update((t) => new Set(t).add(campo));
  }

  /** Error a mostrar para ese campo, o null si todavía no corresponde mostrarlo (no tocado ni se intentó guardar). */
  protected errorDe(campo: string): string | null {
    if (!this.tocados().has(campo) && !this.intentoGuardar()) return null;
    return this.erroresServidor()[campo] ?? this.erroresCliente()[campo] ?? null;
  }

  protected elegirRol(r: RolSistema): void {
    this.rol.set(r);
    this.limpiar('rol');
  }

  protected crear(): void {
    this.intentoGuardar.set(true);
    this.error.set(null);
    if (Object.keys(this.erroresCliente()).length) return;

    const email = this.email().trim();
    const password = this.password();
    this.guardando.set(true);
    this.api.crear({ nombre: this.nombre().trim(), email, password, rol: this.rol()! }).subscribe({
      next: () => { this.guardando.set(false); this.creado.emit(email); },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        if (Object.keys(err.campos).length) this.erroresServidor.set(err.campos);
        else this.error.set(err.mensaje);
      },
    });
  }
}
