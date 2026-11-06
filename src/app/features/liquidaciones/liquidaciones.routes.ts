import { Routes } from '@angular/router';

export const LIQUIDACIONES_ROUTES: Routes = [
  { path: '', title: 'Liquidaciones · RPS', loadComponent: () => import('./pages/liquidaciones/liquidaciones').then((c) => c.Liquidaciones) },
];
