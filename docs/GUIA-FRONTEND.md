# Guía del frontend de RPS

Para cualquier persona del equipo que abra este proyecto por primera vez.
Explica cómo está organizado, de dónde sale cada dato y cómo agregar una pantalla nueva.

## 1. Arrancar

```powershell
npm install          # solo la primera vez
npm start            # todo con datos de ejemplo: no necesita backend
npm run start:api    # llama al backend real (rps-backend en http://localhost:5203)
```

Abrir http://localhost:4200. La etiqueta amarilla de la cabecera dice qué partes son datos de ejemplo.
Con `npm start` lo que se guarda se pierde al recargar la página.

## 2. Carpetas

```
src/app/
├── core/                    Lo que usa toda la aplicación (no es de ningún módulo)
│   ├── layout/              Menú lateral, cabecera y estructura de pantalla
│   ├── navigation/menu.ts   Ítems del menú; `disponible: true` cuando el módulo tiene pantalla
│   ├── services/            Sesión y avisos (toasts)
│   ├── interceptors/        Cliente HTTP: errores, token, desempaquetar ApiResponse, datos de ejemplo
│   ├── http/error-api.ts    Lee los errores del backend (ProblemDetails) para mostrarlos al usuario
│   └── mocks/               Datos de ejemplo, uno por módulo (ver sección 4)
├── features/                Un módulo por sección del menú
│   ├── dashboard/           Inicio
│   ├── colaboradores/       Lista y ficha del colaborador
│   │   ├── pages/lista/     Pantalla de la lista
│   │   ├── pages/ficha/     Pantalla de la ficha: carga datos, cabecera y pestañas
│   │   ├── components/      Una carpeta por pestaña de la ficha (tab-*)
│   │   ├── models/          Tipos que coinciden con los DTO del backend
│   │   └── services/        Llamadas HTTP del módulo
│   ├── contratos/           Contratos y adendas
│   ├── honorarios/          Modelos y servicio de honorarios por proyecto (los usa la ficha)
│   ├── integracion-tmr/     Lectura de la copia de TMR: nombres, identificación, asignaciones
│   └── proximamente/        Pantalla temporal de módulos sin construir
├── shared/                  Piezas reutilizables sin lógica de negocio
│   ├── components/          icon, estado-chip
│   └── utils/               periodo.ts (meses "yyyy-MM"), fechas.ts (fechas locales, días del mes)
└── styles/formularios.scss  Estilos compartidos: campos, avisos, pestañas, bloques
```

Regla general: **cada módulo tiene `models`, `services` y `pages`**. Si una pantalla crece mucho, sus partes van en `components` (como las pestañas de la ficha).

## 3. Cómo viaja un dato

```
Pantalla (pages/…)  →  servicio (services/…)  →  HttpClient  →  interceptores  →  backend o datos de ejemplo
```

- Las pantallas **nunca** llaman a `HttpClient` directamente: usan el servicio de su módulo.
- Cada método del servicio tiene un comentario con el endpoint exacto (`GET /api/...`).
- Los tipos de `models/` deben coincidir con lo que devuelve el backend. Si el backend cambia un campo, se cambia aquí.

### Ficha del colaborador: de dónde sale cada pestaña

| Pestaña | Componente | Datos |
|---|---|---|
| Cabecera | `pages/ficha/ficha.ts` | `/api/colaboradores/{id}` + `/api/integracion-tmr/colaboradores/{tmrId}` + `/api/contratos?tmrColaboradorId=` |
| Datos generales | `components/tab-datos-generales` | Copia de TMR (solo lectura) |
| Proyectos | `components/tab-proyectos` | Asignaciones de TMR; calcula días por proyecto en el mes elegido |
| Condiciones económicas | `components/tab-condiciones` | Tipo de servicio y frecuencia: `/api/colaboradores`. Honorarios por proyecto: `/api/honorarios` |
| Datos bancarios | `components/tab-bancarios` | `PUT /api/colaboradores/{id}/cuenta-bancaria` |
| Contratos | `components/tab-contratos` | `/api/contratos/{id}`; para registrar, lleva a la pantalla Contratos |
| Historial | `components/tab-historial` | `/api/colaboradores/{id}/historial` |

La página de la ficha carga los datos una vez y se los pasa a cada pestaña. Cuando una pestaña guarda algo, avisa con `(actualizado)` y la ficha vuelve a leer.

## 4. Datos de ejemplo

`core/interceptors/mock-api.interceptor.ts` decide qué responder. Qué rutas se simulan depende del entorno:

| Entorno | Archivo | Rutas simuladas |
|---|---|---|
| `npm start` | `environments/environment.mock.ts` | todas (`['*']`) |
| `npm run start:api` | `environments/environment.development.ts` | solo las que el backend aún no tiene |
| producción | `environments/environment.ts` | ninguna |

Cuando el backend publique un endpoint, **se quita su ruta de `mockRutas` en `environment.development.ts`** y listo: la pantalla no cambia.

Los datos de ejemplo siguen las mismas reglas y códigos de error que el backend (por ejemplo, `Colaborador.Desactivado`), para que la pantalla se comporte igual con datos reales.

## 5. Convenciones

- **Angular 21 standalone, con signals y sin zone.js.** Estado con `signal()` y `computed()`; entradas con `input()`; salidas con `output()`.
- **Plantillas con `@if`, `@for` y `@switch`.**
- **Textos para Contabilidad:** mensajes claros, sin términos técnicos. Los errores dicen qué pasó y qué hacer.
- **Reglas de negocio:** se citan con su código del documento de requisitos (RN 19, RC 05…) en comentarios y avisos.
- **Fechas:** usar `shared/utils/fechas.ts`. No usar `toISOString()` para fechas sin hora: da UTC y en Ecuador, después de las 19:00, cambia de día.
- **Dinero:** `currency: 'USD' : 'symbol' : '1.2-2'` con el idioma `es-EC` ($ 1.066,67).
- **Estilos:** cada componente tiene su `.scss`; lo que se repite va en `styles/formularios.scss`. Colores en variables `--rps-*` (`src/styles.scss`).

## 6. Agregar una pantalla nueva

1. Crear `features/<modulo>/` con `models/`, `services/`, `pages/` y `<modulo>.routes.ts`.
2. Registrar la ruta en `app.routes.ts` (copiar el bloque de `contratos`).
3. Poner `disponible: true` en `core/navigation/menu.ts`.
4. Si el backend no tiene el endpoint: crear `core/mocks/<modulo>.mock.ts`, enrutar en `mock-api.interceptor.ts` y agregar la ruta a `mockRutas` de `environment.development.ts`.
5. Anotar los endpoints en `docs/CONEXIONES.md` (carpeta `RPS/docs`).

## 7. Diferencias con los mockups

Donde un mockup y el documento de requisitos no coinciden, se siguió el documento:

| Mockup | Se hizo | Motivo |
|---|---|---|
| "El honorario es único por colaborador" | Un honorario por proyecto | RN 17: cada relación colaborador y proyecto tiene su honorario |
| "Días de proyectos simultáneos se cuentan una sola vez" | Días por proyecto | RN 25: los proyectos simultáneos generan cada uno su honorario |
| Tipo de servicio y frecuencia junto al honorario | Separados: una sola para el colaborador | RN 05 y RN 36 (decisión del 27 oct 2026) |
| Alertas con interruptores y envío por correo | Fechas de alerta, sin interruptores | El correo no está confirmado (sección 14); los plazos se configuran en Configuración |
| Archivos PDF de contrato y adendas | No incluido | Falta definir el almacenamiento de archivos (Propuesta de arquitectura, pendientes) |
