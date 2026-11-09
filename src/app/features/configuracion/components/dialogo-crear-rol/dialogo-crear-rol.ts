import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MODULOS_PERMISO, ModuloPermiso, Permisos, RolSistemaDetalle, listaDesdePermisos, permisosDesdeLista } from '../../models/accesos.models';
import { RolesService } from '../../services/roles.service';
import { leerErrorApi } from '../../../../core/http/error-api';
import { Icon } from '../../../../shared/components/icon/icon';

/** Ventana "Agregar rol": nombre y permisos. El backend valida nombre único y permisos (POST /api/roles). */
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

  protected readonly modulos = MODULOS_PERMISO;
  protected readonly nombre = signal('');
  protected readonly permisos = signal<Permisos>(permisosDesdeLista([]));
  protected readonly errores = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly todos = computed(() => this.modulos.every((m) => this.permisos()[m.clave]));

  protected cambiarNombre(valor: string): void {
    this.nombre.set(valor);
    if (this.errores()['nombre']) this.errores.set({});
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
    this.error.set(null);
    if (!nombre) {
      this.errores.set({ nombre: 'Escribe el nombre del rol.' });
      return;
    }
    this.guardando.set(true);
    this.api.crear(nombre, listaDesdePermisos(this.permisos())).subscribe({
      next: (r) => { this.guardando.set(false); this.creado.emit(r); },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        if (err.campos['nombre']) this.errores.set({ nombre: err.campos['nombre'] });
        else this.error.set(err.mensaje);
      },
    });
  }
}
