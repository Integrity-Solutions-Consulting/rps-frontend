import { Clasificacion, Frecuencia } from '../../features/colaboradores/models/colaborador.models';
import { Modalidad } from '../../features/honorarios/models/honorario.models';
import { ProyectoLiquidado } from '../../features/liquidaciones/models/liquidacion.models';
import { TipoCorte } from '../../shared/models/corte';
import { diasCubiertosEnMes, diasDelMes } from '../../shared/utils/fechas';
import { nombrePeriodo } from '../../shared/utils/periodo';
import { colaboradoresMock } from './colaboradores.mock';
import { configuracionMock } from './configuracion.mock';
import { contratosMock } from './contratos.mock';
import { honorariosMock } from './honorarios.mock';
import { asignacionesDe, nombreTmr } from './tmr.mock';

/**
 * Motor de cálculo de ejemplo: lo que hará el backend en Features/Liquidaciones.
 * Está aquí solo para que las pantallas muestren números coherentes con las reglas.
 *
 *   Paso 1 · Días por proyecto (RN 22 a 25). Cada proyecto cuenta sus propios días:
 *            dos proyectos al mismo tiempo generan los dos honorarios.
 *   Paso 2 · Proporcional = honorario ÷ días del mes × días reconocidos.
 *   Paso 3 · Impuestos por proyecto según su modalidad (RN 28, sección 7).
 *   Paso 4 · Neto consolidado = suma de netos de los proyectos (RN 31).
 *   Paso 5 · Reparto en cortes según la frecuencia del colaborador (RN 36 a 39).
 * Los anticipos se restan después, en liquidaciones.mock.ts (RN 38).
 */

/** Redondeo a centavos. */
export const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export interface Porcentajes {
  ivaPct: number;
  retencionFuentePct: number;
  retencionIvaPct: number;
}

export interface ResultadoCalculo {
  periodo: string;
  colaboradorId: string;
  tmrColaboradorId: string;
  colaborador: string;
  clasificacion: Clasificacion;
  frecuencia: Frecuencia;
  proyectos: ProyectoLiquidado[];
  proyectosSinHonorario: string[];
  netoConsolidado: number;
  /** Neto del mes completo, sin proporcional: base del límite de anticipos (RN 21). */
  netoReferencia: number;
  /** El neto de referencia, proyecto por proyecto. */
  referenciaPorProyecto: { proyecto: string; neto: number }[];
  /** Lo que paga cada corte antes de anticipos. */
  bases: Record<TipoCorte, number>;
  notasCortes: string[];
  parametros: Porcentajes;
}

/** Sin resultado: el colaborador tiene proyectos en el mes pero falta algo para calcular. */
export interface SinCalculo {
  colaboradorId: string;
  colaborador: string;
  motivo: string;
}

/** Impuestos de un proyecto a partir del importe acordado del mes (o su proporcional). */
export function impuestosProyecto(importe: number, modalidad: Modalidad, p: Porcentajes) {
  const iva = p.ivaPct / 100;
  const rf = p.retencionFuentePct / 100;
  const riva = p.retencionIvaPct / 100;
  // Modalidad neto: el importe es lo que debe quedar; se busca el subtotal hacia atrás.
  // Factor = 1 + IVA − ret. fuente − ret. IVA (0,90 profesional · 0,945 junior).
  const factor = 1 + iva - rf - iva * riva;
  const subtotal = modalidad === 'Neto' ? r2(importe / factor) : r2(importe);
  const montoIva = r2(subtotal * iva);
  const totalDocumento = r2(subtotal + montoIva);
  const retencionFuente = r2(subtotal * rf);
  const retencionIva = r2(montoIva * riva);
  const totalRetenciones = r2(retencionFuente + retencionIva);
  const netoCalculado = r2(totalDocumento - totalRetenciones);
  // En modalidad neto el resultado debe ser el acordado; si el redondeo deja un centavo de diferencia,
  // se muestra como ajuste (la secuencia de redondeo la confirmará Contabilidad, sección 7).
  const neto = modalidad === 'Neto' ? r2(importe) : netoCalculado;
  return {
    subtotal, iva: montoIva, totalDocumento, retencionFuente, retencionIva, totalRetenciones, neto,
    ajusteRedondeo: r2(neto - netoCalculado),
  };
}

export function porcentajesEn(periodo: string, clasificacion: Clasificacion): Porcentajes {
  return {
    ivaPct: configuracionMock.pctEn('IvaPct', periodo),
    retencionFuentePct: configuracionMock.pctEn('RetencionFuentePct', periodo),
    retencionIvaPct: configuracionMock.pctEn(
      clasificacion === 'Profesional' ? 'RetencionIvaProfesionalPct' : 'RetencionIvaJuniorPct', periodo),
  };
}

const dinero = (v: number) => v.toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
const dia = (fecha: string) => Number(fecha.slice(8, 10));

/**
 * Calcula un colaborador en un mes "yyyy-MM".
 * Devuelve null si no tiene proyectos con días en ese mes (no aparece en la liquidación).
 */
