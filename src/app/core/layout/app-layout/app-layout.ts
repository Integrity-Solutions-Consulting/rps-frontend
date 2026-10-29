import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { Sidebar } from '../sidebar/sidebar';
import { Navbar } from '../navbar/navbar';
import { NotificationService } from '../../services/notification.service';
import { Icon } from '../../../shared/components/icon/icon';
import { hayMocks, textoMocks } from '../../mocks/mock-config';

@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, Navbar, Icon],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.scss',
})
export class AppLayout {
  protected readonly notifications = inject(NotificationService);
  protected readonly menuAbierto = signal(false);
  protected readonly usaMocks = hayMocks;
  protected readonly textoMocks = textoMocks;

  constructor() {
    // En pantallas pequeñas el menú se cierra al navegar.
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.menuAbierto.set(false));
  }
}
