import { Routes } from '@angular/router';

export const COLABORADORES_ROUTES: Routes = [
  { path: '', title: 'Colaboradores · RPS', loadComponent: () => import('./pages/lista/lista').then((c) => c.ColaboradoresLista) },
  { path: ':id', title: 'Ficha del colaborador · RPS', loadComponent: () => import('./pages/ficha/ficha').then((c) => c.ColaboradorFicha) },
];
