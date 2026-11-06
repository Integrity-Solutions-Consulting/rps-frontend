import { Routes } from '@angular/router';

export const CONFIGURACION_ROUTES: Routes = [
  { path: '', title: 'Configuración · RPS', loadComponent: () => import('./pages/configuracion/configuracion').then((c) => c.Configuracion) },
];
