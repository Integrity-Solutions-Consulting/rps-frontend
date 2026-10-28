import { Routes } from '@angular/router';

export const DASHBOARD_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./pages/inicio/inicio').then((c) => c.Inicio) },
];
