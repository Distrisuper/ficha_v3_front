/**
 * Parseo único de números que pueden venir del back como string o del input del
 * usuario en formato es-AR.
 *
 * ## Por qué existe
 *
 * `Articulo.cantidad` puede llegar como string (la columna es char/decimal según el
 * driver) y los inputs de edición producen strings con coma decimal. Había **tres
 * parseos distintos** para el mismo campo:
 *
 * | Dónde | `'1,5'` daba |
 * |---|---|
 * | `NuevoPage.toCantidad` | `1.5` |
 * | `PendientesPage` / `HistorialPage` (`Number(v) \|\| 0`) | `0` |
 * | `money.fmtCantidad` (`parseFloat`) | `1` |
 *
 * O sea que el mismo artículo mostraba 1,5 en una pantalla, contaba como 0 unidades
 * en otra y se desplegaba como "1" en la tercera. Un solo parser es la única forma
 * de que eso no vuelva a divergir.
 *
 * ## Reglas
 *
 * - `1234.56` → 1234.56 (punto decimal, formato del back)
 * - `'1,5'` → 1.5 (coma decimal, entrada del usuario)
 * - `'1.234,56'` → 1234.56 (puntos de miles + coma decimal, es-AR)
 * - `'1.234'` → 1234 (sin coma, el punto se lee como separador de miles)
 * - vacío, null, no numérico → 0
 */
export function toNumero(v: number | string | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;

  const s = String(v).trim();
  if (!s) return 0;

  // Con coma presente, el punto es separador de miles: "1.234,56" → "1234.56".
  // Sin coma, un punto ambiguo ("1.234") se trata como miles, que es lo que escribe
  // un usuario es-AR. El back nunca manda miles con punto, así que no hay conflicto.
  const normalizado = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(/\.(?=\d{3}(\D|$))/g, '');

  const n = parseFloat(normalizado);
  return Number.isFinite(n) ? n : 0;
}

/** Redondeo a 2 decimales sin los artefactos de coma flotante. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Redondeo a 3 decimales (escala de `articulos.cantidad`). */
export const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;
