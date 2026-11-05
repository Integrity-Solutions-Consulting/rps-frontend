import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColaboradoresService } from '../../services/colaboradores.service';
import { ColaboradorDetalle, TIPOS_CUENTA } from '../../models/colaborador.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { SoloNumeros } from '../../../../shared/directives/solo-numeros.directive';

/**
 * Pestaña "Datos bancarios": PUT /api/colaboradores/{id}/cuenta-bancaria. El backend nunca devuelve el número
 * completo (se guarda cifrado), por eso para cambiarlo hay que escribir el número entero.
 * Las validaciones (número, largo de banco y tipo) las hace el backend.
 */
@Component({
  selector: 'app-tab-bancarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, Icon, SoloNumeros],
  templateUrl: './tab-bancarios.html',
  styleUrl: './tab-bancarios.scss',
})
export class TabBancarios {
  private readonly colaboradores = inject(ColaboradoresService);
  private readonly avisos = inject(NotificationService);

  readonly colaborador = input.required<ColaboradorDetalle>();
  /** Nombre de TMR; null si no se pudo leer. */
  readonly titular = input<string | null>(null);
  readonly actualizado = output<void>();

  protected readonly tiposCuenta = TIPOS_CUENTA;
  protected readonly bloqueado = computed(() => !this.colaborador().activo);

  protected readonly bancoForm = signal('');
  protected readonly tipoForm = signal('');
  protected readonly numeroForm = signal('');
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);

  protected readonly hayCambios = computed(() => {
    const actual = this.colaborador().cuentaBancaria;
    return !!this.numeroForm().trim() || this.bancoForm().trim() !== (actual?.banco ?? '') || this.tipoForm() !== (actual?.tipoCuenta ?? '');
  });

  constructor() {
    effect(() => {
      this.colaborador();
      untracked(() => this.cancelar());
    });
  }

  /** Vuelve el formulario a la cuenta guardada. */
  protected cancelar(): void {
    const c = this.colaborador().cuentaBancaria;
    this.bancoForm.set(c?.banco ?? '');
    this.tipoForm.set(c?.tipoCuenta ?? '');
    this.numeroForm.set('');
    this.errores.set({});
    this.error.set(null);
  }

  protected guardar(): void {
    const numero = this.numeroForm().trim();
    this.guardando.set(true);
    this.errores.set({});
    this.error.set(null);
    this.colaboradores.registrarCuentaBancaria(this.colaborador().id, {
      banco: this.bancoForm().trim() || null,
      tipoCuenta: this.tipoForm() || null,
      numeroCuenta: numero,
    }).subscribe({
      next: () => {
        this.guardando.set(false);
        this.avisos.ok('Datos bancarios guardados.');
        this.actualizado.emit();
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        const err = leerErrorApi(e);
        if (Object.keys(err.campos).length) this.errores.set(err.campos);
        else this.error.set(err.mensaje);
      },
    });
  }
}
