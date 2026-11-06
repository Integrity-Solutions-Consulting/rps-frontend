import { Routes } from '@angular/router';

export const DOCUMENTOS_ROUTES: Routes = [
  { path: '', title: 'Documentos tributarios · RPS', loadComponent: () => import('./pages/documentos/documentos').then((c) => c.Documentos) },
];
