// Genera y descarga un CSV en el navegador. Vanilla, sin dependencias.
// - Separador ';' (Excel en es-AR usa ';' porque la coma es decimal).
// - BOM UTF-8 al inicio para que Excel respete los acentos.
type Cell = string | number | null | undefined;

function escapeCell(v: Cell): string {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const body = [headers, ...rows].map((r) => r.map(escapeCell).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
