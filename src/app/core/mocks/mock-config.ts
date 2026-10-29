import { environment } from '../../../environments/environment';

/** true si la ruta de la API (sin /api) se responde con datos de ejemplo. */
export function rutaConMock(ruta: string): boolean {
  const rutas = environment.mockRutas;
  return rutas.includes('*') || rutas.some((r) => ruta === r || ruta.startsWith(`${r}/`));
}

export const hayMocks = environment.mockRutas.length > 0;

/** Texto para la cabecera y el pie cuando hay datos de ejemplo. */
export const textoMocks = environment.mockRutas.includes('*')
  ? 'Datos de ejemplo'
  : `Datos de ejemplo en: ${environment.mockRutas.map((r) => r.replace('/', '')).join(', ')}`;
