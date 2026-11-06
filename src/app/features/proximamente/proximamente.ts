import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, IconName } from '../../shared/components/icon/icon';

/** Pantalla temporal de los módulos que aún no tienen funciones. Recibe los datos de la ruta. */
@Component({
  selector: 'app-proximamente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <section class="card vacio">
      <span class="vacio__icon"><app-icon [name]="icono()" [size]="26" /></span>
      <h1>{{ modulo() }}</h1>
      <p>{{ descripcion() }}</p>
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
    .btn { margin-top: 8px; text-decoration: none; }
  `],
})
export class Proximamente {
  readonly modulo = input('Módulo');
  readonly descripcion = input('');
  readonly icono = input<IconName>('home');
}
