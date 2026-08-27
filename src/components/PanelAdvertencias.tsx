import type { CSSProperties, ReactNode } from 'react';
import type { Advertencia } from '../utils/validacionFactura';

interface Props {
  advertencias: Advertencia[];
  /** Encabezado del cuadro. */
  titulo?: string;
  /** Variante compacta, sin fondo ni borde, para meter adentro del modal. */
  compacto?: boolean;
  /** Texto al pie de la lista, para la consecuencia de cargar igual. */
  nota?: ReactNode;
  style?: CSSProperties;
}

/**
 * Cuadro amarillo de advertencias previas a la carga.
 *
 * Amarillo y no rojo a propósito: no es un fallo del sistema, es un comprobante que
 * necesita corrección. El rojo de esta app ya significa "el proceso falló" (ver los
 * avisos de `procesosFallidos` en Pendientes) y mezclarlos haría que el operador
 * tratara un dato mal tipeado como un error de la aplicación.
 */
export function PanelAdvertencias({ advertencias, titulo, compacto, nota, style }: Props) {
  if (advertencias.length === 0) return null;

  const errores = advertencias.filter((a) => a.nivel === 'error').length;

  return (
    <div
      role="alert"
      style={{
        background: compacto ? 'transparent' : '#fdf8ec',
        border: compacto ? 'none' : '1px solid #f3dca6',
        borderRadius: 8,
        padding: compacto ? 0 : '11px 14px',
        fontSize: 13,
        color: 'var(--warn)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        ...style,
      }}
    >
      {!compacto && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flex: 'none', marginTop: 2 }}
        >
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        {titulo && (
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {titulo}
            {errores > 0 && !compacto && (
              <span style={{ fontWeight: 600, opacity: 0.85 }}>
                {' '}
                · {errores} {errores === 1 ? 'problema' : 'problemas'} a corregir
              </span>
            )}
          </div>
        )}
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.4 }}>
          {advertencias.map((a) => (
            <li key={a.id} style={{ opacity: a.nivel === 'aviso' ? 0.85 : 1 }}>
              {a.mensaje}
            </li>
          ))}
        </ul>
        {nota && <div style={{ marginTop: 8, opacity: 0.9 }}>{nota}</div>}
      </div>
    </div>
  );
}
