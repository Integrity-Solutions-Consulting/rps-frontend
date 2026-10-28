# rps-frontend

Frontend de RPS (gestión de honorarios para Contabilidad). Angular 21 standalone, signals, sin zone.js.
Por ahora solo está construido **Inicio**; los demás módulos del menú muestran "En construcción".

## Requisitos

- Node 22 y npm (los mismos que usas en TMR).

## Probarlo

```powershell
cd rps-frontend
npm install
npm start
```

Abre http://localhost:4200. `npm start` usa **datos de ejemplo** (la cabecera muestra "Datos de ejemplo"),
así que no necesita el backend.

Casos para probar en Inicio:

| Período | Qué pasa |
|---|---|
| Cualquier mes | Indicadores, cortes, vencimientos y alertas con datos de ejemplo |
| Enero 2026 | TMR "sin respuesta": aparece la advertencia RC 05 |
| Diciembre 2026 | El endpoint de alertas falla: solo esa sección muestra el error y "Reintentar" |

## Conectarlo al backend real

```powershell
# terminal 1: rps-backend
dotnet run --launch-profile http        # http://localhost:5203

# terminal 2: rps-frontend
npm run start:api
```

`proxy.conf.json` reenvía `/api/*` a `http://localhost:5203`, así no hace falta CORS en desarrollo.
Los endpoints que espera Inicio están en [`docs/API.md`](docs/API.md).

## Estructura

```
src/app/
├── app.config.ts            providers: router, HttpClient e interceptores, locale es-EC
├── app.routes.ts            rutas; los módulos sin pantalla van a "proximamente"
├── core/
│   ├── layout/              app-layout, sidebar, navbar          (Layout y navegación)
│   ├── services/            session (sesión y permisos), notification
│   ├── interceptors/        error, auth-token, api-response, mock-api   (Cliente HTTP e interceptores)
│   ├── http/                mensaje-error: traduce errores HTTP a texto para Contabilidad
│   ├── models/              ApiResponse<T> (misma envoltura que TMR)
│   ├── mocks/               datos de ejemplo de Inicio
│   └── navigation/menu.ts   ítems del menú; cambiar `disponible` al terminar un módulo
├── features/
│   ├── dashboard/           Inicio: models, services (llamadas al backend), pages/inicio
│   └── proximamente/        pantalla temporal
└── shared/                  icon, estado-chip, utils/periodo     (componentes reutilizables)
```

## Agregar el siguiente módulo

1. Crear `features/<modulo>/` con `models`, `services`, `pages` y `<modulo>.routes.ts`.
2. Registrar la ruta en `app.routes.ts` (igual que `inicio`).
3. Poner `disponible: true` en `core/navigation/menu.ts`.
4. Si el backend aún no tiene el endpoint, agregar su respuesta en `core/interceptors/mock-api.interceptor.ts`.
