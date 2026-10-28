import { Routes } from '@angular/router';
import { AppLayout } from './core/layout/app-layout/app-layout';
import { MENU } from './core/navigation/menu';

// Módulos que todavía no tienen pantalla: muestran su nombre y descripción.
const pendientes: Routes = MENU.filter((m) => !m.disponible).map((m) => ({
  path: m.ruta,
  title: `${m.titulo} · RPS`,
  data: { modulo: m.titulo, descripcion: m.descripcion, icono: m.icono },
  loadComponent: () => import('./features/proximamente/proximamente').then((c) => c.Proximamente),
}));

export const routes: Routes = [
  {
    path: '',
    component: AppLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio · RPS',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then((r) => r.DASHBOARD_ROUTES),
      },
      ...pendientes,
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];
