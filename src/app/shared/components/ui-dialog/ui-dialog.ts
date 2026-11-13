import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output } from '@angular/core';

/**
 * Comportamiento común de todas las ventanas modales de RPS. Se pone como atributo en el panel de la ventana,
 * así cada diálogo conserva su propio elemento y sus estilos:
 *
 *   <div class="fondo" (click)="cancelar.emit()"></div>
 *   <section class="dialogo" ui-dialog tituloId="mi-titulo" descripcionId="mi-texto" (cerrar)="cancelar.emit()">
 *     <h2 id="mi-titulo">…</h2> <p id="mi-texto">…</p>
 *     <button data-foco-inicial …>Cancelar</button>
 *   </section>
 *
 * Qué hace:
 *  - role (dialog o alertdialog), aria-modal, aria-labelledby y aria-describedby en el panel.
 *  - Al abrir pone el foco en el elemento marcado con data-foco-inicial; si no hay, en el propio panel
 *    (el lector de pantalla anuncia el título y Tab lleva al primer control).
 *  - Trampa de foco: Tab y Shift+Tab dan la vuelta dentro de la ventana y el foco no puede salir de ella.
 *  - Escape emite (cerrar), salvo con [cerrarConEscape]="false" (por ejemplo, mientras se guarda).
 *  - Al cerrar devuelve el foco a lo que abrió la ventana; si ese botón ya no existe (un menú que se cerró),
 *    al control más cercano que siga en pantalla.
 *  - Con varias ventanas abiertas, solo la de arriba responde.
 * El fondo, el botón X y los botones Cancelar siguen siendo de cada diálogo.
 */
@Component({
  selector: '[ui-dialog]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    '[attr.role]': 'rol()',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': 'tituloId()',
    '[attr.aria-describedby]': 'descripcionId()',
    tabindex: '-1',
  },
  // El panel recibe el foco solo para anunciar la ventana: sin anillo alrededor de toda la ventana.
  styles: ':host:focus, :host:focus-visible { outline: none; }',
})
export class UiDialog {
  readonly rol = input<'dialog' | 'alertdialog'>('dialog');
  /** id del título visible de la ventana. */
  readonly tituloId = input.required<string>();
  /** id del texto que explica la ventana, si lo tiene. */
  readonly descripcionId = input<string | null>(null);
  readonly cerrarConEscape = input(true);
  readonly cerrar = output<void>();

  private readonly panel: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  /** Lo que abrió la ventana y sus contenedores, para devolverle el foco al cerrar. */
  private readonly origen: HTMLElement[];

  constructor() {
    const activo = document.activeElement;
    this.origen = activo instanceof HTMLElement && activo !== document.body ? cadena(activo) : ultimoFoco;
    abiertas.push(this);

    afterNextRender(() => {
      const marcado = this.panel.querySelector<HTMLElement>('[data-foco-inicial]');
      (marcado && visible(marcado) ? marcado : this.panel).focus();
    });

    // Al guardar, el botón enfocado se deshabilita (o desaparece) y el navegador, un momento después, manda el foco
    // a <body> sin avisar. Se adelanta: el foco pasa al panel para que la ventana siga siendo el contexto del teclado
    // y del lector de pantalla.
    const vigilante = new MutationObserver(() => {
      if (abiertas[abiertas.length - 1] !== this) return;
      const activo = document.activeElement as (HTMLElement & { disabled?: boolean }) | null;
      if (!activo || activo === document.body || !activo.isConnected || activo.disabled === true) this.panel.focus({ preventScroll: true });
    });
    vigilante.observe(this.panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });

    inject(DestroyRef).onDestroy(() => {
      vigilante.disconnect();
      const i = abiertas.indexOf(this);
      if (i >= 0) abiertas.splice(i, 1);
      // Después de que la pantalla termine de actualizarse (filas que desaparecen, menús que se cierran).
      setTimeout(() => this.devolverFoco());
    });
  }

  /** @internal */
  contiene(nodo: Node | null): boolean {
    return !!nodo && this.panel.contains(nodo);
  }

  /** @internal El foco intentó salir: vuelve al primer control de la ventana. */
  traerFoco(): void {
    (enfocables(this.panel)[0] ?? this.panel).focus();
  }

  /** @internal */
  alPresionar(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      if (!this.cerrarConEscape()) return;
      evento.preventDefault();
      this.cerrar.emit();
      return;
    }
    if (evento.key !== 'Tab') return;
    const lista = enfocables(this.panel);
    if (!lista.length) { evento.preventDefault(); this.panel.focus(); return; }
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    const activo = document.activeElement;
    const fuera = !this.contiene(activo);
    if (evento.shiftKey && (fuera || activo === primero || activo === this.panel)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && (fuera || activo === ultimo)) {
      evento.preventDefault();
      primero.focus();
    }
  }

  private devolverFoco(): void {
    // Si otra cosa ya tomó el foco (otra ventana, un clic), no se le quita.
    if (document.activeElement && document.activeElement !== document.body) return;
    for (const el of this.origen) {
      if (!el.isConnected) continue;
      const destino = el.matches(ENFOCABLES) && visible(el) ? el : enfocables(el)[0];
      if (destino) { destino.focus(); return; }
    }
  }
}

// ── Estado compartido por todas las ventanas ─────────────────────────────

const ENFOCABLES = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', '[contenteditable=""]', '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Ventanas abiertas, la última es la de arriba. */
const abiertas: UiDialog[] = [];
/** Último control que tuvo el foco o se pulsó, con sus contenedores (se guarda antes de que desaparezca). */
let ultimoFoco: HTMLElement[] = [];
let escuchando = false;

function escucharDocumento(): void {
  if (escuchando || typeof document === 'undefined') return;
  escuchando = true;
  document.addEventListener('focusin', (e) => {
    const arriba = abiertas[abiertas.length - 1];
    if (arriba && !arriba.contiene(e.target as Node)) { arriba.traerFoco(); return; }
    if (e.target instanceof HTMLElement) ultimoFoco = cadena(e.target);
  }, true);
  // Safari no enfoca los botones al hacer clic: se recuerda el control pulsado.
  document.addEventListener('pointerdown', (e) => {
    if (abiertas.length) return;
    const control = (e.target as Element | null)?.closest?.(ENFOCABLES);
    if (control instanceof HTMLElement) ultimoFoco = cadena(control);
  }, true);
  document.addEventListener('keydown', (e) => abiertas[abiertas.length - 1]?.alPresionar(e));
}

// Se escucha desde que se carga este archivo (con la pantalla que usa ventanas), no desde la primera ventana:
// así se conoce el botón de un menú que se cierra justo antes de abrir la primera ventana.
escucharDocumento();

/** El elemento y sus contenedores, sin pasar del contenido de la página (<main>) ni de <body>. */
function cadena(el: HTMLElement): HTMLElement[] {
  const lista: HTMLElement[] = [];
  for (let n: HTMLElement | null = el; n && n !== document.body && n.tagName !== 'MAIN'; n = n.parentElement) lista.push(n);
  return lista;
}

function enfocables(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(visible);
}

function visible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && !el.closest('[inert]');
}
