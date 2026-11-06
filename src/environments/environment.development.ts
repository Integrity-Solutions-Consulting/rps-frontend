// `npm start`: llama a rps-backend (http://localhost:5203) a través de proxy.conf.json,
// así no hace falta configurar CORS en desarrollo. No hay datos de ejemplo: todo viene del backend.
export const environment = {
  production: false,
  apiUrl: '/api',
};
