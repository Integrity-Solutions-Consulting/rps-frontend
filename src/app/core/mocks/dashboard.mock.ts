import { AlertaDashboard, DashboardResumen } from '../../features/dashboard/models/dashboard.models';

// Datos ficticios, con los mismos nombres de los mockups. Las fechas se calculan desde hoy
// para que los vencimientos siempre tengan sentido.

function haceDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

function nombreMes(periodo: string): string {
  const [a, m] = periodo.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('es-EC', { month: 'long' });
}

export function mockResumen(periodo: string): DashboardResumen {
  return {
    periodo,
    netoConsolidado: 21480,
    colaboradoresActivos: 18,
    liquidaciones: { total: 18, revisadas: 13, pendientesRevision: 4, requierenRecalculo: 1 },
    pendientesConfiguracion: 2,
    documentosFaltantes: 3,
    avisosTmrPendientes: 1,
    cortes: [
      { corte: 'Quincena', base: 10740.01, descuentoAnticipos: 200, valorPreparado: 10540.01, colaboradores: 16,
        versionExportada: 1, fechaExportacion: haceDias(13) },
      { corte: 'FinDeMes', base: 10739.99, descuentoAnticipos: 300, valorPreparado: 10439.99, colaboradores: 18,
        versionExportada: null, fechaExportacion: null },
    ],
    origenTmr: { disponible: true, ultimaConsulta: haceDias(0) },
  };
}

export function mockAlertas(periodo: string): AlertaDashboard[] {
  const mes = nombreMes(periodo);
  return [
    { id: 'a1', tipo: 'CambioTmr', severidad: 'Critica', colaboradorId: 1, colaborador: 'Ana Pérez', proyecto: 'Marketing Digital',
      mensaje: `La salida cambió del 30 al 22 de ${mes} en TMR. La liquidación revisada requiere recálculo.`,
      fechaDeteccion: haceDias(0), ruta: '/liquidaciones' },
    { id: 'a2', tipo: 'Asignacion', severidad: 'Advertencia', colaboradorId: 4, colaborador: 'Diego Rivas', proyecto: 'Consultoría Tributaria',
      mensaje: 'Contrato vencido con asignación activa en TMR. Consultar con Proyectos si corresponde una adenda.',
      fechaDeteccion: haceDias(8), ruta: '/contratos' },
    { id: 'a3', tipo: 'Documentacion', severidad: 'Advertencia', colaboradorId: 11, colaborador: 'María Ruiz', proyecto: null,
      mensaje: `Sin documento tributario de ${mes}. No bloquea la exportación.`,
      fechaDeteccion: haceDias(1), ruta: '/documentos' },
    { id: 'a4', tipo: 'Documentacion', severidad: 'Advertencia', colaboradorId: 10, colaborador: 'Nicolás Paredes', proyecto: null,
      mensaje: `Sin documento tributario de ${mes}. No bloquea la exportación.`,
      fechaDeteccion: haceDias(1), ruta: '/documentos' },
    { id: 'a5', tipo: 'DatosIncompletos', severidad: 'Critica', colaboradorId: 10, colaborador: 'Nicolás Paredes', proyecto: null,
      mensaje: 'No tiene cuenta bancaria registrada. No podrá incluirse en el Excel de pago.',
      fechaDeteccion: haceDias(2), ruta: '/colaboradores' },
    { id: 'a6', tipo: 'DatosIncompletos', severidad: 'Advertencia', colaboradorId: 6, colaborador: 'Javier Flores', proyecto: 'App Móvil Clientes',
      mensaje: 'Proyecto asignado en TMR sin honorario configurado. Pendiente de configuración.',
      fechaDeteccion: haceDias(4), ruta: '/colaboradores' },
    { id: 'a7', tipo: 'Anticipo', severidad: 'Info', colaboradorId: 2, colaborador: 'Luis Gómez', proyecto: null,
      mensaje: 'Anticipo adicional de $ 300,00 con cuotas programadas para fin de mes.',
      fechaDeteccion: haceDias(5), ruta: '/anticipos' },
  ];
}
