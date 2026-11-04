import { RespuestaMock } from './colaboradores.mock';

/**
 * Login de ejemplo para `npm start`. Usa el mismo usuario que siembra el backend en desarrollo
 * (Bootstrap en rps-backend/appsettings.Development.json, ver docs/CONEXIONES.md) y responde
 * igual que Features/Auth: AuthResponse si todo va bien, ProblemDetails con `codigo` si no.
 */
export const USUARIO_DESARROLLO = { email: 'admin@rps.test', password: 'RpsDesarrollo2026' };

const usuario = {
  id: '00000000-0000-7000-8000-000000000001',
  email: USUARIO_DESARROLLO.email,
  nombre: 'Administrador Desarrollo',
  roles: ['Administrador'],
};

function tokens() {
  const expira = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return { accessToken: `mock.${Date.now()}`, refreshToken: `mock-refresh.${Date.now()}`, accessTokenExpiraEn: expira, usuario };
}

export function mockAuth(metodo: string, ruta: string, body: Record<string, unknown> | null): RespuestaMock {
  if (metodo === 'POST' && ruta === '/auth/login') {
    const email = String(body?.['email'] ?? '').trim().toLowerCase();
    const password = String(body?.['password'] ?? '');
    if (email !== USUARIO_DESARROLLO.email || password !== USUARIO_DESARROLLO.password) {
      return {
        status: 400,
        body: {
          title: 'One or more validation errors occurred.', status: 400, codigo: 'Auth.CredencialesInvalidas',
          errors: { password: ['Email o contraseña incorrectos.'] },
        },
      };
    }
    return { status: 200, body: tokens() };
  }
  if (metodo === 'POST' && ruta === '/auth/refresh-token') return { status: 200, body: tokens() };
  if (metodo === 'POST' && ruta === '/auth/logout') return { status: 204, body: null };
  if (metodo === 'GET' && ruta === '/auth/me') return { status: 200, body: usuario };
  return { status: 404, body: { title: 'No encontrado', status: 404, detail: `Sin datos de ejemplo para ${ruta}.` } };
}
