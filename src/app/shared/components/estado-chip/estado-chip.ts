import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type TonoChip = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

/** Etiqueta de estado (Vigente, Próximo a vencer, Pendiente…) como en los mockups. */
@Component({
  selector: 'app-estado-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"chip chip--" + tono()' },
  template: '<ng-content />',
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px;
            border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; }
    /* Punto de color antes del texto (diseño nov 2026). */
    :host::before { content: ''; width: 6px; height: 6px; border-radius: 50%; flex: none; background: currentColor; }
    :host(.chip--ok) { background: var(--rps-ok-50); color: var(--rps-ok); }
    :host(.chip--ok)::before { background: var(--rps-ok-dot); }
    :host(.chip--warn) { background: var(--rps-warn-50); color: var(--rps-warn); }
    :host(.chip--warn)::before { background: var(--rps-warn-dot); }
    :host(.chip--danger) { background: var(--rps-danger-50); color: var(--rps-danger); }
    :host(.chip--danger)::before { background: var(--rps-danger-dot); }
    :host(.chip--info) { background: var(--rps-info-50); color: var(--rps-info); }
    :host(.chip--info)::before { background: var(--rps-info-dot); }
    :host(.chip--neutral) { background: var(--rps-neutral-50); color: #4b5563; }
    :host(.chip--neutral)::before { background: #9aa1ad; }
    /* Donde la pantalla ya pinta su propio punto, no se duplica. */
    :host(:has(.punto))::before { display: none; }
  `],
})
export class EstadoChip {
  readonly tono = input<TonoChip>('neutral');
}
