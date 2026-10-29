// Producción: el frontend y el backend se publican bajo el mismo dominio.
export const environment = {
  production: true,
  apiUrl: '/api',
  /** Rutas de la API que responden con datos de ejemplo. Vacío: todo va al backend. */
  mockRutas: [] as string[],
};
