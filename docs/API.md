# Llamadas al backend

Todas las respuestas usan la envoltura de TMR, que el frontend desempaqueta en `api-response.interceptor.ts`:

```json
{ "success": true, "statusCode": 200, "message": "OK", "data": { } }
```

- JSON en camelCase (el valor por defecto de ASP.NET).
- Enums como texto (`"Quincena"`, no `0`): registrar `JsonStringEnumConverter` en `ConfigureHttpJsonOptions`.
- Fechas `DateOnly` como `"2026-11-30"` y `DateTime` en ISO 8601.
- Período mensual siempre como `yyyy-MM` (`2026-11`).
- Si TMR no responde, devolver **503** con `message` claro (RC 05). Nunca devolver ceros.

---

## 1. Inicio (lo que usa la pantalla actual)

Slice sugerido: `Features/Dashboard/{ObtenerResumen, ListarVencimientos, ListarAlertas}`,
grupo `app.MapGroup("/api/dashboard").RequireAuthorization()`.

### `GET /api/dashboard/resumen?periodo=2026-11`

```json
{
  "periodo": "2026-11",
  "netoConsolidado": 21480.00,
  "colaboradoresActivos": 18,
  "liquidaciones": { "total": 18, "revisadas": 13, "pendientesRevision": 4, "requierenRecalculo": 1 },
  "pendientesConfiguracion": 2,
  "documentosFaltantes": 3,
  "avisosTmrPendientes": 1,
  "cortes": [
    { "corte": "Quincena", "base": 10740.01, "descuentoAnticipos": 200.00, "valorPreparado": 10540.01,
      "colaboradores": 16, "versionExportada": 1, "fechaExportacion": "2026-11-15T16:20:00Z" },
    { "corte": "FinDeMes", "base": 10739.99, "descuentoAnticipos": 300.00, "valorPreparado": 10439.99,
      "colaboradores": 18, "versionExportada": null, "fechaExportacion": null }
  ],
  "origenTmr": { "disponible": true, "ultimaConsulta": "2026-11-28T09:40:00Z" }
}
```

Origen de cada dato: `netoConsolidado` y `cortes` salen de las liquidaciones vigentes del período (RN 31, RN 38);
`pendientesConfiguracion` de colaboradores con asignación en TMR sin contrato u honorario (RN 06);
`documentosFaltantes` de colaboradores con liquidación y sin `DocumentoMensual` (RN 35);
`avisosTmrPendientes` de `AvisoCambioTmr` sin revisar (RN 50).

### `GET /api/dashboard/vencimientos?periodo=2026-11`

Contratos cuyo `FechaFinVigente` cae dentro del mayor umbral de alerta configurado (30 días por defecto)
y contratos ya vencidos con asignación activa (RN 13, RN 15).

```json
[
  { "contratoId": 14, "colaboradorId": 4, "colaborador": "Diego Rivas", "proyecto": "Consultoría Tributaria",
    "fechaFinVigente": "2026-10-20", "diasRestantes": -8, "asignacionActiva": true }
]
```

### `GET /api/dashboard/alertas?periodo=2026-11`

```json
[
  { "id": "a1", "tipo": "CambioTmr", "severidad": "Critica", "colaboradorId": 1, "colaborador": "Ana Pérez",
    "proyecto": "Marketing Digital", "mensaje": "La salida cambió del 30 al 22 de noviembre en TMR…",
    "fechaDeteccion": "2026-11-28T08:00:00Z", "ruta": "/liquidaciones" }
]
```

`tipo`: `Asignacion | Documentacion | DatosIncompletos | CambioTmr | Anticipo` ·
`severidad`: `Info | Advertencia | Critica`.

### DTO sugeridos en C#

```csharp
public enum TipoCorte { Quincena, FinDeMes }
public enum TipoAlerta { Asignacion, Documentacion, DatosIncompletos, CambioTmr, Anticipo }
public enum Severidad { Info, Advertencia, Critica }

public record ResumenLiquidaciones(int Total, int Revisadas, int PendientesRevision, int RequierenRecalculo);
public record CorteResumen(TipoCorte Corte, decimal Base, decimal DescuentoAnticipos, decimal ValorPreparado,
    int Colaboradores, int? VersionExportada, DateTime? FechaExportacion);
public record OrigenTmr(bool Disponible, DateTime? UltimaConsulta);
public record DashboardResumenResponse(string Periodo, decimal NetoConsolidado, int ColaboradoresActivos,
    ResumenLiquidaciones Liquidaciones, int PendientesConfiguracion, int DocumentosFaltantes,
    int AvisosTmrPendientes, IReadOnlyList<CorteResumen> Cortes, OrigenTmr OrigenTmr);
public record VencimientoContratoResponse(int ContratoId, int ColaboradorId, string Colaborador, string Proyecto,
    DateOnly FechaFinVigente, int DiasRestantes, bool AsignacionActiva);
public record AlertaDashboardResponse(string Id, TipoAlerta Tipo, Severidad Severidad, int? ColaboradorId,
    string? Colaborador, string? Proyecto, string Mensaje, DateTime FechaDeteccion, string? Ruta);
```

---

## 2. Las llamadas más importantes del sistema (siguientes módulos)

En orden de prioridad: sin las primeras no se puede calcular nada.

| # | Método y ruta | Para qué | Reglas |
|---|---|---|---|
| 1 | `GET /api/colaboradores?buscar=&proyectoId=&situacion=` | Buscar personas de TMR con su estado en RPS | RN 03, RN 06 |
| 2 | `GET /api/colaboradores/{id}` | Ficha: datos de TMR (solo lectura) y de RPS, proyectos y asignaciones | RN 05 |
| 3 | `POST /api/colaboradores/{id}/configuracion` | Clasificación y frecuencia desde el mes siguiente | RN 05, RN 20 |
| 4 | `POST /api/contratos` · `POST /api/contratos/{id}/adendas` | Contrato por colaborador y proyecto; extensiones | RN 08–12 |
| 5 | `POST /api/honorarios` | Honorario y modalidad por proyecto desde el mes siguiente | RN 17–19 |
| 6 | **`POST /api/liquidaciones/periodos/{periodo}/calcular`** | **Calcula días, impuestos, consolidado y cortes. Es el núcleo de RPS** | RN 21–40 |
| 7 | `GET /api/liquidaciones?periodo=` · `GET /api/liquidaciones/{id}` | Lista y detalle por proyecto y corte | RN 28, RN 30 |
| 8 | `POST /api/liquidaciones/{id}/revisado` | Marcar o retirar "Revisado para envío" | RN 49 |
| 9 | `GET /api/anticipos/limite?colaboradorId=&periodo=` · `POST /api/anticipos` | Neto de referencia, límite y registro con cuotas | RN 41–47 |
| 10 | `POST /api/documentos` | Documento mensual con detalle por proyecto | RN 32–35 |
| 11 | `POST /api/exportaciones/previsualizar` · `POST /api/exportaciones` · `GET /api/exportaciones/{id}/archivo` | Previsualizar, generar el Excel versionado y descargarlo | RN 52–57 |
| 12 | `GET/POST /api/configuracion/parametros` | IVA, retenciones, umbrales de alerta y límite de anticipos con vigencias | RN 29, RN 43 |

Del lado de TMR hace falta un endpoint de solo lectura para RPS, con colaboradores, proyectos y asignaciones con fechas
(incluidas las finalizadas) y una credencial de servicio.
