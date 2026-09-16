/**
 * Comparación y búsqueda de texto para catálogos (proveedores, sucursales).
 *
 * Vive acá y no adentro del componente que busca porque lo usan tres cosas que
 * tienen que coincidir entre sí: el orden de la lista (DataContext), el filtro
 * del combobox (SearchSelect) y el buscador de la pantalla de Configuración. Si
 * cada una tuviera su propio criterio, un proveedor podría aparecer al buscarlo
 * en un lado y no en el otro.
 */

/**
 * Minúsculas y sin acentos.
 *
 * El operador tipea "jose" y el proveedor está cargado como "JOSÉ": sin
 * normalizar, la búsqueda no encuentra nada y el catálogo parece incompleto.
 */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * ¿Lo que se buscó aparece en alguno de los campos?
 *
 * ── Todas las palabras, en cualquier orden y en cualquier campo ──────────────
 * "dist sur" encuentra "Distribuidora del Sur", y "sur dist" también. Exigir la
 * frase completa y en orden obliga a recordar el nombre exacto, que es
 * justamente lo que el buscador viene a evitar.
 *
 * ── Por qué se compara también sin puntuación ───────────────────────────────
 * El CUIT se muestra enmascarado (30-12345678-9) pero se copia de AFIP en
 * dígitos pelados. Comparando sólo el texto tal cual, pegar el CUIT sin guiones
 * no encontraba al proveedor que se estaba mirando.
 *
 * Query vacía devuelve `true`: "sin filtro" es "todo pasa", no "nada pasa".
 */
export function coincideBusqueda(
  query: string,
  ...campos: (string | null | undefined)[]
): boolean {
  const q = normalizarTexto(query);
  if (!q) return true;

  const plano = campos
    .filter((c): c is string => typeof c === 'string' && c !== '')
    .map(normalizarTexto)
    .join(' ');
  const compacto = soloAlfanumerico(plano);

  return q
    .split(/\s+/)
    .every((token) => plano.includes(token) || compacto.includes(soloAlfanumerico(token)));
}

const soloAlfanumerico = (s: string): string => s.replace(/[^a-z0-9]/g, '');

/**
 * Orden alfabético en español.
 *
 * `localeCompare` y no `<`: con el comparador por defecto de JS "Ñ" cae después
 * de "Z" (compara code points) y todo lo que arranca con minúscula va después de
 * todo lo que arranca con mayúscula, así que un catálogo mixto queda en dos
 * bloques. `sensitivity: 'base'` hace que los acentos y las mayúsculas no
 * partan la lista; `numeric` ordena "Depósito 2" antes que "Depósito 10".
 */
export const compararNombres = (a: string, b: string): number =>
  a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
