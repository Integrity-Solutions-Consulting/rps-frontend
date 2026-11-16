import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../../../core/services/session.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';

/** Pantalla de ingreso (RC 01). POST /api/auth/login; el backend bloquea 15 min tras 5 intentos fallidos. */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly verPassword = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Campos que el usuario ya visitó (blur) o que ya intentó entrar: a partir de ahí se muestra el error en vivo. */
  private readonly tocados = signal<ReadonlySet<string>>(new Set());
  private readonly intentoEntrar = signal(false);

  private readonly erroresCliente = computed<Record<string, string>>(() => {
    const errores: Record<string, string> = {};
    if (!this.email().trim()) errores['email'] = 'Escribe tu correo.';
    if (!this.password()) errores['password'] = 'Escribe tu contraseña.';
    return errores;
  });

  protected readonly expirada = this.ruta.snapshot.queryParamMap.get('motivo') === 'expirada';

  protected marcarTocado(campo: string): void {
    if (!this.tocados().has(campo)) this.tocados.update((t) => new Set(t).add(campo));
  }

  /** Error a mostrar para ese campo, o null si todavía no corresponde mostrarlo (no tocado ni se intentó entrar). */
  protected errorDe(campo: string): string | null {
    if (!this.tocados().has(campo) && !this.intentoEntrar()) return null;
    return this.erroresCliente()[campo] ?? null;
  }

  protected entrar(evento: Event): void {
    evento.preventDefault();
    this.intentoEntrar.set(true);
    this.error.set(null);
    if (Object.keys(this.erroresCliente()).length) return;

    const email = this.email().trim();
    const password = this.password();
    this.enviando.set(true);
    this.session.iniciarSesion(email, password).subscribe({
      next: () => {
        const volver = this.ruta.snapshot.queryParamMap.get('volver');
        void this.router.navigateByUrl(volver && volver.startsWith('/') && !volver.startsWith('/login') ? volver : '/inicio');
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        const api = leerErrorApi(e);
        this.error.set(api.status === 429 ? 'Demasiados intentos. Espera un minuto y vuelve a probar.'
          : api.status === 0 ? 'No se pudo conectar con el servidor. Revisa que el backend esté encendido.'
          : api.mensaje);
      },
    });
  }
}
