import { Notificacion } from '../../features/notificaciones/models/notificacion.models';
import { esPeriodoValido, nombrePeriodo, periodoActual } from '../../shared/utils/periodo';
import { RespuestaMock, colaboradoresMock } from './colaboradores.mock';
import { calcularColaborador, esResultado } from './calculo.mock';
import { contratosMock } from './contratos.mock';
import { documentosMock } from './documentos.mock';
import { honorariosMock } from './honorarios.mock';
import { liquidacionesMock } from './liquidaciones.mock';
import { asignacionesDe, nombreTmr } from './tmr.mock';
import { hoy } from './fechas';

/**
 * GET /api/notificaciones?periodo= (propuesto). Junta lo que necesita atención, leyendo los
 * demás mocks, igual que lo haría el backend consultando sus tablas:
 *   - Configuración incompleta: sin tipo de servicio, frecuencia o cuenta; proyecto sin honorario (RN 06).
 *   - Contratos vencidos o por vencer (RN 13 a 15).
 *   - Liquidaciones que requieren recálculo (RN 50) y documentos faltantes (RN 35).
 * Cada notificación lleva la pantalla donde se resuelve.
 */
export function notificaciones(periodo: string | null): RespuestaMock {
  const mes = periodo && esPeriodoValido(periodo) ? periodo : periodoActual();
  const lista: Notificacion[] = [];
  const ahora = new Date().toISOString();
  const agregar = (n: Omit<Notificacion, 'fecha'> & { fecha?: string }) => lista.push({ fecha: ahora, ...n });

  for (const id of colaboradoresMock.ids()) {
    const datos = colaboradoresMock.paraCalculo(id);
    if (!datos?.activo) continue;
    const nombre = nombreTmr(datos.tmrColaboradorId);
    const ficha = `/colaboradores/${id}`;

    // Configuración incompleta del colaborador.
    const faltan: string[] = [];
    if (!datos.clasificacion) faltan.push('tipo de servicio');
    if (!datos.frecuenciaEn(mes)) faltan.push('frecuencia de pago');
    if (!datos.cuenta) faltan.push('cuenta bancaria');
    if (faltan.length) {
      agregar({
        id: `config-${id}`, tipo: 'Configuracion', severidad: faltan.includes('cuenta bancaria') || faltan.includes('tipo de servicio') ? 'Critica' : 'Advertencia',
        colaboradorId: id, colaborador: nombre,
        titulo: 'Configuración incompleta',
        mensaje: `Falta ${faltan.join(', ')}. Sin eso no se puede calcular o exportar su pago.`,
        ruta: ficha, query: { tab: faltan.includes('cuenta bancaria') && faltan.length === 1 ? 'bancarios' : 'condiciones' },
      });
    }

    // Proyectos activos sin honorario.
    for (const a of asignacionesDe(datos.tmrColaboradorId).filter((x) => !x.fechaFinAsignacion || x.fechaFinAsignacion >= hoy())) {
      if (!honorariosMock.vigenteEn(datos.tmrColaboradorId, a.tmrProyectoId, mes)) {
        agregar({
          id: `honorario-${id}-${a.tmrProyectoId}`, tipo: 'Configuracion', severidad: 'Advertencia',
          colaboradorId: id, colaborador: nombre,
          titulo: 'Proyecto sin honorario',
          mensaje: `${a.proyecto} está asignado en TMR pero no tiene honorario para ${nombrePeriodo(mes).toLowerCase()}.`,
          ruta: ficha, query: { tab: 'condiciones' },
        });
      }
      // Contrato del proyecto.
      const c = contratosMock.contratoDe(datos.tmrColaboradorId, a.tmrProyectoId);
      if (!c) {
        agregar({
          id: `sin-contrato-${id}-${a.tmrProyectoId}`, tipo: 'Contrato', severidad: 'Advertencia',
          colaboradorId: id, colaborador: nombre, titulo: 'Proyecto sin contrato',
          mensaje: `${a.proyecto} no tiene contrato registrado.`, ruta: '/contratos', query: { colaborador: datos.tmrColaboradorId },
        });
      } else if (c.estado !== 'Vigente') {
        const vencido = c.estado === 'Vencido';
        agregar({
          id: `contrato-${c.id}`, tipo: 'Contrato', severidad: vencido ? 'Critica' : 'Advertencia',
          colaboradorId: id, colaborador: nombre,
          titulo: vencido ? 'Contrato vencido con asignación activa' : 'Contrato por vencer',
          mensaje: vencido
            ? `${c.proyecto}: venció el ${c.fechaFinVigente}. No bloquea el cálculo; revisar si corresponde una adenda (RN 15).`
            : `${c.proyecto}: vence el ${c.fechaFinVigente} (en ${c.diasParaVencer} días).`,
          ruta: '/contratos', query: { contrato: c.id },
        });
      }
    }

    // Si no se puede calcular por otro motivo, también se avisa.
    const calculo = calcularColaborador(id, mes);
    if (calculo && !esResultado(calculo) && !faltan.length) {
      agregar({
        id: `calculo-${id}`, tipo: 'Liquidacion', severidad: 'Critica', colaboradorId: id, colaborador: nombre,
        titulo: 'No se puede calcular', mensaje: calculo.motivo, ruta: ficha, query: { tab: 'condiciones' },
      });
    }
  }

  // Liquidaciones del mes: recálculo pendiente y documento tributario faltante.
  for (const l of liquidacionesMock.delPeriodo(mes)) {
    const nombre = l.resultado.colaborador;
    if (liquidacionesMock.requiereRecalculo(l)) {
      agregar({
        id: `recalculo-${l.id}`, tipo: 'Liquidacion', severidad: 'Critica', colaboradorId: l.colaboradorId, colaborador: nombre,
        titulo: 'Liquidación por recalcular',
        mensaje: `Algo cambió después del cálculo de ${nombrePeriodo(mes).toLowerCase()}.`,
        ruta: '/liquidaciones', query: { periodo: mes, liquidacion: l.id },
      });
    }
    if (!documentosMock.tieneDocumento(l.colaboradorId, mes)) {
      agregar({
        id: `documento-${l.id}`, tipo: 'Documento', severidad: 'Info', colaboradorId: l.colaboradorId, colaborador: nombre,
        titulo: 'Documento tributario pendiente',
        mensaje: `Falta el documento de ${nombrePeriodo(mes).toLowerCase()}. No impide exportar (RN 35).`,
        ruta: '/documentos', query: { periodo: mes, colaborador: l.colaboradorId },
      });
    }
  }

  // Cambio detectado en TMR (ejemplo fijo, como el de Inicio).
  const ana = colaboradoresMock.porTmrId('1');
  if (ana) {
    agregar({
      id: 'tmr-ana-201', tipo: 'Tmr', severidad: 'Advertencia', colaboradorId: ana.id, colaborador: nombreTmr('1'),
      titulo: 'Cambio en TMR', mensaje: 'Marketing Digital: cambió la fecha de salida de la asignación. Revisa la liquidación del mes.',
      ruta: '/liquidaciones', query: { periodo: mes },
    });
  }

  return { status: 200, body: lista };
}
