import { IconName } from '../../shared/components/icon/icon';

export interface ItemMenu {
  ruta: string;
  titulo: string;
  icono: IconName;
  descripcion: string;
  /** false mientras el módulo no tenga pantalla. */
  disponible: boolean;
  /** Permiso del rol que hace falta para ver el módulo (mismas claves que PermisosModulo del backend). Sin él: lo ven todos. */
  permiso?: string;
}

// Mismo orden que los mockups de RPS.
export const MENU: ItemMenu[] = [
  { ruta: 'inicio', titulo: 'Inicio', icono: 'home', disponible: true,
    descripcion: 'Totales del período, revisión pendiente, vencimientos y alertas.' },
  { ruta: 'colaboradores', titulo: 'Colaboradores', icono: 'users', disponible: true, permiso: 'colaboradores',
    descripcion: 'Personas de TMR configuradas en RPS: clasificación, frecuencia de pago y datos bancarios.' },
  { ruta: 'contratos', titulo: 'Contratos', icono: 'file', disponible: true, permiso: 'contratos',
    descripcion: 'Contratos por colaborador y proyecto, adendas y vencimientos.' },
  { ruta: 'anticipos', titulo: 'Anticipos', icono: 'card', disponible: true, permiso: 'anticipos',
    descripcion: 'Anticipos adicionales, límite disponible y plan de recuperación.' },
  { ruta: 'prestamos', titulo: 'Préstamos', icono: 'cash', disponible: true, permiso: 'prestamos',
    descripcion: 'Préstamos a colaboradores y su plan de pagos en quincenas y fines de mes.' },
  { ruta: 'liquidaciones', titulo: 'Rol a pagar', icono: 'calculator', disponible: true, permiso: 'liquidaciones',
    descripcion: 'Cálculo por período, detalle por proyecto y cortes, revisión.' },
  { ruta: 'exportaciones', titulo: 'Exportaciones', icono: 'upload', disponible: true, permiso: 'exportaciones',
    descripcion: 'Reportes en Excel y PDF de liquidaciones, honorarios y colaboradores.' },
  { ruta: 'configuracion', titulo: 'Configuración', icono: 'settings', disponible: true, permiso: 'configuracion',
    descripcion: 'Alertas, límite de anticipos, reglas de cálculo y vigencias.' },
];
