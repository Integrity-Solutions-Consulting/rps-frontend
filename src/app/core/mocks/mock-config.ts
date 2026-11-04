import { environment } from '../../../environments/environment';

/** true si la ruta de la API (sin /api) se responde con datos de ejemplo. */
export function rutaConMock(ruta: string): boolean {
  const rutas = environment.mockRutas;
  return rutas.includes('*') || rutas.some((r) => ruta === r || ruta.startsWith(`${r}/`));
}
