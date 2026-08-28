import type { ReactNode } from 'react';
import type { EstadoOrdenCompra } from '../hooks/useOrdenCompra';
import { Tooltip } from './Tooltip';

/**
 * Indicadores del cruce contra la orden de compra del proveedor.
 *
 * El spinner es SVG con `<animateTransform>` y no una animación CSS a propósito:
 * el proyecto no tiene ni una `@keyframes` y los estilos son todos inline, así
 * que agregar una regla global sólo para esto rompería la convención.
 */

// --- Spinner -----------------------------------------------------------------

export function Spinner({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: 'none' }} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

// --- Badge del encabezado ----------------------------------------------------

/** Va a la derecha del ESTADO en el encabezado de la card. */
export function BadgeOrdenCompra({ estado }: { estado: EstadoOrdenCompra }) {
  const esFallo = estado === 'fallida';

  return (
    <div
      title={
        esFallo
          ? 'No se pudo consultar la orden de compra del proveedor. Los indicadores de cada artículo pueden estar desactualizados.'
          : 'Se está consultando la orden de compra del proveedor para verificar cantidades y precios.'
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 30,
        padding: '0 12px',
        borderRadius: 99,
        border: `1px solid ${esFallo ? '#f0c6c6' : '#f3dca6'}`,
        background: esFallo ? 'var(--err-weak)' : '#fdf8ec',
        color: esFallo ? 'var(--err)' : 'var(--warn)',
        fontSize: 12.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: 'default',
      }}
    >
      {esFallo ? <IconoAlerta /> : <Spinner />}
      {esFallo ? 'Orden de compra no disponible' : 'Procesando orden de compra'}
    </div>
  );
}

// --- Aviso de artículos que no figuran en el sistema --------------------------

/**
 * Va en el encabezado de la card, al lado del badge de orden de compra.
 *
 * Separado de los semáforos de OC a propósito: son dos preguntas distintas. Los
 * semáforos comparan contra la orden de compra; esto dice si el artículo existe
 * en el catálogo del sistema, que es independiente de cualquier orden.
 *
 * Es INFORMATIVO: reporta el hecho y nada más. Qué pasa después con la carga no
 * se decide acá.
 */
export function BadgeSinErp({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <div
      title={
        `${cantidad} artículo(s) de este remito tienen un código que no existe en el sistema ` +
        'para este proveedor. NO se van a cargar automáticamente: hay que cargarlos a mano.'
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 30,
        padding: '0 12px',
        borderRadius: 99,
        // ÁMBAR y no rojo, igual que la fila y el ícono por artículo.
        //
        // Era rojo cuando esto era el único indicador del problema. Ahora la lista
        // marca lo mismo en tres lugares (badge, resumen, fila) y tenerlos en
        // colores distintos hacía parecer que eran problemas distintos. El rojo
        // quedó reservado para el popup de confirmación, que es donde se enuncia la
        // consecuencia: "esto NO se va a cargar".
        border: '1px solid #f3dca6',
        background: '#fdf8ec',
        color: 'var(--warn)',
        fontSize: 12.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: 'default',
      }}
    >
      <IconoAlerta />
      {cantidad === 1
        ? '1 artículo sin código en el sistema'
        : `${cantidad} artículos sin código en el sistema`}
    </div>
  );
}

/**
 * Marca por fila. `null` (sin verificar) no muestra nada: avisar sobre algo que no
 * se verificó entrena al operador a ignorar el aviso.
 */
export function MarcaSinErp({ existeEnErp }: { existeEnErp: boolean | null | undefined }) {
  if (existeEnErp !== false) return null;
  return (
    <Tooltip
      texto={
        'Este código no figura en el catálogo del sistema. Verificarlo con el proveedor o darlo ' +
        'de alta si corresponde.'
      }
      ancho={240}
      wrapperStyle={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        flex: 'none',
        borderRadius: 6,
        border: '1px solid #f0c6c6',
        background: 'var(--err-weak)',
        color: 'var(--err)',
        cursor: 'help',
      }}
      fondo="#d4412d"
    >
      <IconoAlerta />
    </Tooltip>
  );
}

function IconoAlerta() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" style={{ flex: 'none' }} aria-hidden>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

// --- Iconos por artículo -----------------------------------------------------

export type EstadoMatch = 'procesando' | 'match' | 'sin-match' | 'sin-verificar';

/**
 * Semáforo. Tres colores, tres significados:
 *
 *   amarillo → todavía no hay veredicto (sin verificar, o verificándose ahora)
 *   verde    → coincide con la orden de compra
 *   rojo     → NO coincide
 *
 * `procesando` y `sin-verificar` comparten el amarillo a propósito: para el
 * operador son el mismo hecho ("todavía no sé"). Lo que los distingue no es el
 * color sino el spinner, que responde a otra pregunta — "¿tengo que esperar o
 * tengo que hacer algo?".
 *
 * Lo que NO puede pasar es que "sin verificar" sea rojo: un rojo que no significa
 * nada hace que el operador desconfíe de los rojos que sí importan.
 */
