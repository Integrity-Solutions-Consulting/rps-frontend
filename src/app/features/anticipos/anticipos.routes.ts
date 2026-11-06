import { Routes } from '@angular/router';

export const ANTICIPOS_ROUTES: Routes = [
  { path: '', title: 'Anticipos adicionales · RPS', loadComponent: () => import('./pages/anticipos/anticipos').then((c) => c.Anticipos) },
];
