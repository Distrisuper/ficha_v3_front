// CUIT: se guarda y se manda al backend en 11 dígitos, sin guiones. El formato
// xx-xxxxxxxx-x es únicamente presentación — si el separador viajara a la API,
// "20-12345678-9" y "20123456789" convivirían como valores distintos y el
// chequeo de duplicados del backend dejaría de servir.

export const soloDigitos = (v: string) => v.replace(/\D/g, '');

/**
 * Formatea para mostrar: 30500010912 -> 30-50001091-2.
 * Va formateando parcial mientras se tipea, así que sirve igual para el input.
 * Si viene null o vacío devuelve '—' salvo que se pida otro placeholder.
 */
export function formatCuit(cuit: string | null | undefined, placeholder = '—'): string {
  const d = soloDigitos(cuit ?? '');
  if (!d) return placeholder;
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10, 11)}`;
}

/**
 * Dígito verificador (módulo 11, serie 5,4,3,2,7,6,5,4,3,2). Mismo algoritmo
 * que valida el backend en proveedores/schemas/proveedor.schema.ts: acá está
 * duplicado sólo para dar feedback inmediato en el form; la fuente de verdad
 * sigue siendo la API.
 */
export function cuitEsValido(cuit: string): boolean {
  const d = soloDigitos(cuit);
  if (!/^\d{11}$/.test(d)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, peso, i) => acc + peso * Number(d[i]), 0);
  const resto = suma % 11;
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return dv === Number(d[10]);
}
