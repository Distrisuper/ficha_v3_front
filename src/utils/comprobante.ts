/**
 * Número de comprobante (factura / remito): parseo, normalización y presentación.
 *
 * ## El contrato
 *
 * Un número válido son **12 o 13 dígitos**: punto de venta (4 o 5) + número (8).
 * Todo lo demás — barras, guiones, puntos, espacios — es separador de presentación
 * y no forma parte del dato. Es la misma decisión que ya se tomó con el CUIT en
 * `utils/cuit.ts`: se persiste limpio, se muestra con máscara.
 *
 * - Al back se manda SIEMPRE la forma normalizada (solo dígitos, con los ceros a la
 *   izquierda completados).
 * - En pantalla se muestra `X/XXXX-XXXXXXXX` (13 dígitos) o `XXXX-XXXXXXXX` (12).
 *
 * ## Por qué el padding
 *
 * El OCR/LLM devuelve lo que está impreso en el PDF, y los proveedores no imprimen
 * los ceros a la izquierda de forma consistente: `1-234`, `0001-00000234` y
 * `00010000234` son el MISMO comprobante. Sin normalizar, el mismo número entra a
 * la base de tres formas distintas y cualquier cruce posterior (contra la orden de
 * compra, contra un duplicado) falla por una diferencia que no existe.
 *
 * ## Por qué un número corto sin separador es inválido
 *
 * `00010000234` (11 dígitos, sin separador) no se puede normalizar: no hay forma de
 * saber si el punto de venta son los primeros 3 o los primeros 4 dígitos. Adivinar
 * el corte inventaría un comprobante distinto del real, así que se reporta como
 * inválido y lo corrige el operador.
 */

/** Longitud fija de la parte "número" del comprobante. */
const LARGO_NUMERO = 8;
/** Longitudes válidas del punto de venta. */
const LARGO_PV_CORTO = 4;
const LARGO_PV_LARGO = 5;

export const LARGOS_VALIDOS = [LARGO_PV_CORTO + LARGO_NUMERO, LARGO_PV_LARGO + LARGO_NUMERO]; // [12, 13]

/** Máscara que se le muestra al operador en los mensajes de error. */
export const FORMATO_ESPERADO = 'X/XXXX-XXXXXXXX';

/**
 * Devuelve el número en su forma canónica (12 o 13 dígitos, sin separadores), o
 * `null` si el valor no es un comprobante reconocible.
 */
export function normalizarNroComprobante(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Letras o símbolos raros: no es un número de comprobante de este formato. No se
  // intenta "rescatar" los dígitos porque `A0001-00000234` significaría descartar la
  // letra del tipo de comprobante, que es información.
  if (/[^0-9/\-.\s]/.test(s)) return null;

  const partes = s.split(/[^0-9]+/).filter(Boolean);
  if (partes.length === 0) return null;

  let pv: string;
  let numero: string;

  if (partes.length === 1) {
    // Sin separadores: sólo sirve si ya viene con el largo completo, porque el corte
    // entre punto de venta y número no se puede inferir (ver nota del encabezado).
    const d = partes[0];
    if (d.length === LARGO_PV_CORTO + LARGO_NUMERO) {
      pv = d.slice(0, LARGO_PV_CORTO);
      numero = d.slice(LARGO_PV_CORTO);
    } else if (d.length === LARGO_PV_LARGO + LARGO_NUMERO) {
      pv = d.slice(0, LARGO_PV_LARGO);
      numero = d.slice(LARGO_PV_LARGO);
    } else {
      return null;
    }
  } else {
    // Con separadores: el último bloque es el número, todo lo anterior es el punto de
    // venta. Esto cubre tanto `0001-00000234` como `1/0001-00000234`.
    numero = partes[partes.length - 1];
    pv = partes.slice(0, -1).join('');
  }

  if (!pv || !numero) return null;
  if (numero.length > LARGO_NUMERO || pv.length > LARGO_PV_LARGO) return null;

  const pvPad = pv.padStart(pv.length > LARGO_PV_CORTO ? LARGO_PV_LARGO : LARGO_PV_CORTO, '0');
  const digitos = pvPad + numero.padStart(LARGO_NUMERO, '0');

  return LARGOS_VALIDOS.includes(digitos.length) ? digitos : null;
}

/**
 * Presentación del número. Si no se pudo normalizar devuelve el valor crudo (para no
 * ocultarle al operador lo que realmente hay cargado) o `—` si está vacío.
 */
export function formatNroComprobante(raw: string | null | undefined): string {
  const digitos = normalizarNroComprobante(raw);
  if (!digitos) {
    const s = raw == null ? '' : String(raw).trim();
    return s || '—';
  }
  return digitos.length === LARGO_PV_LARGO + LARGO_NUMERO
    ? `${digitos.slice(0, 1)}/${digitos.slice(1, LARGO_PV_LARGO)}-${digitos.slice(LARGO_PV_LARGO)}`
    : `${digitos.slice(0, LARGO_PV_CORTO)}-${digitos.slice(LARGO_PV_CORTO)}`;
}

export interface ResultadoNro {
  ok: boolean;
  /** Forma canónica lista para mandar al back. `null` si no es válido. */
  digitos: string | null;
  /** Forma de presentación. */
  display: string;
  /** Motivo, en lenguaje del operador. `null` si `ok`. */
  error: string | null;
}

/** Valida un número de comprobante y devuelve, de una, la forma normalizada y la de display. */
export function validarNroComprobante(raw: string | null | undefined): ResultadoNro {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) {
    return { ok: false, digitos: null, display: '—', error: 'está vacío' };
  }
  const digitos = normalizarNroComprobante(s);
  if (!digitos) {
    return {
      ok: false,
      digitos: null,
      display: s,
      error: `«${s}» no tiene el formato ${FORMATO_ESPERADO} (${LARGOS_VALIDOS.join(' o ')} dígitos)`,
    };
  }
  return { ok: true, digitos, display: formatNroComprobante(digitos), error: null };
}
