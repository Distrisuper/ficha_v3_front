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

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
