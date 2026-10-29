import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ConfiguracionService } from '../../services/configuracion.service';
import {
  ClaveParametro, Configuracion as DatosConfiguracion, PARAMETROS, ParametroVigente, textoValores,
} from '../../models/configuracion.models';
import { leerErrorApi } from '../../../../core/http/error-api';
import { NotificationService } from '../../../../core/services/notification.service';
import { Icon } from '../../../../shared/components/icon/icon';
import { EstadoChip } from '../../../../shared/components/estado-chip/estado-chip';
import { nombrePeriodo } from '../../../../shared/utils/periodo';

type Pestana = 'alertas' | 'anticipos' | 'reglas' | 'catalogos' | 'accesos';

const REGLAS: ClaveParametro[] = ['IvaPct', 'RetencionFuentePct', 'RetencionIvaProfesionalPct', 'RetencionIvaJuniorPct'];

/**
 * Configuración (sección 13). Parámetros que mantiene Contabilidad, cada uno con su vigencia:
 *   - Alertas de vencimiento: rigen de inmediato.
 *   - Límite de anticipos y reglas tributarias: rigen desde el mes siguiente; lo ya calculado
 *     conserva los porcentajes que usó (RN 29).
 *
 * API propuesta: /api/configuracion (hoy de ejemplo).
 */
@Component({
  selector: 'app-configuracion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, Icon, EstadoChip],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
})
export class Configuracion {
  private readonly api = inject(ConfiguracionService);
  private readonly avisos = inject(NotificationService);

  protected readonly parametrosInfo = PARAMETROS;
  protected readonly textoValores = textoValores;
  protected readonly nombrePeriodo = nombrePeriodo;
  protected readonly reglas = REGLAS;
  protected readonly opcionesLimite = [50, 60, 70, 80, 90, 100];
  protected readonly pestanas: { id: Pestana; titulo: string }[] = [
    { id: 'alertas', titulo: 'Alertas' },
    { id: 'anticipos', titulo: 'Anticipos' },
    { id: 'reglas', titulo: 'Reglas de cálculo' },
    { id: 'catalogos', titulo: 'Catálogos' },
    { id: 'accesos', titulo: 'Accesos' },
  ];

  protected readonly pestana = signal<Pestana>('alertas');
  protected readonly datos = signal<DatosConfiguracion | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal<ClaveParametro | 'bancos' | null>(null);

  // Borradores de cada sección (lo que se escribe antes de guardar).
  protected readonly alertas = signal<number[]>([]);
  protected readonly nuevaAlerta = signal('');
  protected readonly limite = signal(100);
  protected readonly borradorReglas = signal<Partial<Record<ClaveParametro, string>>>({});
  protected readonly bancos = signal<string[]>([]);
  protected readonly nuevoBanco = signal('');
  protected readonly errores = signal<Partial<Record<ClaveParametro | 'bancos', string>>>({});

  protected readonly cambiosAlertas = computed(() => this.alertas().join() !== this.parametro('AlertasDias')?.valores.join());

  /** Factor neto con los porcentajes escritos (0,90 profesional · 0,945 junior con los valores actuales). */
  protected readonly factores = computed(() => {
    const v = (c: ClaveParametro) => Number(this.borradorReglas()[c] ?? this.parametro(c)?.valores[0] ?? 0) / 100;
    const factor = (riva: number) => Math.round((1 + v('IvaPct') - v('RetencionFuentePct') - v('IvaPct') * riva) * 10000) / 10000;
    return { profesional: factor(v('RetencionIvaProfesionalPct')), junior: factor(v('RetencionIvaJuniorPct')) };
  });

  constructor() {
    this.cargar();
  }

  protected parametro(clave: ClaveParametro): ParametroVigente | undefined {
    return this.datos()?.parametros.find((p) => p.clave === clave);
  }

