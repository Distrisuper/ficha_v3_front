export function money(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (num == null || Number.isNaN(num)) return '$ 0,00';
  return '$ ' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (n == null || Number.isNaN(n)) return v == null ? '—' : String(v);
  // Evita decimales innecesarios: 12.000 -> "12", 1.5 -> "1,5"
  return n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}
