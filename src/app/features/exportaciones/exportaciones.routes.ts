import { Routes } from '@angular/router';

export const EXPORTACIONES_ROUTES: Routes = [
  { path: '', title: 'Exportaciones · RPS', loadComponent: () => import('./pages/exportaciones/exportaciones').then((c) => c.Exportaciones) },
];
