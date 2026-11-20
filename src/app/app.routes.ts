import { Routes } from '@angular/router';
import { AppLayout } from './core/layout/app-layout/app-layout';
import { MENU } from './core/navigation/menu';
import { authGuard, permisoGuard, soloSinSesionGuard } from './core/auth/auth.guard';

// Módulos que todavía no tienen pantalla: muestran su nombre y descripción.
const pendientes: Routes = MENU.filter((m) => !m.disponible).map((m) => ({
  path: m.ruta,
  title: `${m.titulo} · RPS`,
  data: { modulo: m.titulo, descripcion: m.descripcion, icono: m.icono },
  loadComponent: () => import('./features/proximamente/proximamente').then((c) => c.Proximamente),
}));

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · RPS',
    canActivate: [soloSinSesionGuard],
    loadComponent: () => import('./features/auth/pages/login/login').then((c) => c.Login),
  },
  {
    path: '',
    component: AppLayout,
    // RC 01: todas las pantallas piden sesión (el backend exige token en todas sus rutas).
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio · RPS',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then((r) => r.DASHBOARD_ROUTES),
      },
      {
        path: 'colaboradores',
        canActivate: [permisoGuard('colaboradores', 'Colaboradores')],
        loadChildren: () => import('./features/colaboradores/colaboradores.routes').then((r) => r.COLABORADORES_ROUTES),
      },
      {
        path: 'contratos',
        canActivate: [permisoGuard('contratos', 'Contratos')],
        loadChildren: () => import('./features/contratos/contratos.routes').then((r) => r.CONTRATOS_ROUTES),
      },
      {
        path: 'anticipos',
        canActivate: [permisoGuard('anticipos', 'Anticipos')],
        loadChildren: () => import('./features/anticipos/anticipos.routes').then((r) => r.ANTICIPOS_ROUTES),
      },
      {
        path: 'prestamos',
        canActivate: [permisoGuard('prestamos', 'Préstamos')],
        loadChildren: () => import('./features/prestamos/prestamos.routes').then((r) => r.PRESTAMOS_ROUTES),
      },
      {
        path: 'liquidaciones',
        canActivate: [permisoGuard('liquidaciones', 'Rol a pagar')],
        loadChildren: () => import('./features/liquidaciones/liquidaciones.routes').then((r) => r.LIQUIDACIONES_ROUTES),
      },
      {
        path: 'exportaciones',
        canActivate: [permisoGuard('exportaciones', 'Exportaciones')],
        loadChildren: () => import('./features/exportaciones/exportaciones.routes').then((r) => r.EXPORTACIONES_ROUTES),
      },
      {
        path: 'configuracion',
        canActivate: [permisoGuard('configuracion', 'Configuración')],
        loadChildren: () => import('./features/configuracion/configuracion.routes').then((r) => r.CONFIGURACION_ROUTES),
      },
      ...pendientes,
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];