const PALETA: Record<EstadoMatch, { color: string; fondo: string; fondoTooltip: string; borde: string }> = {
  procesando: { color: 'var(--warn)', fondo: '#fdf8ec', fondoTooltip: '#c99c3d', borde: '#f3dca6' },
  'sin-verificar': { color: 'var(--warn)', fondo: '#fdf8ec', fondoTooltip: '#c99c3d', borde: '#f3dca6' },
  match: { color: 'var(--ok)', fondo: '#eefaf2', fondoTooltip: '#25a54f', borde: '#bfe6ce' },
  'sin-match': { color: 'var(--err)', fondo: 'var(--err-weak)', fondoTooltip: '#d4412d', borde: '#f0c6c6' },
};

/**
 * Textos base. La cantidad se compara contra el SALDO PENDIENTE de la línea de OC
 * (lo que falta recibir), no contra la cantidad pedida original: con una recepción
 * parcial, comparar contra lo pedido nunca daba match y el operador veía rojos que
 * no significaban nada.
 */
const TOOLTIPS: Record<'precio' | 'stock', Record<EstadoMatch, string>> = {
  precio: {
    procesando: 'Precio: verificando contra la orden de compra…',
    match: 'Precio: coincide con la orden de compra',
    'sin-match': 'Precio: NO coincide con la orden de compra (o el artículo no figura en ella)',
    'sin-verificar': 'Precio: pendiente de verificar. Se controla al cargar la factura.',
  },
  stock: {
    procesando: 'Cantidad: verificando contra la orden de compra…',
    match: 'Cantidad: coincide con el saldo pendiente de la orden de compra',
    'sin-match':
      'Cantidad: NO coincide con el saldo pendiente de la orden de compra (o el artículo no figura en ella)',
    'sin-verificar': 'Cantidad: pendiente de verificar. Se controla al cargar la factura.',
  },
};

/**
 * Agrega la referencia a la línea imputada.
 *
 * Saber CONTRA QUÉ se comparó es la mitad de la información: un rojo sin la línea
 * de OC no le dice al operador dónde mirar, y un verde sin ella no se puede
 * auditar. Cuando el artículo no tomó ninguna línea, eso también es el dato.
 */
function conReferenciaOc(
  texto: string,
  estado: EstadoMatch,
  oc: { numero: number | null; linea: number | null },
): string {
  if (estado === 'procesando' || estado === 'sin-verificar') return texto;
  if (oc.numero == null) return `${texto}\nNo se imputó a ninguna línea de orden de compra.`;
  const linea = oc.linea != null ? ` línea ${oc.linea}` : '';
  return `${texto}\nImputado a la OC ${oc.numero}${linea}.`;
}

/** `null`/`undefined` = sin verificar. Ver la nota de `Articulo` en types/api.ts. */
function estadoDeFlag(flag: boolean | null | undefined): EstadoMatch {
  if (flag === true) return 'match';
  if (flag === false) return 'sin-match';
  return 'sin-verificar';
}

const ANCHO_TOOLTIP = 220;

/**
 * Icono del semáforo con su tooltip. La burbuja `fixed` la resuelve `Tooltip`
 * (compartido con las advertencias por campo); acá sólo se le da la caja de color
 * según la paleta del estado.
 */
function IconoConTooltip({
  estado,
  texto,
  children,
}: {
  estado: EstadoMatch;
  texto: string;
  children: ReactNode;
}) {
  const paleta = PALETA[estado];
  return (
    <Tooltip
      texto={texto}
      ancho={ANCHO_TOOLTIP}
      wrapperStyle={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        flex: 'none',
        borderRadius: 6,
        border: `1px solid ${paleta.borde}`,
        background: paleta.fondo,
        color: paleta.color,
        cursor: 'help',
      }}
      fondo={paleta.fondoTooltip}
    >
      {children}
    </Tooltip>
  );
}

function IconoPrecio() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v20" />
      <path d="M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2.2 3 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3" />
    </svg>
  );
}

function IconoStock() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 8v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8" />
      <path d="M2 4.5h20V8H2z" />
      <path d="M10 12h4" />
    </svg>
  );
}

/**
 * Par de indicadores ($ y caja) de un artículo.
 *
 * `estado` unifica los dos casos porque mientras se consulta la orden de compra
 * ninguno de los dos flags es confiable todavía.
 */
export function IconosMatch({
  estado,
  precioMatch,
  stockMatch,
  ocNumero = null,
  ocLinea = null,
}: {
  estado: 'procesando' | 'resuelto';
  precioMatch: boolean | null | undefined;
  stockMatch: boolean | null | undefined;
  /** Línea de OC imputada. Se muestra en el tooltip para poder auditar el veredicto. */
  ocNumero?: number | null;
  ocLinea?: number | null;
}) {
  const estadoPrecio: EstadoMatch = estado === 'procesando' ? 'procesando' : estadoDeFlag(precioMatch);
  const estadoStock: EstadoMatch = estado === 'procesando' ? 'procesando' : estadoDeFlag(stockMatch);
  const oc = { numero: ocNumero, linea: ocLinea };

  return (
    <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
      <IconoConTooltip
        estado={estadoPrecio}
        texto={conReferenciaOc(TOOLTIPS.precio[estadoPrecio], estadoPrecio, oc)}
      >
        <IconoPrecio />
      </IconoConTooltip>
      <IconoConTooltip
        estado={estadoStock}
        texto={conReferenciaOc(TOOLTIPS.stock[estadoStock], estadoStock, oc)}
      >
        <IconoStock />
      </IconoConTooltip>
    </span>
  );
}
