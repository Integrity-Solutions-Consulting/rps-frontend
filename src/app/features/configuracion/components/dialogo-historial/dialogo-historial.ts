import { ChangeDetectionStrategy, Component, WritableSignal, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CambioConfiguracion } from '../../services/auditoria.service';
import { CAMPOS_CONFIGURACION } from '../../models/configuracion.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { UiDialog } from '../../../../shared/components/ui-dialog/ui-dialog';

type Atajo = '7' | '30' | 'anio' | null;

/** Cambios por página. */
const POR_PAGINA = 8;

/**
 * Historial completo de la configuración general (RN 48: autor, fecha, motivo, antes y después).
 * Filtra por fechas, campo y usuario y pagina en la pantalla: GET /api/auditoria todavía no tiene esos parámetros.
 */
@Component({
  selector: 'app-dialogo-historial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, Icon, UiDialog],
  templateUrl: './dialogo-historial.html',
  styleUrl: './dialogo-historial.scss',
})
export class DialogoHistorial {
  readonly cambios = input.required<CambioConfiguracion[]>();
  /** Nombre de cada usuario por id (vacío si quien mira no puede listar usuarios). */
  readonly nombres = input<Record<string, string>>({});
  readonly cerrar = output<void>();

  protected readonly campos = CAMPOS_CONFIGURACION;
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly campo = signal('');
  protected readonly usuario = signal('');
  protected readonly atajo = signal<Atajo>(null);
  protected readonly pagina = signal(1);

  /** Usuarios que aparecen en el historial, para el filtro. */
  protected readonly autores = computed(() => {
    const ids = new Set(this.cambios().map((c) => c.usuarioId ?? ''));
    return [...ids].map((id) => ({ id, nombre: this.autor(id || null) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  protected readonly filtrados = computed(() => {
    const desde = this.desde() ? new Date(`${this.desde()}T00:00:00`) : null;
    const hasta = this.hasta() ? new Date(`${this.hasta()}T23:59:59.999`) : null;
    return this.cambios().filter((c) =>
      (!desde || c.fecha >= desde) && (!hasta || c.fecha <= hasta) &&
      (!this.campo() || c.clave === this.campo()) &&
      (!this.usuario() || (c.usuarioId ?? '') === this.usuario()));
  });

  protected readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.filtrados().length / POR_PAGINA)));
  protected readonly paginas = computed(() => Array.from({ length: this.totalPaginas() }, (_, i) => i + 1));
  protected readonly rango = computed(() => {
    const total = this.filtrados().length;
    const desde = total === 0 ? 0 : (this.pagina() - 1) * POR_PAGINA + 1;
    return { desde, hasta: Math.min(total, this.pagina() * POR_PAGINA), total };
  });

  /** La página actual agrupada por día. */
  protected readonly grupos = computed(() => {
    const inicio = (this.pagina() - 1) * POR_PAGINA;
    const pagina = this.filtrados().slice(inicio, inicio + POR_PAGINA);
    const grupos: { dia: Date; clave: string; items: CambioConfiguracion[] }[] = [];
    for (const c of pagina) {
      const clave = c.fecha.toDateString();
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.clave === clave) ultimo.items.push(c);
      else grupos.push({ dia: c.fecha, clave, items: [c] });
    }
    return grupos;
  });

  protected readonly hayFiltros = computed(() => !!(this.desde() || this.hasta() || this.campo() || this.usuario()));

  protected autor(id: string | null): string {
    if (!id) return 'Sistema';
    return this.nombres()[id] ?? 'Usuario';
  }

  /** Un filtro cambiado a mano quita el atajo marcado y vuelve a la página 1. */
  protected cambiarFiltro(filtro: WritableSignal<string>, valor: string): void {
    filtro.set(valor ?? '');
    this.atajo.set(null);
    this.pagina.set(1);
  }

  protected usarAtajo(a: Exclude<Atajo, null>): void {
    const hoy = new Date();
    const inicio = a === 'anio' ? new Date(hoy.getFullYear(), 0, 1) : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - Number(a) + 1);
    this.desde.set(aTexto(inicio));
    this.hasta.set(aTexto(hoy));
    this.atajo.set(a);
    this.pagina.set(1);
  }

  protected limpiar(): void {
    this.desde.set('');
    this.hasta.set('');
    this.campo.set('');
    this.usuario.set('');
    this.atajo.set(null);
    this.pagina.set(1);
  }
}

/** Fecha local como yyyy-MM-dd para los <input type="date">. */
function aTexto(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
