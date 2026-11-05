# Llamadas al backend

Cómo responde `rps-backend` y qué endpoints se agregaron para el frontend.
La lista completa de pantallas y endpoints está en `GUIA-FRONTEND.md` (sección 3).

## Formato

- JSON en camelCase, enums como texto (`"Quincena"`, `"DosPagos"`).
- Respuesta directa (sin envoltura): un objeto o una lista.
- Fechas `DateOnly` como `"2026-11-30"`; `DateTime` en ISO 8601.
- Período mensual como el primer día del mes: `?periodo=2026-11-01`.
- Errores como ProblemDetails, con `codigo` (por ejemplo `Anticipo.LimiteExcedido`) y `errors{campo: [mensajes]}`.
  El frontend los lee con `core/http/error-api.ts` y los muestra junto al campo.
- Todo pide token (`Authorization: Bearer …`), menos `/api/auth/login` y `/refresh-token`.

## Endpoints agregados a la versión de la compañera

Son de solo lectura y no cambian la base de datos (no necesitan migración).

### `GET /api/dashboard/vencimientos?dias=30`

Contratos por vencer en los próximos `dias` (1 a 365, por defecto 30) y vencidos que siguen con la asignación activa (RN 14, RN 15).

```json
[{ "contratoId": "…", "colaboradorId": "…", "tmrColaboradorId": "1024", "nombres": "Ana", "apellidos": "Pérez",
   "proyectoId": "…", "proyectoNombre": "Marketing Digital", "fechaFinVigente": "2026-11-20",
   "diasRestantes": 15, "asignacionActiva": true }]
```

### `GET /api/colaboradores/{id}/historial`

Junta, del más reciente al más antiguo, lo que guardan los demás módulos (RN 48): vinculación, frecuencias, contratos,
adendas, honorarios, liquidaciones (calculada y revisada), anticipos y documentos.

```json
[{ "fecha": "2026-11-03T15:20:00Z", "tipo": "Liquidación", "descripcion": "…", "usuario": "Contabilidad",
   "periodo": "2026-11", "importe": 960.00, "estado": "Revisada",
   "enlace": { "texto": "Ver detalle", "ruta": "/liquidaciones", "query": { "periodo": "2026-11" } } }]
```

### `GET /api/colaboradores/{id}/anticipos/resumen?periodo=2026-11-01`

Los mismos valores con los que el backend valida un anticipo y su plan, para que la pantalla no los calcule.

```json
{ "colaboradorId": "…", "activo": true, "netoMensualCompleto": 960.00, "porcentajeMaximoAnticipo": 50,
  "limite": 480.00, "saldoPendiente": 200.00, "disponible": 280.00, "periodo": "2026-11-01",
  "cortesPermitidos": ["Quincena", "FinDeMes"] }
```

## Lo que falta

Ver `GUIA-FRONTEND.md`, sección 6.
