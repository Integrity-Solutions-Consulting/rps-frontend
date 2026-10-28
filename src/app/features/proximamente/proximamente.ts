import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/components/icon/icon';

/** Pantalla temporal para los módulos que aún no se construyen. Recibe los datos de la ruta. */
@Component({
  selector: 'app-proximamente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <section class="card vacio">
      <span class="vacio__icon"><app-icon name="tool" [size]="26" /></span>
      <h1>{{ modulo() }}</h1>
      <p>{{ descripcion() }}</p>
      <p class="vacio__nota">Este módulo todavía no está construido. Por ahora solo está disponible Inicio.</p>
      <a routerLink="/inicio" class="btn btn--primary">Volver a Inicio</a>
    </section>
  `,
  styles: [`
    .vacio { max-width: 560px; margin: 48px auto; padding: 40px 32px; text-align: center;
             display: grid; gap: 12px; justify-items: center; }
    .vacio__icon { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center;
                   background: var(--rps-teal-50); color: var(--rps-teal); }
    h1 { font-size: 24px; }
    p { margin: 0; color: var(--rps-muted); max-width: 44ch; }
    .vacio__nota { font-size: 13px; }
    .btn { margin-top: 8px; text-decoration: none; }
  `],
})
export class Proximamente {
  readonly modulo = input('Módulo');
  readonly descripcion = input('');
}
