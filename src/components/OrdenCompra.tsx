import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { EstadoOrdenCompra } from '../hooks/useOrdenCompra';

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
const PALETA: Record<EstadoMatch, { color: string; fondo: string; borde: string }> = {
  procesando: { color: 'var(--warn)', fondo: '#fdf8ec', borde: '#f3dca6' },
  'sin-verificar': { color: 'var(--warn)', fondo: '#fdf8ec', borde: '#f3dca6' },
  match: { color: 'var(--ok)', fondo: '#eefaf2', borde: '#bfe6ce' },
  'sin-match': { color: 'var(--err)', fondo: 'var(--err-weak)', borde: '#f0c6c6' },
};

const TOOLTIPS: Record<'precio' | 'stock', Record<EstadoMatch, string>> = {
  precio: {
    procesando: 'Precio: verificando contra la orden de compra…',
    match: 'Precio: coincide con la orden de compra',
    'sin-match': 'Precio: NO coincide con la orden de compra (o el artículo no figura en ella)',
    'sin-verificar': 'Precio: pendiente de verificar. Se controla al cargar la factura.',
  },
  stock: {
    procesando: 'Cantidad: verificando contra la orden de compra…',
    match: 'Cantidad: coincide con la orden de compra',
    'sin-match': 'Cantidad: NO coincide con la orden de compra (o el artículo no figura en ella)',
    'sin-verificar': 'Cantidad: pendiente de verificar. Se controla al cargar la factura.',
  },
};

/** `null`/`undefined` = sin verificar. Ver la nota de `Articulo` en types/api.ts. */
function estadoDeFlag(flag: boolean | null | undefined): EstadoMatch {
  if (flag === true) return 'match';
  if (flag === false) return 'sin-match';
  return 'sin-verificar';
}

const ANCHO_TOOLTIP = 220;

/**
 * Icono con tooltip propio.
 *
 * `position: fixed` con coordenadas medidas, y no `absolute`: la lista de
 * artículos vive dentro de un contenedor con `overflow-y: auto`, y eso crea un
 * contexto de recorte que se come cualquier hijo posicionado — en las dos
 * direcciones, porque el spec computa el `overflow-x: visible` a `auto` cuando el
 * otro eje no es visible. Con `absolute` el tooltip de la primera y la última fila
 * quedaba cortado.
 *
 * El `title` nativo se deja igual: es el fallback en touch (donde no hay hover) y
 * para lectores de pantalla.
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
  const ref = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const paleta = PALETA[estado];

  const mostrar = () => {
    const caja = ref.current?.getBoundingClientRect();
    if (!caja) return;
    // Centrado sobre el icono, acotado al viewport para que no se escape por el
    // borde derecho.
    const left = Math.min(
      Math.max(8, caja.left + caja.width / 2 - ANCHO_TOOLTIP / 2),
      window.innerWidth - ANCHO_TOOLTIP - 8,
    );
    setPos({ top: caja.top, left });
  };

  const burbuja: CSSProperties = {
    position: 'fixed',
    top: (pos?.top ?? 0) - 8,
    left: pos?.left ?? 0,
    transform: 'translateY(-100%)',
    zIndex: 60,
    width: ANCHO_TOOLTIP,
    background: '#12327a',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.35,
    padding: '7px 10px',
    borderRadius: 7,
    boxShadow: '0 6px 20px rgba(18,50,122,.22)',
    pointerEvents: 'none',
  };

  return (
    <span
      ref={ref}
      title={texto}
      onMouseEnter={mostrar}
      onMouseLeave={() => setPos(null)}
      style={{
        display: 'inline-flex',
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
    >
      {children}
      {pos && <span style={burbuja}>{texto}</span>}
    </span>
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
}: {
  estado: 'procesando' | 'resuelto';
  precioMatch: boolean | null | undefined;
  stockMatch: boolean | null | undefined;
}) {
  const estadoPrecio: EstadoMatch = estado === 'procesando' ? 'procesando' : estadoDeFlag(precioMatch);
  const estadoStock: EstadoMatch = estado === 'procesando' ? 'procesando' : estadoDeFlag(stockMatch);

  return (
    <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
      <IconoConTooltip estado={estadoPrecio} texto={TOOLTIPS.precio[estadoPrecio]}>
        <IconoPrecio />
      </IconoConTooltip>
      <IconoConTooltip estado={estadoStock} texto={TOOLTIPS.stock[estadoStock]}>
        <IconoStock />
      </IconoConTooltip>
    </span>
  );
}