  // ── Alertas ──────────────────────────────────────────────────────────
  protected agregarAlerta(): void {
    const dias = Number(this.nuevaAlerta());
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
      this.errores.update((e) => ({ ...e, AlertasDias: 'Escribe un número entero de días entre 1 y 365.' }));
      return;
    }
    this.errores.update((e) => ({ ...e, AlertasDias: undefined }));
    this.alertas.update((l) => [...new Set([...l, dias])].sort((a, b) => b - a));
    this.nuevaAlerta.set('');
  }

  protected quitarAlerta(dias: number): void {
    this.alertas.update((l) => l.filter((d) => d !== dias));
  }

  // ── Reglas de cálculo ────────────────────────────────────────────────
  protected escribirRegla(clave: ClaveParametro, valor: string): void {
    this.borradorReglas.update((b) => ({ ...b, [clave]: valor }));
  }

  // ── Guardar ──────────────────────────────────────────────────────────
  protected guardarParametro(clave: ClaveParametro): void {
    let valores: number[];
    if (clave === 'AlertasDias') valores = this.alertas();
    else if (clave === 'LimiteAnticiposPct') valores = [this.limite()];
    else valores = [Number((this.borradorReglas()[clave] ?? '').replace(',', '.'))];

    this.guardando.set(clave);
    this.errores.update((e) => ({ ...e, [clave]: undefined }));
    this.api.cambiarParametro(clave, { valores }).subscribe({
      next: (p) => {
        this.guardando.set(null);
        this.avisos.ok(p.aplicaDesde === 'Inmediato'
          ? `${PARAMETROS[clave].nombre}: guardado. Rige desde hoy.`
          : `${PARAMETROS[clave].nombre}: guardado. Rige desde ${nombrePeriodo(p.programado?.vigenteDesde ?? p.vigenteDesde).toLowerCase()}.`);
        this.borradorReglas.update((b) => ({ ...b, [clave]: undefined }));
        this.cargar();
      },
      error: (e: unknown) => {
        this.guardando.set(null);
        const err = leerErrorApi(e);
        this.errores.update((x) => ({ ...x, [clave]: Object.values(err.campos)[0] ?? err.mensaje }));
      },
    });
  }

  protected cancelarProgramado(clave: ClaveParametro): void {
    this.guardando.set(clave);
    this.api.cancelarProgramado(clave).subscribe({
      next: () => { this.guardando.set(null); this.avisos.ok('Cambio programado cancelado.'); this.cargar(); },
      error: (e: unknown) => { this.guardando.set(null); this.avisos.error(leerErrorApi(e).mensaje); },
    });
  }

  // ── Catálogo de bancos ───────────────────────────────────────────────
  protected agregarBanco(): void {
    const nombre = this.nuevoBanco().trim();
    if (!nombre) return;
    if (!this.bancos().some((b) => b.toLowerCase() === nombre.toLowerCase())) this.bancos.update((l) => [...l, nombre]);
    this.nuevoBanco.set('');
  }

  protected quitarBanco(nombre: string): void {
    this.bancos.update((l) => l.filter((b) => b !== nombre));
  }

  protected guardarBancos(): void {
    this.guardando.set('bancos');
    this.api.guardarBancos(this.bancos()).subscribe({
      next: (l) => { this.guardando.set(null); this.bancos.set(l); this.avisos.ok('Catálogo de bancos guardado.'); },
      error: (e: unknown) => {
        this.guardando.set(null);
        const err = leerErrorApi(e);
        this.errores.update((x) => ({ ...x, bancos: Object.values(err.campos)[0] ?? err.mensaje }));
      },
    });
  }

  // ── Carga ────────────────────────────────────────────────────────────
  private cargar(): void {
    this.error.set(null);
    this.api.obtener().subscribe({
      next: (d) => {
        this.datos.set(d);
        this.cargando.set(false);
        this.alertas.set([...(d.parametros.find((p) => p.clave === 'AlertasDias')?.valores ?? [])]);
        const limite = d.parametros.find((p) => p.clave === 'LimiteAnticiposPct');
        this.limite.set(limite?.programado?.valores[0] ?? limite?.valores[0] ?? 100);
        this.bancos.set([...d.bancos]);
      },
      error: (e: unknown) => { this.cargando.set(false); this.error.set(leerErrorApi(e).mensaje); },
    });
  }
}
