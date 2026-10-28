// `npm run start:api`: llama al backend real (rps-backend en http://localhost:5203)
// a través de proxy.conf.json, así no hace falta configurar CORS en desarrollo.
export const environment = {
  production: false,
  apiUrl: '/api',
  useMocks: false,
};
