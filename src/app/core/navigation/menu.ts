import { IconName } from '../../shared/components/icon/icon';

export interface ItemMenu {
  ruta: string;
  titulo: string;
  icono: IconName;
  descripcion: string;
  /** false mientras el módulo no tenga pantalla. */
  disponible: boolean;
}

// Mismo orden que los mockups de RPS.
export const MENU: ItemMenu[] = [
  { ruta: 'inicio', titulo: 'Inicio', icono: 'home', disponible: true,
    descripcion: 'Totales del período, revisión pendiente, vencimientos y alertas.' },
  { ruta: 'colaboradores', titulo: 'Colaboradores', icono: 'users', disponible: true,
    descripcion: 'Personas de TMR configuradas en RPS: clasificación, frecuencia de pago y datos bancarios.' },
  { ruta: 'contratos', titulo: 'Contratos', icono: 'file', disponible: true,
    descripcion: 'Contratos por colaborador y proyecto, adendas y vencimientos.' },
  { ruta: 'anticipos', titulo: 'Anticipos', icono: 'card', disponible: true,
    descripcion: 'Anticipos adicionales, límite disponible y plan de recuperación.' },
  { ruta: 'liquidaciones', titulo: 'Liquidaciones', icono: 'calculator', disponible: true,
    descripcion: 'Cálculo por período, detalle por proyecto y cortes, revisión.' },
  { ruta: 'documentos', titulo: 'Documentos', icono: 'folder', disponible: true,
    descripcion: 'Documento tributario mensual por colaborador.' },
  { ruta: 'exportaciones', titulo: 'Exportaciones', icono: 'upload', disponible: true,
    descripcion: 'Previsualización y generación del Excel de pago por corte.' },
  { ruta: 'configuracion', titulo: 'Configuración', icono: 'settings', disponible: true,
    descripcion: 'Alertas, límite de anticipos, reglas de cálculo y vigencias.' },
];
