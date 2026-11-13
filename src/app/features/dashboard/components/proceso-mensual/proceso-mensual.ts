import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { IndicadoresDashboard } from '../../models/dashboard.models';
import { UltimaExportacion } from '../../../exportaciones/models/exportacion.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip, TonoChip } from '../../../../shared/components/estado-chip/estado-chip';

export type EstadoEtapa = 'pendiente' | 'en-progreso' | 'completada';

interface Avance { hechos: number; total: number }

interface Etapa {
  clave: 'configurar' | 'calcular' | 'revisar' | 'exportar';
  titulo: string;
  detalle: string;
  nota: string | null;
  estado: EstadoEtapa;
  /** Barra de avance cuando la etapa se mide por cantidad. */
  avance: Avance | null;
  accion: { texto: string; ruta: string; query: Record<string, string> | null };
}

const ETIQUETA_ESTADO: Record<EstadoEtapa, string> = {
  'pendiente': 'Pendiente',
  'en-progreso': 'En progreso',
  'completada': 'Completada',
};

const TONO_ESTADO: Record<EstadoEtapa, TonoChip> = {
  'pendiente': 'neutral',
  'en-progreso': 'info',
  'completada': 'ok',
};

/**
 * Proceso del mes en Inicio: configurar → calcular → revisar → exportar.
 * No consulta nada por su cuenta: usa lo que Inicio ya cargó.
 *   - Configurar, Calcular y Revisar: GET /api/dashboard?periodo= (colaboradores y liquidaciones).
 *   - Exportar: GET /api/exportaciones/ultimas?periodo= (la misma llamada de la pantalla Exportaciones).
 * Solo describe el estado; no cambia ninguna regla. Exportar no es pagar (RN 56).
 */
@Component({
  selector: 'app-proceso-mensual',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Icon, EstadoChip],
  templateUrl: './proceso-mensual.html',
  styleUrl: './proceso-mensual.scss',
})
export class ProcesoMensual {
  readonly periodo = input.required<string>();
  readonly nombrePeriodo = input.required<string>();
  readonly indicadores = input<IndicadoresDashboard | null>(null);
  readonly estadoIndicadores = input.required<'cargando' | 'ok' | 'error'>();
  /** null: no se pudo consultar el historial de exportaciones. */
  readonly ultimas = input<UltimaExportacion[] | null>(null);
  readonly cargandoUltimas = input(false);
  readonly reintentar = output<void>();

  protected readonly etiquetaEstado = ETIQUETA_ESTADO;
  protected readonly tonoEstado = TONO_ESTADO;

  /** Última exportación del mes con resultados (honorarios o liquidaciones); la de colaboradores no es del mes. */
  protected readonly ultimaDelMes = computed<UltimaExportacion | null>(() => {
    const lista = (this.ultimas() ?? []).filter((u) => u.tipo === 'liquidaciones' || u.tipo === 'honorarios');
    return lista.reduce<UltimaExportacion | null>((max, u) => (!max || u.generadoEn > max.generadoEn ? u : max), null);
  });

  protected readonly etapas = computed<Etapa[] | null>(() => {
    const d = this.indicadores();
    if (!d) return null;
    const periodo = this.periodo();
    const mes = this.nombrePeriodo();

    // 1. Configurar (estado actual de RPS: no depende del mes elegido)
    const conf: Avance = { hechos: d.colaboradores.configurados, total: d.colaboradores.configurados + d.colaboradores.pendientes };
    const faltan = d.colaboradores.pendientes;
    const configurar: Etapa = {
      clave: 'configurar',
      titulo: 'Configurar colaboradores',
      detalle: conf.total === 0
        ? 'Todavía no hay colaboradores. Sincroniza con TMR para traerlos.'
        : `${conf.hechos} de ${conf.total} configurados`,
      nota: faltan > 0
        ? `${faltan} ${faltan === 1 ? 'no entra' : 'no entran'} al cálculo hasta completar su configuración.`
        : null,
      estado: conf.total > 0 && faltan === 0 ? 'completada' : conf.hechos > 0 ? 'en-progreso' : 'pendiente',
      avance: conf.total > 0 ? conf : null,
      accion: { texto: faltan > 0 ? 'Completar configuración' : 'Ver colaboradores', ruta: '/colaboradores', query: null },
    };

    // 2. Calcular
    const calculadas = d.liquidaciones.revisadas + d.liquidaciones.sinRevisar;
    const calcular: Etapa = {
      clave: 'calcular',
      titulo: 'Calcular liquidaciones',
      detalle: calculadas > 0
        ? `${calculadas} ${calculadas === 1 ? 'liquidación calculada' : 'liquidaciones calculadas'}`
        : `${mes} todavía no se calcula`,
      nota: null,
      estado: calculadas > 0 ? 'completada' : 'pendiente',
      avance: null,
      accion: { texto: calculadas > 0 ? 'Ver liquidaciones' : `Calcular ${mes}`, ruta: '/liquidaciones', query: { periodo } },
    };

    // 3. Revisar (RN 49)
    const revisadas = d.liquidaciones.revisadas;
    const revisar: Etapa = {
      clave: 'revisar',
      titulo: 'Revisar liquidaciones',
      detalle: calculadas === 0
        ? 'Se habilita cuando el mes esté calculado'
        : `${revisadas} de ${calculadas} revisadas para envío`,
      nota: null,
      estado: calculadas > 0 && revisadas === calculadas ? 'completada' : revisadas > 0 ? 'en-progreso' : 'pendiente',
      avance: calculadas > 0 ? { hechos: revisadas, total: calculadas } : null,
      accion: { texto: 'Revisar liquidaciones', ruta: '/liquidaciones', query: { periodo } },
    };

    // 4. Exportar (RN 56: exportar no es pagar)
    const ultima = this.ultimaDelMes();
    const sinHistorial = this.ultimas() === null && !this.cargandoUltimas();
    const exportar: Etapa = {
      clave: 'exportar',
      titulo: 'Exportar resultados',
      detalle: ultima
        ? 'Exportado'
        : sinHistorial ? 'No se pudo consultar el historial de exportaciones' : `Sin exportaciones de ${mes}`,
      nota: 'Exportar deja constancia; no registra pagos (RN 56).',
      estado: ultima ? 'completada' : 'pendiente',
      avance: null,
      accion: { texto: 'Ir a Exportaciones', ruta: '/exportaciones', query: { periodo } },
    };

    return [configurar, calcular, revisar, exportar];
  });

  /** La primera etapa sin completar es la que toca ahora: lleva la única acción principal. */
  protected readonly actual = computed(() => this.etapas()?.find((e) => e.estado !== 'completada')?.clave ?? null);

  protected readonly completadas = computed(() => this.etapas()?.filter((e) => e.estado === 'completada').length ?? 0);

  protected porcentaje(a: Avance): number {
    return a.total > 0 ? Math.round((a.hechos / a.total) * 100) : 0;
  }
}
