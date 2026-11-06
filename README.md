# rps-frontend

Frontend de **RPS**, el sistema de Contabilidad para preparar los honorarios mensuales de colaboradores
por servicios profesionales: contratos, honorarios por proyecto, anticipos, liquidaciones, documentos
tributarios y archivos CSV. RPS **no paga**: prepara y deja constancia.

Angular 21 (standalone, signals, sin zone.js), SCSS propio, idioma `es-EC`.

**Regla del proyecto:** el frontend no tiene lógica de negocio. Muestra lo que devuelve `rps-backend`
y envía lo que la persona escribe; las validaciones, cálculos y estados los decide el backend.
Si algo no está en el backend, no se muestra.

## Arrancar

Necesitas Node 20 o superior y `rps-backend` corriendo en `http://localhost:5203`.

```bash
npm install
npm start           # igual que npm run start:api: proxy /api → http://localhost:5203
```

Abre `http://localhost:4200` y entra con el usuario de desarrollo del backend.
No hay datos de ejemplo: si el backend no responde, las pantallas muestran el error.

Comprobar que compila sin abrir el navegador:

```bash
node node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p tsconfig.app.json --noEmit
```

## Probar con el backend en desarrollo

1. En `rps-backend`: `docker compose up -d`, `dotnet ef database update -- --environment Development`
   y `dotnet run --launch-profile http` (perfil **http**, no https).
2. Con la base vacía, cargar datos de prueba: `powershell -ExecutionPolicy Bypass -File ..\docs\semilla-desarrollo.ps1`
   (también crea el usuario de desarrollo; la contraseña está en el script, no aquí).
3. Aquí: `npm start` y entrar con ese usuario.

## Pantallas y endpoints

| Pantalla | Endpoints de rps-backend |
|---|---|
| Login | `/api/auth/login`, `/refresh-token`, `/logout` |
| Inicio | `GET /api/dashboard?periodo=`, `GET /api/dashboard/vencimientos`, `GET /api/integracion-tmr/estado`, `/cambios`, `GET /api/liquidaciones` |
| Campana (cabecera) | `GET /api/integracion-tmr/cambios?revisado=false`, `POST /cambios/{id}/revisar` |
| Colaboradores (lista y ficha) | `/api/colaboradores` (+ `/frecuencias`, `/clasificacion`, `/cuenta-bancaria`, `/asignaciones`, `/condiciones-economicas`, `/historial`), `POST /api/integracion-tmr/sincronizar` |
| Contratos y adendas | `/api/colaboradores/{id}/contratos` y `/adendas`, `GET /api/dashboard/vencimientos` |
| Anticipos | `/api/colaboradores/{id}/anticipos` (+ `/resumen`, `/{id}/plan`) |
| Liquidaciones | `POST /api/honorarios/generar`, `POST /api/liquidaciones/generar`, `GET /api/liquidaciones`, `POST /{id}/revisar` |
| Documentos tributarios | `/api/colaboradores/{id}/documentos-mensuales`, `GET /api/honorarios?periodo=` |
| Exportaciones | `GET /api/exportaciones/honorarios`, `/liquidaciones`, `/colaboradores` (CSV) |
| Configuración | `GET` y `PUT /api/configuracion` |

## Dónde está cada cosa

```
src/app/
  core/        backend/ (tipos crudos y adaptadores a rps-backend), interceptors/ (errores y token), http/, layout/
  features/    un módulo por pantalla: models/, services/, pages/, components/
  shared/      componentes, pipes (dinero), directivas (appSoloNumeros), utilidades de períodos
```

Cada servicio llama al backend y convierte su respuesta al modelo de la pantalla; no calcula nada de negocio.

## Documentación

- `docs/GUIA-FRONTEND.md`: carpetas, cómo viaja un dato, convenciones y lo que falta en el backend.
- `docs/API.md`: endpoints que usa el frontend y los que harían falta para lo pendiente.
- `../docs/CONEXIONES.md`: qué ruta del backend usa cada pantalla.

## Acuerdos

- No subir `.env`, `appsettings.Development.json` ni claves.
- Textos de pantalla en español, sin jerga técnica.
- Campos de valor con `appSoloNumeros`, nunca `type="number"`.
