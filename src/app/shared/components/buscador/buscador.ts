import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';

import { Icon } from '../icon/icon';

export interface OpcionBuscador { id: string; nombre: string }

/** "Acuña" → "acuna": compara sin tildes ni mayúsculas. */
const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Campo de texto que sugiere opciones mientras se escribe (reemplaza a un <select> largo).
 * Busca por palabras en cualquier orden y sin tildes: "aguila meza" encuentra "Carlos Andres Aguila Meza".
 * Teclado: ↑/↓ para moverse, Enter para elegir, Esc para cancelar. Si se sale sin elegir, vuelve al valor anterior.
 */
@Component({
  selector: 'app-buscador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { '(document:pointerdown)': 'alPulsarFuera($event)' },
  template: `
    <div class="buscador">
      <app-icon name="search" [size]="16" class="buscador__icono" />
      <input
        [id]="inputId()" class="input buscador__input" type="text" role="combobox" autocomplete="off"
        aria-autocomplete="list" [attr.aria-expanded]="abierto()" [attr.aria-controls]="inputId() + '-lista'"
        [attr.aria-activedescendant]="abierto() && sugerencias().length ? inputId() + '-op-' + activo() : null"
        [placeholder]="placeholder()" [disabled]="opciones().length === 0" [value]="texto()"
        (input)="escribir($any($event.target).value)" (focus)="abrir($any($event.target))" (click)="abierto.set(true)"
        (keydown)="teclear($event)" />
      @if (abierto()) {
        <ul class="buscador__lista" role="listbox" [id]="inputId() + '-lista'">
          @for (o of sugerencias(); track o.id; let i = $index) {
            <li role="option" [id]="inputId() + '-op-' + i" [attr.aria-selected]="o.id === valor()"
                [class.is-activo]="i === activo()" [class.is-elegido]="o.id === valor()"
                (pointerdown)="$event.preventDefault(); seleccionar(o)" (mouseenter)="activo.set(i)">{{ o.nombre }}</li>
          } @empty {
            <li class="buscador__nota">{{ textoVacio() }}</li>
          }
          @if (restantes() > 0) {
            <li class="buscador__nota">… y {{ restantes() }} más. Sigue escribiendo para acotar.</li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .buscador { position: relative; }
    .buscador__icono { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--rps-muted); pointer-events: none; }
    .buscador__input { padding-left: 34px; text-overflow: ellipsis; }
    .buscador__lista { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px;
      list-style: none; max-height: 300px; overflow-y: auto; background: var(--rps-surface);
      border: 1px solid var(--rps-border); border-radius: 8px; box-shadow: 0 8px 24px rgba(19, 38, 61, 0.12); }
    li[role='option'] { padding: 8px 10px; border-radius: 6px; font-size: 14px; cursor: pointer;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    li.is-activo { background: var(--rps-teal-50); }
    li.is-elegido { font-weight: 600; color: var(--rps-teal-700); }
    .buscador__nota { padding: 8px 10px; font-size: 12.5px; color: var(--rps-muted); }
  `],
})
export class Buscador {
  readonly opciones = input<OpcionBuscador[]>([]);
  /** id de la opción elegida. */
  readonly valor = input<string>('');
  readonly inputId = input<string>('buscador');
  readonly placeholder = input<string>('Escribe para buscar…');
  readonly textoVacio = input<string>('Sin coincidencias.');
  readonly maxSugerencias = input<number>(8);
  readonly elegir = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly texto = signal('');
  protected readonly abierto = signal(false);
  protected readonly activo = signal(0);

  private readonly nombreElegido = computed(() => this.opciones().find((o) => o.id === this.valor())?.nombre ?? '');

  private readonly coincidencias = computed(() => {
    const palabras = normalizar(this.texto()).split(/\s+/).filter(Boolean);
    if (!palabras.length) return this.opciones();
    return this.opciones().filter((o) => {
      const nombre = normalizar(o.nombre);
      return palabras.every((p) => nombre.includes(p));
    });
  });
  protected readonly sugerencias = computed(() => this.coincidencias().slice(0, this.maxSugerencias()));
  protected readonly restantes = computed(() => this.coincidencias().length - this.sugerencias().length);

  constructor() {
    // Si el valor cambia desde fuera (carga inicial, ?colaborador=…), mostrar su nombre.
    effect(() => {
      const nombre = this.nombreElegido();
      untracked(() => { if (!this.abierto()) this.texto.set(nombre); });
    });
  }

  protected abrir(campo: HTMLInputElement): void {
    // Con el nombre seleccionado, lo que se escriba lo reemplaza; la lista arranca completa.
    campo.select();
    this.texto.set('');
    this.activo.set(0);
    this.abierto.set(true);
  }

  protected escribir(valor: string): void {
    this.texto.set(valor);
    this.activo.set(0);
    this.abierto.set(true);
  }

  protected teclear(e: KeyboardEvent): void {
    const total = this.sugerencias().length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!this.abierto()) { this.abierto.set(true); return; }
        this.mover(Math.min(this.activo() + 1, total - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.mover(Math.max(this.activo() - 1, 0));
        break;
      case 'Enter': {
        const o = this.sugerencias()[this.activo()];
        if (this.abierto() && o) { e.preventDefault(); this.seleccionar(o); }
        break;
      }
      case 'Escape':
        if (this.abierto()) { e.preventDefault(); this.cerrar(); }
        break;
      case 'Tab':
        this.cerrar();
        break;
    }
  }

  protected seleccionar(o: OpcionBuscador): void {
    this.abierto.set(false);
    this.texto.set(o.nombre);
    if (o.id !== this.valor()) this.elegir.emit(o.id);
  }

  protected alPulsarFuera(e: Event): void {
    if (this.abierto() && !this.host.nativeElement.contains(e.target as Node)) this.cerrar();
  }

  /** Cierra sin elegir y vuelve a mostrar el nombre que ya estaba. */
  private cerrar(): void {
    this.abierto.set(false);
    this.texto.set(this.nombreElegido());
  }

  private mover(i: number): void {
    this.activo.set(i);
    const id = `${this.inputId()}-op-${i}`;
    queueMicrotask(() => this.host.nativeElement.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: 'nearest' }));
  }
}
