import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';
import { formatCurrency } from '@angular/common';

/**
 * Dólares con dos decimales en el formato de Ecuador: {{ 1066.67 | dinero }} → $ 1.066,67.
 * Es lo mismo que `currency: 'USD' : 'symbol' : '1.2-2'`, más corto para las tablas de dinero.
 * null o undefined se muestran como "—".
 */
@Pipe({ name: 'dinero' })
export class DineroPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(valor: number | null | undefined): string {
    if (valor === null || valor === undefined) return '—';
    return formatCurrency(valor, this.locale, '$', 'USD', '1.2-2');
  }
}
