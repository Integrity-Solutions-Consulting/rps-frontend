import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { MODULOS_PERMISO, ModuloPermiso, Permisos } from '../../models/accesos.models';
import { Icon } from '../../../../shared/components/icon/icon';

/** Ventana para activar o bloquear los módulos de un rol. Guardar lo decide quien la abre (backend). */
@Component({
  selector: 'app-dialogo-permisos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { '(document:keydown.escape)': 'cancelar.emit()' },
  templateUrl: './dialogo-permisos.html',
  styleUrl: './dialogo-permisos.scss',
})
export class DialogoPermisos {
  readonly titulo = input.required<string>();
  readonly permisosIniciales = input.required<Permisos>();
  readonly guardando = input(false);
  readonly error = input<string | null>(null);
  readonly cancelar = output<void>();
  readonly guardar = output<Permisos>();

  protected readonly modulos = MODULOS_PERMISO;
  protected readonly borrador = signal<Permisos | null>(null);

  protected readonly permisos = computed(() => this.borrador() ?? this.permisosIniciales());
  protected readonly todos = computed(() => this.modulos.every((m) => this.permisos()[m.clave]));
  protected readonly hayCambios = computed(() => this.modulos.some((m) => this.permisos()[m.clave] !== this.permisosIniciales()[m.clave]));

  protected cambiar(clave: ModuloPermiso): void {
    const p = this.permisos();
    this.borrador.set({ ...p, [clave]: !p[clave] });
  }

  protected cambiarTodos(): void {
    const valor = !this.todos();
    this.borrador.set(Object.fromEntries(this.modulos.map((m) => [m.clave, valor])) as Permisos);
  }
}
