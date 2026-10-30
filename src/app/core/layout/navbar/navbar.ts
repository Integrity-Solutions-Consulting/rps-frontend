import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { SessionService } from '../../services/session.service';
import { Icon } from '../../../shared/components/icon/icon';
import { hayMocks, textoMocks } from '../../mocks/mock-config';
import { Campana } from '../../../features/notificaciones/components/campana/campana';

@Component({
  selector: 'app-navbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Campana],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  protected readonly session = inject(SessionService);
  protected readonly usaMocks = hayMocks;
  protected readonly textoMocks = textoMocks;
  readonly toggleMenu = output<void>();
}
