import { Routes } from '@angular/router';

export const CONTRATOS_ROUTES: Routes = [
  { path: '', title: 'Contratos y adendas · RPS', loadComponent: () => import('./pages/contratos/contratos').then((c) => c.Contratos) },
];
