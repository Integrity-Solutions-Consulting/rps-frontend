import { Routes } from '@angular/router';

export const PRESTAMOS_ROUTES: Routes = [
  { path: '', title: 'Préstamos · RPS', loadComponent: () => import('./pages/prestamos/prestamos').then((c) => c.Prestamos) },
];
