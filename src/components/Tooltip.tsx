import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Tooltip de burbuja con posición `fixed`.
 *
 * `position: fixed` con coordenadas medidas (`getBoundingClientRect`), y no
 * `absolute`: las listas de artículos viven dentro de contenedores con
 * `overflow: auto`, y eso crea un contexto de recorte que se come cualquier hijo
 * posicionado en ambos ejes (el spec computa `overflow-x: visible` a `auto` cuando
 * el otro eje no es visible). Con `absolute` la burbuja de la primera y la última
 * fila quedaba cortada.
 *
 * Se abre arriba del target y se voltea abajo si no entra (p. ej. en la barra
 * superior, donde arriba no queda viewport). El volteo se decide midiendo la burbuja
 * ya renderizada en un `useLayoutEffect` — antes del paint, así no parpadea — en vez
 * de estimar su alto, que depende del largo del texto.
 *
 * El `title` nativo se mantiene como fallback en touch (donde no hay hover) y para
 * lectores de pantalla, siempre que el texto sea string.
 *
 * No usa animaciones CSS a propósito: el proyecto no tiene ni una `@keyframes` y los
 * estilos son todos inline.
 */
export function Tooltip({
  texto,
  children,
  ancho = 240,
  fondo = '#496cbd',
  style,
  wrapperStyle,
}: {
  /** Contenido de la burbuja. Si es string, también se usa como `title` nativo. */
  texto: ReactNode;
  children: ReactNode;
  ancho?: number;
  /** Color de fondo de la burbuja (azul por defecto, ámbar para advertencias). */
  fondo?: string;
  /** Estilo de la burbuja. */
  style?: CSSProperties;
  /** Estilo del wrapper que envuelve a los hijos (el target del hover). */
  wrapperStyle?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const burbujaRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ arriba: number; abajo: number; left: number } | null>(null);
  const [volteada, setVolteada] = useState(false);

  const mostrar = () => {
    const caja = ref.current?.getBoundingClientRect();
    if (!caja) return;
    // Centrado sobre el elemento, acotado al viewport para que no se escape por el
    // borde derecho.
    const left = Math.min(
      Math.max(8, caja.left + caja.width / 2 - ancho / 2),
      window.innerWidth - ancho - 8,
    );
    setVolteada(false);
    setPos({ arriba: caja.top, abajo: caja.bottom, left });
  };

  const ocultar = () => {
    setPos(null);
    setVolteada(false);
  };

  useLayoutEffect(() => {
    if (!pos || volteada) return;
    const caja = burbujaRef.current?.getBoundingClientRect();
    if (caja && caja.top < 8) setVolteada(true);
  }, [pos, volteada]);

  const burbuja: CSSProperties = {
    position: 'fixed',
    top: volteada ? (pos?.abajo ?? 0) + 8 : (pos?.arriba ?? 0) - 8,
    left: pos?.left ?? 0,
    transform: volteada ? 'none' : 'translateY(-100%)',
    zIndex: 60,
    width: ancho,
    background: fondo,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.35,
    padding: '7px 10px',
    borderRadius: 7,
    boxShadow: '0 6px 20px rgba(18,50,122,.22)',
    whiteSpace: 'pre-line',
    pointerEvents: 'none',
    ...style,
  };

  return (
    <span
      ref={ref}
      title={typeof texto === 'string' ? texto : undefined}
      onMouseEnter={mostrar}
      onMouseLeave={ocultar}
      style={{ display: 'inline-flex', ...wrapperStyle }}
    >
      {children}
      {pos && (
        <span ref={burbujaRef} style={burbuja}>
          {texto}
        </span>
      )}
    </span>
  );
}
