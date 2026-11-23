import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionService } from './core/services/session.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    // 40 min sin uso u 8 h desde el login cierran la sesión (igual que el backend).
    inject(SessionService).vigilarInactividad();
  }
}