export function calcularColaborador(colaboradorId: string, periodo: string): ResultadoCalculo | SinCalculo | null {
  const datos = colaboradoresMock.paraCalculo(colaboradorId);
  if (!datos) return null;
  const nombre = nombreTmr(datos.tmrColaboradorId);
  const primero = `${periodo}-01`;
  const ultimo = `${periodo}-${String(diasDelMes(periodo)).padStart(2, '0')}`;
  const mes = nombrePeriodo(periodo).toLowerCase();

  // Paso 1: proyectos con días reconocidos en el mes.
  const conDias = asignacionesDe(datos.tmrColaboradorId)
    .map((a) => ({ a, dias: diasCubiertosEnMes(periodo, a.fechaAsignacion, a.fechaFinAsignacion) }))
    .filter((x) => x.dias > 0);
  if (conDias.length === 0) return null;

  if (!datos.clasificacion)
    return { colaboradorId, colaborador: nombre, motivo: 'Falta el tipo de servicio (define el porcentaje de retención de IVA).' };
  const frecuencia = datos.frecuenciaEn(periodo);
  if (!frecuencia)
    return { colaboradorId, colaborador: nombre, motivo: `Falta la frecuencia de pago que rige en ${mes}.` };

  const p = porcentajesEn(periodo, datos.clasificacion);
  const proyectos: ProyectoLiquidado[] = [];
  const sinHonorario: string[] = [];
  const notas: string[] = [];
  let netoReferencia = 0;
  const referencia: { proyecto: string; neto: number }[] = [];
  let baseQuincena = 0;

  for (const { a, dias } of conDias) {
    const honorario = honorariosMock.vigenteEn(datos.tmrColaboradorId, a.tmrProyectoId, periodo);
    if (!honorario) { sinHonorario.push(a.proyecto); continue; }

    // Paso 2 y 3: proporcional del proyecto y sus impuestos.
    const total = diasDelMes(periodo);
    const proporcional = r2((honorario.importe / total) * dias);
    const imp = impuestosProyecto(proporcional, honorario.modalidad, p);
    const mesCompleto = impuestosProyecto(honorario.importe, honorario.modalidad, p);
    netoReferencia += mesCompleto.neto;
    referencia.push({ proyecto: a.proyecto, neto: mesCompleto.neto });

    const desde = a.fechaAsignacion && a.fechaAsignacion > primero ? a.fechaAsignacion : primero;
    const hasta = a.fechaFinAsignacion && a.fechaFinAsignacion < ultimo ? a.fechaFinAsignacion : ultimo;
    const contrato = contratosMock.contratoDe(datos.tmrColaboradorId, a.tmrProyectoId);

    proyectos.push({
      tmrProyectoId: a.tmrProyectoId, proyecto: a.proyecto, cliente: a.cliente,
      honorario: honorario.importe, modalidad: honorario.modalidad,
      desde, hasta, diasReconocidos: dias, diasDelMes: total, proporcional, ...imp,
      contrato: contrato ? { estado: contrato.estado, fechaFinVigente: contrato.fechaFinVigente } : null,
    });

    // Paso 5 (parte del proyecto en la quincena), solo si cobra en dos pagos.
    if (frecuencia === 'DosPagos') {
      if (dia(desde) > 15) {
        notas.push(`${a.proyecto} empieza el ${dia(desde)}: su proporcional va completo a fin de mes, sin quincena retroactiva (RN 26).`);
      } else {
        const mitad = mesCompleto.neto / 2;
        baseQuincena += Math.min(mitad, imp.neto);
        if (imp.neto < mitad)
          notas.push(`${a.proyecto} sale el ${dia(hasta)}: la quincena solo paga lo que alcanzan los días trabajados (${dinero(imp.neto)}).`);
        else if (hasta < ultimo)
          notas.push(`${a.proyecto} sale el ${dia(hasta)}: fin de mes completa solo los días trabajados, no la segunda mitad entera (RN 27). La fórmula exacta está pendiente de confirmar (PA 02).`);
      }
    }
  }

  if (proyectos.length === 0)
    return { colaboradorId, colaborador: nombre, motivo: `Ningún proyecto tiene honorario para ${mes}: ${sinHonorario.join(', ')}.` };

  // Paso 4: neto consolidado.
  const netoConsolidado = r2(proyectos.reduce((s, x) => s + x.neto, 0));

  // Paso 5: el centavo indivisible va a la quincena (RN 39): $900,01 → $450,01 y $450,00.
  const quincena = frecuencia === 'DosPagos' ? Math.min(Math.ceil(r2(baseQuincena * 100) - 1e-9) / 100, netoConsolidado) : 0;
  const finDeMes = r2(netoConsolidado - quincena);
  if (frecuencia === 'FinDeMes') notas.unshift('Frecuencia "solo fin de mes": el 100 % del neto va a fin de mes.');
  else if (notas.length === 0) notas.unshift('Mes completo: 50 % en la quincena y 50 % a fin de mes. Si sobra un centavo, va a la quincena (RN 39).');

  return {
    periodo, colaboradorId, tmrColaboradorId: datos.tmrColaboradorId, colaborador: nombre,
    clasificacion: datos.clasificacion, frecuencia, proyectos, proyectosSinHonorario: sinHonorario,
    netoConsolidado, netoReferencia: r2(netoReferencia), referenciaPorProyecto: referencia,
    bases: { Quincena: r2(quincena), FinDeMes: finDeMes },
    notasCortes: notas, parametros: p,
  };
}

export function esResultado(x: ResultadoCalculo | SinCalculo | null): x is ResultadoCalculo {
  return x !== null && 'proyectos' in x;
}
