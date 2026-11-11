import { Injectable, signal } from '@angular/core';
import { periodoActual } from '../../shared/utils/periodo';

/**
 * Mes ("yyyy-MM") que está viendo el usuario en la pantalla abierta.
 * Lo publican las pantallas que tienen selector de período (Inicio, Liquidaciones, Exportaciones, Anticipos)
 * y lo muestra el menú lateral. Solo es estado de la interfaz: no se envía al backend.
 */
@Injectable({ providedIn: 'root' })
export class PeriodoEnPantallaService {
  readonly periodo = signal(periodoActual());
}
