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
            border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    :host(.chip--ok) { background: var(--rps-ok-50); color: var(--rps-ok); }
    :host(.chip--warn) { background: var(--rps-warn-50); color: var(--rps-warn); }
    :host(.chip--danger) { background: var(--rps-danger-50); color: var(--rps-danger); }
    :host(.chip--info) { background: var(--rps-info-50); color: var(--rps-info); }
    :host(.chip--neutral) { background: #eef2f5; color: var(--rps-muted); }
  `],
})
export class EstadoChip {
  readonly tono = input<TonoChip>('neutral');
}
