import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Usuario que devuelve el backend (UsuarioResponse de Features/Auth). */
export interface UsuarioBackend {
  id: string;
  email: string;
  nombre: string;
  roles: string[];
}

/** Respuesta de POST /api/auth/login y /api/auth/refresh-token (AuthResponse del backend). */
interface RespuestaAuth {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiraEn: string;
  usuario: UsuarioBackend;
}

/** Lo que se guarda en el navegador mientras la pestaña está abierta. */
interface SesionGuardada {
  accessToken: string;
  refreshToken: string;
  expiraEn: string;
  usuario: UsuarioBackend;
}

const CLAVE = 'rps.sesion';

/**
 * Sesión del usuario (RC 01: solo usuarios autorizados de Contabilidad).
 * Habla con /api/auth del backend: login, refresh-token y logout.
 * Se guarda en sessionStorage: al cerrar la pestaña hay que volver a entrar.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = `${environment.apiUrl}/auth`;

  private readonly sesion = signal<SesionGuardada | null>(leer());
  /** Renovación en curso: si varias llamadas reciben 401 a la vez, todas esperan la misma. */
  private renovando$: Observable<string> | null = null;

  readonly token = computed(() => this.sesion()?.accessToken ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);
  readonly usuario = computed(() => {
    const u = this.sesion()?.usuario;
    if (!u) return null;
    return { nombre: u.nombre, email: u.email, iniciales: iniciales(u.nombre), area: u.roles[0] ?? 'Contabilidad' };
  });

  /** Roles del usuario en sesión (Administrador, Administrador Contable, Asistente Contable). */
  readonly roles = computed(() => this.sesion()?.usuario.roles ?? []);

  /** POST /api/auth/login */
  iniciarSesion(email: string, password: string): Observable<void> {
    return this.http.post<RespuestaAuth>(`${this.base}/login`, { email, password }).pipe(
      tap((r) => this.guardar(r)),
      map(() => undefined),
    );
  }

  /** POST /api/auth/refresh-token. Devuelve el access token nuevo; si falla, cierra la sesión. */
  renovar(): Observable<string> {
    const refreshToken = this.sesion()?.refreshToken;
    if (!refreshToken) return throwError(() => new Error('Sin sesión'));
    this.renovando$ ??= this.http.post<RespuestaAuth>(`${this.base}/refresh-token`, { refreshToken }).pipe(
      tap((r) => this.guardar(r)),
      map((r) => r.accessToken),
      catchError((e: unknown) => {
        this.terminar('expirada');
        return throwError(() => e);
      }),
      finalize(() => (this.renovando$ = null)),
      shareReplay(1),
    );
    return this.renovando$;
  }

  /** POST /api/auth/logout (invalida el token en el backend) y vuelve al login. */
  cerrarSesion(): void {
    const refreshToken = this.sesion()?.refreshToken ?? null;
    if (!this.token()) return this.terminar();
    this.http.post(`${this.base}/logout`, { refreshToken }).pipe(catchError(() => of(null)))
      .subscribe(() => this.terminar());
  }

  /** Borra la sesión del navegador y lleva al login, recordando a dónde volver. */
  terminar(motivo?: 'expirada'): void {
    this.sesion.set(null);
    escribir(null);
    const volver = this.router.url.startsWith('/login') ? undefined : this.router.url;
    void this.router.navigate(['/login'], { queryParams: { volver, motivo } });
  }

  private guardar(r: RespuestaAuth): void {
    const s: SesionGuardada = { accessToken: r.accessToken, refreshToken: r.refreshToken, expiraEn: r.accessTokenExpiraEn, usuario: r.usuario };
    this.sesion.set(s);
    escribir(s);
  }
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || 'U';
}

// sessionStorage puede no existir o fallar (modo privado, permisos): la app sigue sin guardar.
function leer(): SesionGuardada | null {
  try {
    const texto = sessionStorage.getItem(CLAVE);
    return texto ? (JSON.parse(texto) as SesionGuardada) : null;
  } catch {
    return null;
  }
}

function escribir(s: SesionGuardada | null): void {
  try {
    if (s) sessionStorage.setItem(CLAVE, JSON.stringify(s));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: la sesión dura hasta recargar */
  }
}
