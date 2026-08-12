import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

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
  fondo = '#12327a',
  style,
  wrapperStyle,
}: {
  /** Contenido de la burbuja. Si es string, también se usa como `title` nativo. */
  texto: ReactNode;
  children: ReactNode;
  ancho?: number;
  /** Color de fondo de la burbuja. */
  fondo?: string;
  /** Estilo de la burbuja. */
  style?: CSSProperties;
  /** Estilo del wrapper que envuelve a los hijos (el target del hover). */
  wrapperStyle?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const mostrar = () => {
    const caja = ref.current?.getBoundingClientRect();
    if (!caja) return;
    // Centrado sobre el elemento, acotado al viewport para que no se escape por el
    // borde derecho.
    const left = Math.min(
      Math.max(8, caja.left + caja.width / 2 - ancho / 2),
      window.innerWidth - ancho - 8,
    );
    setPos({ top: caja.top, left });
  };

  const burbuja: CSSProperties = {
    position: 'fixed',
    top: (pos?.top ?? 0) - 8,
    left: pos?.left ?? 0,
    transform: 'translateY(-100%)',
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
      onMouseLeave={() => setPos(null)}
      style={{ display: 'inline-flex', ...wrapperStyle }}
    >
      {children}
      {pos && <span style={burbuja}>{texto}</span>}
    </span>
  );
}
