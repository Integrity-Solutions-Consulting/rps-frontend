import { Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Qué se puede escribir en el campo:
 *   - 'monto':      dinero, hasta 2 decimales con coma o punto (1250,50)
 *   - 'porcentaje': igual que monto, máximo 100
 *   - 'entero':     solo dígitos (días, número de cuenta)
 *   - 'documento':  dígitos y guiones, formato del SRI 001-001-000001234
 */
export type TipoNumero = 'monto' | 'porcentaje' | 'entero' | 'documento';

const PATRONES: Record<TipoNumero, RegExp> = {
  monto: /^\d{0,9}([.,]\d{0,2})?$/,
  porcentaje: /^\d{0,3}([.,]\d{0,2})?$/,
  entero: /^\d*$/,
  documento: /^\d{0,3}(-\d{0,3}(-\d{0,9})?)?$/,
};

/**
 * Impide escribir o pegar letras y símbolos en campos numéricos: <input appSoloNumeros="monto" />.
 * Se usa con type="text" (no type="number", que acepta "e", "+" y "-") y pone el teclado numérico en el celular.
 * Revisa el valor antes de que cambie, así ngModel nunca recibe un texto inválido.
 */
@Directive({
  selector: 'input[appSoloNumeros]',
  host: {
    '[attr.inputmode]': 'tipo() === "entero" || tipo() === "documento" ? "numeric" : "decimal"',
    autocomplete: 'off',
    '(beforeinput)': 'revisar($event)',
  },
})
export class SoloNumeros {
  private readonly campo = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  readonly tipo = input<TipoNumero>('monto', { alias: 'appSoloNumeros' });

  protected revisar(evento: InputEvent): void {
    // Borrar, deshacer, etc. siempre se permite.
    if (!evento.inputType.startsWith('insert')) return;

    const texto = evento.data ?? evento.dataTransfer?.getData('text/plain') ?? '';
    // Al pegar "$ 1250,50" se quitan el símbolo y los espacios.
    const limpio = evento.inputType === 'insertFromPaste' ? texto.replace(/[$\s]/g, '') : texto;
    const inicio = this.campo.selectionStart ?? this.campo.value.length;
    const fin = this.campo.selectionEnd ?? inicio;
    const resultado = this.campo.value.slice(0, inicio) + limpio + this.campo.value.slice(fin);

    const valido = PATRONES[this.tipo()].test(resultado)
      && (this.tipo() !== 'porcentaje' || Number(resultado.replace(',', '.')) <= 100);
    if (!valido) { evento.preventDefault(); return; }

    // Si se limpió lo pegado, se escribe la versión limpia en lugar del texto original.
    if (limpio !== texto) {
      evento.preventDefault();
      this.campo.value = resultado;
      const cursor = inicio + limpio.length;
      this.campo.setSelectionRange(cursor, cursor);
      this.campo.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
