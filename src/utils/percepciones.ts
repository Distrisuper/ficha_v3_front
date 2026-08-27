import type { PercepcionDetalle, Remito } from '../types/api';
import { toNumero } from './numero';

/** Una línea del desglose que se muestra en el tooltip. */
export interface LineaPercepcion {
  /** Categoría canónica (`PERC. IIBB BSAS`). Es la clave de agrupación. */
  nombre: string;
  /**
   * Textos crudos del PDF que cayeron en esta categoría. Casi siempre uno; puede
   * haber varios cuando dos remitos de la misma factura la escriben distinto.
   */
  descripciones: string[];
  monto: number;
}

/**
 * Arma el desglose de percepciones de un conjunto de remitos, agrupado por
 * categoría y ordenado de mayor a menor.
 *
 * ── Por qué agrupa por categoría y no muestra las filas tal cual ─────────────
 * El pie de la factura muestra la SUMA de todos los remitos del scope (una misma
 * factura se parte en N remitos y las percepciones se prorratean entre ellos). Si
 * el tooltip listara las filas crudas, una factura con 3 remitos mostraría
 * "PERC. IIBB BSAS" tres veces con un tercio del monto cada una, y el operador
 * tendría que sumar de cabeza para comparar contra el papel.
 *
 * Agrupado por categoría, el tooltip cierra contra el total que está viendo — que
 * es exactamente la verificación que va a querer hacer.
 *
 * ── Por qué junta las descripciones en un array ──────────────────────────────
 * La categoría es lo que importa para el ERP, pero lo que el operador reconoce del
 * PDF es el texto del proveedor. Dos remitos de la misma factura pueden traer
 * "PERC. IIBB BS AS 01" y "Perc.IB Bs. As.", que son lo mismo: se muestran las dos
 * para que el renglón del papel sea encontrable, sin duplicar el monto.
 */
export function desglosePercepciones(remitos: Remito[]): LineaPercepcion[] {
  const porNombre = new Map<string, LineaPercepcion>();

  for (const r of remitos) {
    for (const p of r.percepcionesDetalle ?? []) {
      const nombre = (p.nombre ?? '').trim() || 'SIN CLASIFICAR';
      const monto = toNumero(p.monto);
      const prev = porNombre.get(nombre);
      const descripcion = (p.descripcion ?? '').trim();

      if (prev) {
        prev.monto += monto;
        if (descripcion && !prev.descripciones.includes(descripcion)) {
          prev.descripciones.push(descripcion);
        }
      } else {
        porNombre.set(nombre, {
          nombre,
          descripciones: descripcion ? [descripcion] : [],
          monto,
        });
      }
    }
  }

  // De mayor a menor: el operador busca primero la percepción grande, que es la
  // que mueve el total si está mal.
  return [...porNombre.values()].sort((a, b) => b.monto - a.monto);
}

/**
 * ¿Cuánto del total de percepciones NO está explicado por el desglose?
 *
 * Sirve para no mentir en el tooltip. Los comprobantes procesados antes de que
 * existiera el desglose tienen `percepciones` con monto y `percepcionesDetalle`
 * vacío; y un remito puede tener el total corregido a mano sin que se haya tocado
 * el detalle. En los dos casos, mostrar sólo el desglose daría a entender que eso
 * es todo, cuando el total dice otra cosa.
 *
 * Devuelve la diferencia redondeada a 2 decimales. Positiva = falta explicar.
 */
export function percepcionSinDesglosar(remitos: Remito[], total: number): number {
  const explicado = desglosePercepciones(remitos).reduce((a, l) => a + l.monto, 0);
  return Math.round((toNumero(total) - explicado + Number.EPSILON) * 100) / 100;
}

/** Sólo para tests / debug: aplana el desglose sin agrupar. */
export function percepcionesCrudas(remitos: Remito[]): PercepcionDetalle[] {
  return remitos.flatMap((r) => r.percepcionesDetalle ?? []);
}
