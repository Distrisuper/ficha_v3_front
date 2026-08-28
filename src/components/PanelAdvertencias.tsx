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
  /**
   * Variante ROJA, para lo que no se va a cargar.
   *
   * Se agregó con la carga parcial de remitos: un artículo cuyo código no existe
   * en el catálogo del sistema NO entra, y el operador lo tiene que cargar a mano
   * por afuera. Eso es una consecuencia distinta de "revisá este número": no se
   * arregla corrigiendo el comprobante, y si pasa desapercibida queda mercadería
   * sin cargar en el sistema.
   *
   * Ojo con el criterio general de la app (ver docblock de abajo): el rojo acá NO
   * significa "el proceso falló" ni "no podés continuar" — la carga se puede
   * aceptar igual. Significa "esto queda afuera y alguien tiene que hacerse
   * cargo", que es la única otra cosa que amerita romper el ámbar.
   */
  tono?: 'aviso' | 'excluido';
  style?: CSSProperties;
}

/**
 * Cuadro de advertencias previas a la carga. Ámbar por defecto.
 *
 * Amarillo y no rojo a propósito: no es un fallo del sistema, es un comprobante que
 * necesita corrección. El rojo de esta app ya significa "el proceso falló" (ver los
 * avisos de `procesosFallidos` en Pendientes) y mezclarlos haría que el operador
 * tratara un dato mal tipeado como un error de la aplicación.
 *
 * La excepción es `tono="excluido"`: artículos que NO se van a cargar. Ahí el rojo
 * está justificado porque la consecuencia es material —queda mercadería afuera— y
 * no se arregla corrigiendo un campo.
 */
export function PanelAdvertencias({ advertencias, titulo, compacto, nota, tono = 'aviso', style }: Props) {
  if (advertencias.length === 0) return null;

  const errores = advertencias.filter((a) => a.nivel === 'error').length;
  const excluido = tono === 'excluido';

  const paleta = excluido
    ? { fondo: 'var(--err-weak)', borde: '#f0c6c6', color: 'var(--err)' }
    : { fondo: '#fdf8ec', borde: '#f3dca6', color: 'var(--warn)' };

  return (
    <div
      role="alert"
      style={{
        background: compacto ? 'transparent' : paleta.fondo,
        border: compacto ? 'none' : `1px solid ${paleta.borde}`,
        borderRadius: 8,
        padding: compacto ? 0 : '11px 14px',
        fontSize: 13,
        color: paleta.color,
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
            {/* En el panel rojo el contador sobra: el título ya dice cuántos son
                y "a corregir" sería engañoso — no se corrigen acá, se cargan a mano. */}
            {errores > 0 && !compacto && !excluido && (
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
