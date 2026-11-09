/** Nombre de un rol de RPS. Los tres iniciales los siembra el backend; el Administrador puede crear más. */
export type RolSistema = string;

export const ROL_ADMINISTRADOR = 'Administrador';
export const ROL_ADMINISTRADOR_CONTABLE = 'Administrador Contable';
export const ROL_ASISTENTE_CONTABLE = 'Asistente Contable';

/** Módulos de RPS que se pueden permitir por rol (mismas claves que PermisosModulo del backend). */
export type ModuloPermiso = 'colaboradores' | 'contratos' | 'anticipos' | 'liquidaciones' | 'documentos' | 'exportaciones';

export type Permisos = Record<ModuloPermiso, boolean>;

export const MODULOS_PERMISO: { clave: ModuloPermiso; etiqueta: string }[] = [
  { clave: 'colaboradores', etiqueta: 'Colaboradores' },
  { clave: 'contratos', etiqueta: 'Contratos' },
  { clave: 'anticipos', etiqueta: 'Anticipos' },
  { clave: 'liquidaciones', etiqueta: 'Liquidaciones' },
  { clave: 'documentos', etiqueta: 'Documentos' },
  { clave: 'exportaciones', etiqueta: 'Exportaciones' },
];

export function permisosDesdeLista(lista: string[]): Permisos {
  return Object.fromEntries(MODULOS_PERMISO.map((m) => [m.clave, lista.includes(m.clave)])) as Permisos;
}

export function listaDesdePermisos(p: Permisos): ModuloPermiso[] {
  return MODULOS_PERMISO.filter((m) => p[m.clave]).map((m) => m.clave);
}

/** RolResponse de rps-backend (GET /api/roles). */
export interface RolSistemaDetalle {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  permisos: string[];
  usuarios: number;
}

export interface UsuarioSistema {
  id: string;
  nombre: string;
  email: string;
  rol: RolSistema;
  activo: boolean;
  creadoEn: string;
}

/** Descripción de los roles iniciales cuando el backend no trae una. */
export const DESCRIPCION_ROL: Record<string, string> = {
  [ROL_ADMINISTRADOR]: 'Administra el sistema y crea las cuentas de Contabilidad',
  [ROL_ADMINISTRADOR_CONTABLE]: 'Gestiona honorarios, liquidaciones y a los asistentes',
  [ROL_ASISTENTE_CONTABLE]: 'Apoya en el registro y la revisión de honorarios',
};
