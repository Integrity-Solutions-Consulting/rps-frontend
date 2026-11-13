import { ChangeDetectionStrategy, Component, Directive, ElementRef, inject, input, output } from '@angular/core';

/** Una pestaña: su valor (el que guarda la pantalla) y su texto. */
export interface PestanaUi<T extends string = string> {
  id: T;
  titulo: string;
}

/** id del botón de una pestaña y del panel que muestra; los usan ui-tabs y uiTabPanel para enlazarse. */
export const idPestana = (base: string, id: string) => `${base}-tab-${id}`;
export const idPanel = (base: string) => `${base}-panel`;

/**
 * Pestañas accesibles de RPS (patrón "tabs" de WAI-ARIA). El propio elemento es la lista de pestañas
 * y usa los estilos globales .tabs / .tab, así se ve igual que antes en todas las pantallas.
 *
 *   <ui-tabs idBase="ficha" etiqueta="Secciones del colaborador" [pestanas]="pestanas" [activa]="pestana()"
 *            (cambiar)="pestana.set($event)" />
 *   <app-tab-proyectos uiTabPanel="ficha" [uiTabPanelActiva]="pestana()" … />
 *
 * Solo existe el panel de la pestaña activa (cada pantalla sigue decidiendo qué muestra y qué carga).
 *
 * Teclado: ← y → recorren las pestañas (dan la vuelta), Inicio y Fin van a la primera y a la última.
 *  - activacion="manual" (por defecto): las flechas solo mueven el foco; Enter o Espacio abren la pestaña.
 *    Para pestañas que piden datos al backend: no se dispara una carga por cada flecha.
 *  - activacion="auto": las flechas abren la pestaña al pasar por ella (vistas instantáneas).
 * Solo la pestaña activa entra en el orden de Tab (tabindex 0); las demás tienen tabindex -1.
 */
@Component({
  selector: 'ui-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'tablist',
    class: 'tabs',
    'aria-orientation': 'horizontal',
    '[attr.aria-label]': 'etiqueta()',
    '(keydown)': 'alPresionar($event)',
  },
  template: `
    @for (p of pestanas(); track p.id) {
      <button type="button" role="tab" class="tab" [id]="idPestana(idBase(), p.id)"
              [class.is-on]="p.id === activa()" [attr.aria-selected]="p.id === activa()"
              [attr.aria-controls]="p.id === activa() ? idPanel(idBase()) : null"
              [tabIndex]="p.id === activa() ? 0 : -1" (click)="elegir(p.id)">{{ p.titulo }}</button>
    }
  `,
  // Dentro de la barra con desplazamiento horizontal el anillo de foco va hacia adentro para que no se recorte.
  styles: '.tab:focus-visible { outline-offset: -2px; }',
})
export class UiTabs<T extends string = string> {
  readonly pestanas = input.required<readonly PestanaUi<T>[]>();
  readonly activa = input.required<T>();
  /** Prefijo único en la pantalla para los id de pestañas y panel. */
  readonly idBase = input.required<string>();
  readonly etiqueta = input<string | null>(null);
  readonly activacion = input<'manual' | 'auto'>('manual');
  readonly cambiar = output<T>();

  protected readonly idPestana = idPestana;
  protected readonly idPanel = idPanel;
  private readonly lista: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;

  protected elegir(id: T): void {
    if (id !== this.activa()) this.cambiar.emit(id);
  }

  protected alPresionar(evento: KeyboardEvent): void {
    const botones = Array.from(this.lista.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement);
    if (actual < 0 || !botones.length) return;
    let destino: number;
    switch (evento.key) {
      case 'ArrowRight': destino = (actual + 1) % botones.length; break;
      case 'ArrowLeft': destino = (actual - 1 + botones.length) % botones.length; break;
      case 'Home': destino = 0; break;
      case 'End': destino = botones.length - 1; break;
      default: return;
    }
    evento.preventDefault();
    const boton = botones[destino];
    boton.focus();
    // En pantallas angostas la barra se desplaza: la pestaña enfocada queda a la vista.
    boton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (this.activacion() === 'auto') this.elegir(this.pestanas()[destino].id);
  }
}

/**
 * Marca el contenido de la pestaña activa como su panel: role="tabpanel", id y aria-labelledby.
 * Se pone en el elemento que la pantalla ya muestra, sin envolverlo.
 * Con uiTabPanel en null no agrega nada (por ejemplo, cuando la pantalla no muestra las pestañas).
 */
@Directive({
  selector: '[uiTabPanel]',
  host: {
    '[attr.role]': 'base() ? "tabpanel" : null',
    '[attr.id]': 'base() ? idPanel(base()!) : null',
    '[attr.aria-labelledby]': 'base() ? idPestana(base()!, activa()) : null',
  },
})
export class UiTabPanel {
  /** El mismo idBase de su ui-tabs. */
  readonly base = input<string | null>(null, { alias: 'uiTabPanel' });
  readonly activa = input.required<string>({ alias: 'uiTabPanelActiva' });

  protected readonly idPestana = idPestana;
  protected readonly idPanel = idPanel;
}
