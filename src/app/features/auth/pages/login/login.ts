import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../../../core/services/session.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { rutaConMock } from '../../../../core/mocks/mock-config';
import { USUARIO_DESARROLLO } from '../../../../core/mocks/auth.mock';
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
  protected readonly errores = signal<Record<string, string>>({});

  protected readonly expirada = this.ruta.snapshot.queryParamMap.get('motivo') === 'expirada';
  /** Solo con `npm start` (datos de ejemplo): se muestra el usuario de prueba. */
  protected readonly ejemplo = rutaConMock('/auth/login') ? USUARIO_DESARROLLO : null;

  protected entrar(evento: Event): void {
    evento.preventDefault();
    const email = this.email().trim();
    const password = this.password();
    const faltan: Record<string, string> = {};
    if (!email) faltan['email'] = 'Escribe tu correo.';
    if (!password) faltan['password'] = 'Escribe tu contraseña.';
    this.errores.set(faltan);
    this.error.set(null);
    if (Object.keys(faltan).length) return;

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
