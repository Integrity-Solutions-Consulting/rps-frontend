# Guía del frontend de RPS

Para cualquier persona del equipo que abra este proyecto por primera vez.
Explica cómo está organizado, de dónde sale cada dato y cómo agregar una pantalla nueva.

> **Regla principal:** el frontend no tiene lógica de negocio, solo interfaz.
> Validaciones, cálculos, límites, estados (vencido, revisado, pendiente, saldo…) los decide `rps-backend`.
> El frontend muestra lo que el backend devuelve, envía lo que la persona escribe y muestra los errores del backend
> junto a cada campo. Si una función no está en el backend, no se muestra en pantalla.

## 1. Arrancar

```powershell
npm install          # solo la primera vez
npm start            # proxy /api → rps-backend en http://localhost:5203
```

Abrir http://localhost:4200 e iniciar sesión con el usuario de desarrollo del backend (`../docs/CONEXIONES.md`, sección Login).
No hay datos de ejemplo: el backend tiene que estar corriendo.

## 2. Carpetas

```
src/app/
├── core/                    Lo que usa toda la aplicación (no es de ningún módulo)
│   ├── layout/              Menú lateral, cabecera y estructura de pantalla
│   ├── navigation/menu.ts   Ítems del menú
│   ├── services/            Sesión (login, token, renovar, cerrar sesión) y avisos (toasts)
│   ├── auth/auth.guard.ts   Pide sesión en todas las pantallas; sin ella lleva a /login
│   ├── interceptors/        errorInterceptor y authTokenInterceptor
│   ├── http/error-api.ts    Lee los errores del backend (ProblemDetails: codigo, errors{campo}) para mostrarlos
│   └── backend/             Respuestas crudas del backend (Be*) y utilidades comunes
├── features/                Un módulo por sección del menú
│   ├── auth/                Login (/login)
│   ├── dashboard/           Inicio
│   ├── notificaciones/      Campana y bandeja: cambios detectados en TMR (RN 50)
│   ├── colaboradores/       Lista y ficha (pages/ficha + components/tab-*)
│   ├── contratos/           Contratos y adendas
│   ├── anticipos/           Anticipos adicionales y plan de cuotas
│   ├── liquidaciones/       Cálculo del mes y "Revisado para envío"
│   ├── documentos/          Documento tributario mensual por colaborador
│   ├── exportaciones/       Reportes en Excel y PDF y su historial (Exportaciones recientes)
│   ├── configuracion/       Configuración global (un solo registro)
│   ├── honorarios/          Servicio y modelos de condiciones económicas (los usa la ficha)
│   └── integracion-tmr/     Copia de TMR que guarda el backend: nombres, asignaciones, sincronizar
├── shared/                  Piezas reutilizables sin lógica de negocio
│   ├── components/          icon, estado-chip
│   ├── models/corte.ts      Quincena / Fin de mes (etiquetas)
│   ├── pipes/dinero.pipe.ts {{ 1066.67 | dinero }} → $ 1.066,67
│   └── utils/periodo.ts     Meses "yyyy-MM" para los selectores
└── (src/styles/)            formularios.scss y paginas.scss
```

Cada módulo tiene `models`, `services` y `pages`. Si una pantalla crece, sus partes van en `components`.

## 3. Cómo viaja un dato

```
Pantalla (pages/…)  →  servicio (services/…)  →  HttpClient  →  interceptores  →  rps-backend
```

- Las pantallas **nunca** llaman a `HttpClient`: usan el servicio de su módulo.
- Cada método del servicio tiene un comentario con el endpoint exacto (`GET /api/...`).
- Las respuestas crudas están tipadas en `core/backend/backend-rps.models.ts` (`Be*`). El servicio solo **renombra o junta**
  campos para la pantalla (por ejemplo, pone el nombre de TMR junto al colaborador). No calcula valores de negocio.
- Los errores llegan como ProblemDetails; `leerErrorApi` devuelve el mensaje y los errores por campo para mostrarlos.

### Ficha del colaborador

| Pestaña | Componente | Datos |
|---|---|---|
| Cabecera | `pages/ficha/ficha.ts` | `/api/colaboradores/{id}`, `/asignaciones`, `/contratos` |
| Datos generales | `components/tab-datos-generales` | Copia de TMR del backend (solo lectura) |
| Proyectos | `components/tab-proyectos` | `/api/colaboradores/{id}/asignaciones` y los contratos de cada proyecto. Los días los calcula el backend al generar honorarios |
| Condiciones económicas | `components/tab-condiciones` | Clasificación (`PUT /clasificacion`), frecuencias (`/frecuencias`: GET, POST, PUT, DELETE) y honorarios (`GET`/`POST /condiciones-economicas`, con proyecto y contrato) |
| Datos bancarios | `components/tab-bancarios` | `PUT /api/colaboradores/{id}/cuenta-bancaria` (banco y tipo son texto libre en el backend) |
| Contratos | `components/tab-contratos` | `.../contratos` y `.../adendas`; para registrar lleva a la pantalla Contratos |
| Historial | `components/tab-historial` | `/api/colaboradores/{id}/historial` |

La ficha carga los datos una vez y se los pasa a cada pestaña. Cuando una pestaña guarda algo, la ficha vuelve a leer.
Otras pantallas abren una pestaña con `?tab=`: `/colaboradores/<id>?tab=condiciones`.

### Las demás pantallas

