// `npm run start:api`: llama al backend real (rps-backend en http://localhost:5203)
// a través de proxy.conf.json, así no hace falta configurar CORS en desarrollo.
export const environment = {
  production: false,
  apiUrl: '/api',
  // Rutas que siguen con datos de ejemplo aunque el backend esté encendido:
  //   /dashboard        → Inicio espera otro formato que el GET /api/dashboard actual
  //   /integracion-tmr  → nombres e identificación de TMR (falta la integración con TMR)
  // Todo lo demás va a rps-backend; los servicios adaptan sus rutas (ver core/backend).
  mockRutas: ['/dashboard', '/integracion-tmr'] as string[],
};
