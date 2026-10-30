# rps-frontend

Frontend de **RPS**, el sistema de Contabilidad para preparar los honorarios mensuales de colaboradores
por servicios profesionales: contratos, honorarios por proyecto, anticipos, liquidaciones, documentos
tributarios y el archivo de pago. RPS **no paga**: prepara y deja constancia.

Angular 21 (standalone, signals, sin zone.js), SCSS propio, idioma `es-EC`.

## Arrancar

Necesitas Node 20 o superior.

```bash
npm install
npm start           # todo con datos de ejemplo, no necesita backend
npm run start:api   # usa rps-backend en http://localhost:5203 (proxy /api)
```

Abre `http://localhost:4200`. Con `start:api`, Inicio y los nombres de las personas siguen siendo de ejemplo
(se ve una etiqueta amarilla) hasta que el backend tenga la integración con TMR.

Comprobar que compila sin abrir el navegador:

```bash
node node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p tsconfig.app.json --noEmit
```

## Probar con el backend en local

1. En `rps-backend`: `docker compose up -d`, `dotnet ef database update -- --environment Development`
   y `dotnet run --launch-profile http` (perfil **http**, no https).
2. Con la base vacía, cargar datos de prueba: `powershell -ExecutionPolicy Bypass -File ..\docs\semilla-local.ps1`.
3. Aquí: `npm run start:api`.
4. Liquidaciones → Calcular: Ana Pérez debe dar **$960,00** de neto (ejemplo de los requisitos).

## Pantallas

| Pantalla | Con `start:api` |
|---|---|
| Inicio | Ejemplo |
| Campana de notificaciones (cabecera) | Backend |
| Colaboradores (lista y ficha con 6 pestañas) | Backend (nombres de ejemplo) |
| Contratos y adendas | Backend |
| Anticipos | Backend |
| Liquidaciones | Backend |
| Documentos tributarios | Backend |
| Exportaciones (archivo de pago por corte) | Backend |
| Configuración | Backend (solo lo que el backend guarda hoy) |

## Dónde está cada cosa

```
src/app/
  core/        backend/ (adaptadores a rps-backend), mocks/ (datos de ejemplo), interceptors/, http/, layout/
  features/    un módulo por pantalla: models/, services/, pages/, components/
  shared/      componentes, pipes (dinero), directivas (appSoloNumeros), utilidades de fechas y períodos
```

Cada servicio decide si responde con datos de ejemplo o con el backend real
(`environment.*.ts → mockRutas`) y convierte la respuesta del backend al modelo de la pantalla.

## Documentación

- `CLAUDE.md`: contexto del proyecto, reglas de negocio que más se olvidan y lo que falta.
- `docs/GUIA-FRONTEND.md`: carpetas, cómo viaja un dato, convenciones, diferencias con los mockups.
- `docs/UX-FRONTEND.md`: reglas de experiencia de usuario.
- `../docs/CONEXIONES.md`: qué ruta del backend usa cada pantalla, lo agregado al backend y las diferencias pendientes.

## Acuerdos

- No subir `.env` ni claves.
- Textos de pantalla en español, sin jerga técnica.
- Campos de valor con `appSoloNumeros`, nunca `type="number"`.
