import { toNumero } from './numero';

export function money(n: number | string | null | undefined): string {
  if (n == null || n === '') return '$ 0,00';
  // toNumero y no parseFloat: `money('1,5')` devolvía `$ 1,00`.
  return '$ ' + toNumero(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseMoneyInput(v: string): number {
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Fecha de CALENDARIO (`fecha` de un comprobante) → `dd/mm/aaaa`.
 *
 * Formatea con manipulación de STRING, sin pasar por `Date`. La versión anterior
 * hacía `new Date(d).toLocaleDateString('es-AR')` y mostraba el día ANTERIOR:
 *
 *   new Date('2026-08-20')                        // 2026-08-20T00:00:00 UTC
 *   .toLocaleDateString('es-AR')                  // en UTC−3 → "19/08/2026"
 *
 * Un string ISO date-only lo parsea como medianoche UTC, y `toLocaleDateString`
 * lo renderiza en la zona del navegador. En Argentina eso retrocede 3 horas y
 * cruza al día anterior, siempre. Una factura del 20 se veía como del 19 en
 * Pendientes y en Historial.
 *
 * Ojo con la tentación de "arreglarlo" con `new Date(d + 'T00:00:00')`: eso
 * funciona para date-only pero se rompe si el back manda un ISO completo. Sin
 * `Date` no hay nada que romper.
 *
 * `fmtDateTime` sí usa `Date`, y está bien: `createdAt`/`approvedAt` son
 * instantes reales y mostrarlos en la hora local del usuario es lo correcto.
 */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  // Acepta "2026-08-20" y "2026-08-20T03:00:00.000Z": en los dos el prefijo es la
  // fecha que quiso decir el back.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d).trim());
  if (m) {
    const [, y, mes, dia] = m;
    return `${dia}/${mes}/${y}`;
  }
  // Formato inesperado: se muestra crudo antes que inventar una fecha.
  return String(d);
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function fmtCantidad(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  // toNumero y no parseFloat: parseFloat('1,5') devuelve 1, así que un artículo de
  // 1,5 unidades se mostraba como "1".
  const n = toNumero(v);
  // Evita decimales innecesarios: 12.000 -> "12", 1.5 -> "1,5"
  return n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}