| Pantalla | Datos | Llega con |
|---|---|---|
| Inicio | `GET /api/dashboard?periodo=yyyy-MM-01` (indicadores), `GET /api/dashboard/vencimientos`, `GET /api/integracion-tmr/estado` y `/cambios`, liquidaciones del mes | — |
| Campana | `GET /api/integracion-tmr/cambios?revisado=false` y `POST /cambios/{id}/revisar` | — |
| Contratos | contratos y adendas por colaborador + vencimientos | `?colaborador=<ID TMR>&contrato=<id>` |
| Anticipos | `.../anticipos/resumen?periodo=` (neto, límite, saldo, disponible, cortes permitidos), `POST .../anticipos`, `PUT .../{id}/plan`, `DELETE .../{id}` | `?colaborador=<id>` |
| Liquidaciones | `POST /api/honorarios/generar` + `POST /api/liquidaciones/generar`, `GET /api/liquidaciones`, `POST /{id}/revisar` | `?periodo=2026-10&liquidacion=<id>` |
| Documentos | `.../documentos-mensuales` (tipo, número ≤ 50, fecha de emisión) | `?periodo=&colaborador=` |
| Exportaciones | `POST /api/exportaciones/honorarios`, `/liquidaciones`, `/colaboradores` (Excel; `/pdf` para PDF), `GET /historial?periodo=&todos=&tipo=&pagina=`, `GET /ultimas?periodo=` | `?periodo=` |
| Configuración | `GET`/`PUT /api/configuracion` | — |

### El flujo del mes

1. **Colaboradores → Sincronizar con TMR**: el backend copia personas, proyectos y asignaciones.
2. **Ficha → Condiciones económicas**: clasificación, frecuencia y honorario por proyecto y contrato.
3. **Contratos**: contratos y adendas.
4. **Anticipos**: registrar el anticipo y luego su plan de cuotas (dos pasos del backend).
5. **Liquidaciones → Calcular período**: genera honorarios y liquidaciones (el backend no rehace las ya generadas).
6. **Documentos**: registrar el documento mensual.
7. **Liquidaciones → Marcar revisada para envío** (el backend no permite desmarcar).
8. **Exportaciones**: descargar los reportes. "Exportaciones recientes" muestra qué ya salió del mes, quién lo generó y si los datos cambiaron desde entonces (RPS no guarda los archivos).

### Inicio

| Sección | Qué muestra |
|---|---|
| Indicadores | Neto del período, liquidaciones revisadas / sin revisar, contratos por vencer (30/15/7 días), colaboradores pendientes de configurar, anticipos con saldo. Todo de `GET /api/dashboard` |
| Aviso de TMR | Sin sincronizar, desactualizada o con error, según `GET /api/integracion-tmr/estado` |
| Vencimientos de contratos | Lista que arma el backend (`GET /api/dashboard/vencimientos`): vencidos con asignación activa y por vencer |
| Requiere atención | Cambios de TMR sin revisar, colaboradores pendientes de configurar, contratos vencidos y liquidaciones sin revisar |
| Preparación del período | Una fila por liquidación del mes: neto, valor de cada corte y si está revisada |

## 4. Convenciones

- **Angular 21 standalone, con signals y sin zone.js.** `signal()`, `computed()`, `input()`, `output()`.
- **Plantillas con `@if`, `@for` y `@switch`.**
- **Textos para Contabilidad:** claros, sin términos técnicos. Los errores dicen qué pasó y qué hacer.
- **Validaciones:** no se duplican en el frontend. Se envía y se muestra el error del backend debajo del campo (`errors{campo}`).
- **Dinero:** pipe `dinero` (`es-EC`, $ 1.066,67). Campos de valor con `appSoloNumeros`, nunca `type="number"`.
- **Estilos:** cada componente tiene su `.scss`; lo que se repite va en `styles/formularios.scss`. Colores en variables `--rps-*`.

## 5. Agregar una pantalla nueva

1. Confirmar que el backend ya tiene los endpoints. Si no los tiene, primero se hacen en `rps-backend`.
2. Agregar los tipos crudos en `core/backend/backend-rps.models.ts`.
3. Crear `features/<modulo>/` con `models/`, `services/`, `pages/` y `<modulo>.routes.ts`.
4. Registrar la ruta en `app.routes.ts` y el ítem en `core/navigation/menu.ts`.
5. Anotar los endpoints en `../docs/CONEXIONES.md`.

## 6. Lo que falta en el backend (por eso no está en pantalla)

| Función | Regla | Qué falta |
|---|---|---|
| Recalcular una liquidación y guardar versiones | RN 50 | `liquidaciones/generar` no rehace las ya generadas; no hay versiones |
| Quitar "Revisado para envío" | RN 49 | Solo existe `POST /{id}/revisar`, que marca |
| Saldo de anticipos según RN 42 | RN 42 | El backend descuenta todas las cuotas planificadas, no solo las ya aplicadas |
| Configuración con vigencias | RN 29 | `PUT /api/configuracion` reemplaza el único registro |
| Frecuencias que no se borren | RN 36, RN 48 | `DELETE /frecuencias/{id}` borra |
| Cancelar y restaurar un honorario programado | RN 19, RN 48 | Las condiciones económicas solo tienen GET y POST |
| Validar honorario "desde el mes siguiente" | RN 19, RN 20 | El backend no lo valida |
| Lista general de contratos | — | No hay `GET /api/contratos`; se lee colaborador por colaborador |
| Archivo de pago por corte con versiones | RN 52 a 57 | Solo hay CSV de honorarios, liquidaciones y colaboradores |
| Notificaciones propias de RPS | — | Solo existen los cambios de TMR (`/integracion-tmr/cambios`) |
| Adjuntar archivos (contratos, documentos) | — | Falta definir el almacenamiento |
