import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MODULOS_PERMISO, ModuloPermiso, Permisos, RolSistemaDetalle, listaDesdePermisos, permisosDesdeLista } from '../../models/accesos.models';
import { RolesService } from '../../services/roles.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';

/** Largos máximos que valida el backend (RolesService: MaxNombre y MaxDescripcion). */
const MAX_NOMBRE = 50;
const MAX_DESCRIPCION = 200;

/**
 * Ventana "Agregar rol": nombre, descripción opcional y módulos.
 * El backend valida nombre único, largos y permisos (POST /api/roles).
 */
@Component({
  selector: 'app-dialogo-crear-rol',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon],
  host: { '(document:keydown.escape)': 'cancelar.emit()' },
  templateUrl: './dialogo-crear-rol.html',
  styleUrl: './dialogo-crear-rol.scss',
})
export class DialogoCrearRol {
  private readonly api = inject(RolesService);

  readonly cancelar = output<void>();
  readonly creado = output<RolSistemaDetalle>();

  private readonly campoNombre = viewChild<ElementRef<HTMLInputElement>>('campoNombre');

  protected readonly maxNombre = MAX_NOMBRE;
  protected readonly maxDescripcion = MAX_DESCRIPCION;
  protected readonly modulos = MODULOS_PERMISO;
  protected readonly nombre = signal('');
  protected readonly descripcion = signal('');
  protected readonly permisos = signal<Permisos>(permisosDesdeLista([]));
  protected readonly errores = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly todos = computed(() => this.modulos.every((m) => this.permisos()[m.clave]));
  protected readonly elegidos = computed(() => this.modulos.filter((m) => this.permisos()[m.clave]).length);

  constructor() {
    afterNextRender(() => this.campoNombre()?.nativeElement.focus());
  }

  protected cambiarNombre(valor: string): void {
    this.nombre.set(valor);
    this.limpiar('nombre');
  }

  protected cambiarDescripcion(valor: string): void {
    this.descripcion.set(valor);
    this.limpiar('descripcion');
  }

  protected cambiar(clave: ModuloPermiso): void {
    this.permisos.update((p) => ({ ...p, [clave]: !p[clave] }));
  }

  protected cambiarTodos(): void {
    const valor = !this.todos();
    this.permisos.set(Object.fromEntries(this.modulos.map((m) => [m.clave, valor])) as Permisos);
  }

  protected crear(): void {
    const nombre = this.nombre().trim();
    const descripcion = this.descripcion().trim();
    this.error.set(null);
    if (!nombre) {
      this.errores.set({ nombre: 'Escribe el nombre del rol.' });
      return;
    }
    this.guardando.set(true);
    this.api.crear(nombre, listaDesdePermisos(this.permisos()), descripcion || null).subscribe({
      next: (r) => { this.guardando.set(false); this.creado.emit(r); },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        this.errores.set(err.campos);
        // Si el error no es de un campo que se muestra aquí, va como aviso general.
        if (!['nombre', 'descripcion', 'permisos'].some((c) => err.campos[c])) this.error.set(err.mensaje);
      },
    });
  }

  private limpiar(campo: string): void {
    if (this.errores()[campo]) this.errores.update(({ [campo]: _, ...resto }) => resto);
  }
}
