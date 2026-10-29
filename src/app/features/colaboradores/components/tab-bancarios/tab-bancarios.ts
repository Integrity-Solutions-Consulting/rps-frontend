import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColaboradoresService } from '../../services/colaboradores.service';
import { ColaboradorDetalle, TIPOS_CUENTA } from '../../models/colaborador.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';

/** Bancos más usados; "Otro" permite escribir el nombre. La lista oficial depende de la plantilla del banco (PA 02). */
const BANCOS = [
  'Banco Pichincha', 'Banco Guayaquil', 'Produbanco', 'Banco del Pacífico', 'Banco Internacional',
  'Banco Bolivariano', 'Banco del Austro', 'Cooperativa JEP',
];
const OTRO = 'Otro';

/**
 * Pestaña "Datos bancarios": cuenta que se usa en el Excel de pago.
 * API real: PUT /api/colaboradores/{id}/cuenta-bancaria. El backend nunca devuelve el número
 * completo (se guarda cifrado), por eso para cambiarlo hay que escribir el número entero.
 */
@Component({
  selector: 'app-tab-bancarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, Icon],
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

  protected readonly bancos = [...BANCOS, OTRO];
  protected readonly tiposCuenta = TIPOS_CUENTA;
  protected readonly bloqueado = computed(() => !this.colaborador().activo);

  protected readonly bancoForm = signal('');
  protected readonly otroBancoForm = signal('');
  protected readonly tipoForm = signal('');
  protected readonly numeroForm = signal('');
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);

  /** Banco que se enviará: el elegido o el escrito en "Otro". */
  private readonly bancoFinal = computed(() =>
    this.bancoForm() === OTRO ? this.otroBancoForm().trim() : this.bancoForm());

  /** Lo que se verá en el Excel con lo que hay en el formulario. */
  protected readonly vistaPrevia = computed(() => {
    const actual = this.colaborador().cuentaBancaria;
    const numero = this.numeroForm().trim();
    return {
      banco: this.bancoFinal() || actual?.banco || '—',
      tipo: this.tipoForm() || actual?.tipoCuenta || '—',
      numero: numero.length > 4 ? `****${numero.slice(-4)}` : numero ? '*'.repeat(numero.length) : actual?.numeroCuentaEnmascarado ?? '—',
    };
  });

  protected readonly hayCambios = computed(() => {
    const actual = this.colaborador().cuentaBancaria;
    return !!this.numeroForm().trim() || this.bancoFinal() !== (actual?.banco ?? '') || this.tipoForm() !== (actual?.tipoCuenta ?? '');
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
    const banco = c?.banco ?? '';
    const conocido = !banco || BANCOS.includes(banco);
    this.bancoForm.set(conocido ? banco : OTRO);
    this.otroBancoForm.set(conocido ? '' : banco);
    this.tipoForm.set(c?.tipoCuenta ?? '');
    this.numeroForm.set('');
    this.errores.set({});
    this.error.set(null);
  }

  protected guardar(): void {
    const numero = this.numeroForm().trim();
    if (!/^\d{1,30}$/.test(numero)) {
      this.errores.set({
        numeroCuenta: this.colaborador().cuentaBancaria
          ? 'Para guardar cambios escribe el número de cuenta completo (solo dígitos).'
          : 'Escribe el número de cuenta (solo dígitos, máximo 30).',
      });
      return;
    }
    this.guardando.set(true);
    this.errores.set({});
    this.error.set(null);
    this.colaboradores.registrarCuentaBancaria(this.colaborador().id, {
      banco: this.bancoFinal() || null,
      tipoCuenta: this.tipoForm() || null,
      numeroCuenta: numero,
    }).subscribe({
      next: () => {
        this.guardando.set(false);
        this.avisos.ok('Datos bancarios guardados. La cuenta anterior queda en el historial.');
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
