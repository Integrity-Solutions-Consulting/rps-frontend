import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
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
  /** Módulos que permite el rol (GET /api/auth/permisos). null mientras no se han pedido. */
  permisos?: string[] | null;
  /** Momento del login (ms). No cambia al renovar el token: marca el tope de 8 h. */
  inicio: number;
}

const CLAVE = 'rps.sesion';
const CLAVE_ACTIVIDAD = 'rps.actividad';

/** Igual que el backend (Jwt:SesionInactividadMinutos y Jwt:SesionDuracionMaximaHoras). */
const INACTIVIDAD_MS = 40 * 60_000;
const DURACION_MAXIMA_MS = 8 * 3_600_000;
/** Cada cuánto se revisa la sesión y cada cuánto, si hay uso sin llamadas al backend, se le avisa. */
const REVISION_MS = 30_000;
const AVISO_BACKEND_MS = 10 * 60_000;
const EVENTOS_USO = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;

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
  /** Último uso del usuario (ms), compartido entre recargas de la pestaña. */
  private ultimaActividad = leerActividad();
  /** Última llamada al backend (ms): el backend cuenta la inactividad por peticiones. */
  private ultimaPeticion = Date.now();
  private vigilando = false;

  readonly token = computed(() => this.sesion()?.accessToken ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);
  readonly usuario = computed(() => {
    const u = this.sesion()?.usuario;
    if (!u) return null;
    return { id: u.id, nombre: u.nombre, email: u.email, iniciales: iniciales(u.nombre), area: u.roles[0] ?? 'Contabilidad' };
  });

  /** Roles del usuario en sesión (Administrador, Administrador Contable, Asistente Contable). */
  readonly roles = computed(() => this.sesion()?.usuario.roles ?? []);

  /** Módulos permitidos (colaboradores, liquidaciones, configuracion...). null: todavía no se pidieron. */
  readonly permisos = computed(() => this.sesion()?.permisos ?? null);

  tienePermiso(modulo: string): boolean {
    return this.permisos()?.includes(modulo) ?? false;
  }

  /**
   * GET /api/auth/permisos. El backend los lee de la base, así que un cambio en Configuración > Roles
   * se nota al volver a pedirlos (al iniciar sesión, al renovar el token o al recargar la página).
   * Solo sirven para el menú y las rutas: quien de verdad bloquea es el backend.
   */
  cargarPermisos(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/permisos`).pipe(
      tap((permisos) => {
        const s = this.sesion();
        if (!s) return;
        const nueva = { ...s, permisos };
        this.sesion.set(nueva);
        escribir(nueva);
      }),
    );
  }

  /**
   * Cierra la sesión tras 40 min sin uso o 8 h desde el login (el backend aplica lo mismo).
   * Se llama una vez al arrancar la app (App).
   */
  vigilarInactividad(): void {
    if (this.vigilando || typeof window === 'undefined') return;
    this.vigilando = true;
    let ultimoRegistro = 0;
    const registrarUso = () => {
      const ahora = Date.now();
      if (ahora - ultimoRegistro < 5_000) return;
      ultimoRegistro = ahora;
      this.ultimaActividad = ahora;
      escribirActividad(ahora);
    };
    for (const e of EVENTOS_USO) window.addEventListener(e, registrarUso, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.revisarVigencia();
    });
    setInterval(() => this.revisarVigencia(), REVISION_MS);
    this.revisarVigencia();
  }

  /** Lo llama el interceptor en cada petición al backend. */
  registrarPeticion(): void {
    this.ultimaPeticion = Date.now();
  }

  private revisarVigencia(): void {
    const s = this.sesion();
    if (!s) return;
    const ahora = Date.now();
    if (ahora - this.ultimaActividad > INACTIVIDAD_MS || ahora - (s.inicio ?? 0) > DURACION_MAXIMA_MS) {
      this.cerrarSesion('expirada');
      return;
    }
    // Está usando la app pero sin llamar al backend (p. ej. leyendo una tabla): se le avisa
    // al backend para que no cuente esos minutos como inactividad.
    if (ahora - this.ultimaActividad < REVISION_MS * 2 && ahora - this.ultimaPeticion > AVISO_BACKEND_MS) {
      this.http.get(`${this.base}/me`).pipe(catchError(() => of(null))).subscribe();
    }
  }

  /** POST /api/auth/login */
  iniciarSesion(email: string, password: string): Observable<void> {
    return this.http.post<RespuestaAuth>(`${this.base}/login`, { email, password }).pipe(
      tap((r) => this.guardar(r)),
      // Si fallan los permisos, el login sigue: el guard de cada ruta los vuelve a pedir.
      switchMap(() => this.cargarPermisos().pipe(catchError(() => of(null)))),
      map(() => undefined),
    );
  }

  /** POST /api/auth/refresh-token. Devuelve el access token nuevo; si falla, cierra la sesión. */
  renovar(): Observable<string> {
    const refreshToken = this.sesion()?.refreshToken;
    if (!refreshToken) return throwError(() => new Error('Sin sesión'));
    this.renovando$ ??= this.http.post<RespuestaAuth>(`${this.base}/refresh-token`, { refreshToken }).pipe(
      tap((r) => this.guardar(r)),
      // Al renovar se actualizan también los permisos, por si cambiaron en Configuración > Roles.
      tap(() => this.cargarPermisos().subscribe({ error: () => undefined })),
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
  cerrarSesion(motivo?: 'expirada'): void {
    const refreshToken = this.sesion()?.refreshToken ?? null;
    if (!this.token()) return this.terminar(motivo);
    this.http.post(`${this.base}/logout`, { refreshToken }).pipe(catchError(() => of(null)))
      .subscribe(() => this.terminar(motivo));
  }

  /** Borra la sesión del navegador y lleva al login, recordando a dónde volver. */
  terminar(motivo?: 'expirada'): void {
    this.sesion.set(null);
    escribir(null);
    const volver = this.router.url.startsWith('/login') ? undefined : this.router.url;
    void this.router.navigate(['/login'], { queryParams: { volver, motivo } });
  }

  private guardar(r: RespuestaAuth): void {
    // Se conservan los permisos ya cargados de este mismo usuario (los de otro usuario no).
    const previos = this.sesion();
    const permisos = previos?.usuario.id === r.usuario.id ? (previos.permisos ?? null) : null;
    // Al renovar se conserva el inicio original: renovar no alarga el tope de 8 h.
    const inicio = previos?.usuario.id === r.usuario.id ? (previos.inicio ?? Date.now()) : Date.now();
    if (!previos) {
      this.ultimaActividad = Date.now();
      escribirActividad(this.ultimaActividad);
    }
    const s: SesionGuardada = { accessToken: r.accessToken, refreshToken: r.refreshToken, expiraEn: r.accessTokenExpiraEn, usuario: r.usuario, permisos, inicio };
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

function leerActividad(): number {
  try {
    return Number(sessionStorage.getItem(CLAVE_ACTIVIDAD)) || Date.now();
  } catch {
    return Date.now();
  }
}

function escribirActividad(ms: number): void {
  try {
    sessionStorage.setItem(CLAVE_ACTIVIDAD, String(ms));
  } catch {
    /* sin almacenamiento: se cuenta solo en memoria */
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
