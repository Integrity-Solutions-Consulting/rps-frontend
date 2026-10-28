import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { SessionService } from '../../services/session.service';
import { Icon } from '../../../shared/components/icon/icon';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-navbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  protected readonly session = inject(SessionService);
  protected readonly usaMocks = environment.useMocks;
  readonly toggleMenu = output<void>();
}
