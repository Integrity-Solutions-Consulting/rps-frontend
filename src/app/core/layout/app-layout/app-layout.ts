import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { Sidebar } from '../sidebar/sidebar';
import { Navbar } from '../navbar/navbar';
import { NotificationService } from '../../services/notification.service';
import { Icon } from '../../../shared/components/icon/icon';
import { environment } from '../../../../environments/environment';

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
  protected readonly usaMocks = environment.useMocks;

  constructor() {
    // En pantallas pequeñas el menú se cierra al navegar.
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.menuAbierto.set(false));
  }
}
