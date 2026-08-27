import type { CSSProperties, ReactNode } from 'react';
import type { Remito } from '../types/api';
import { money } from '../utils/money';
import { desglosePercepciones, percepcionSinDesglosar } from '../utils/percepciones';

/** Fondo gris claro de la burbuja del desglose. */
export const TOOLTIP_DESGLOSE_BG = '#eef1f6';

/**
 * Estilo de la burbuja para el tooltip del desglose.
 *
 * `Tooltip` hardcodea `color: '#fff'` en la burbuja porque sus fondos son
 * oscuros (azul informativo, ámbar de advertencia). Con fondo gris claro el
 * texto blanco queda ilegible, así que hay que pisar el color — para eso está la
 * prop `style`, que se spreadea DESPUÉS del estilo base.
 *
 * Y como el gris es casi del color de la tarjeta, la burbuja necesita borde: sin
 * él no se distingue del fondo y parece texto flotando. La sombra también se
 * baja, porque la que trae por defecto está calibrada para una burbuja oscura.
 */
export const estiloTooltipDesglose: CSSProperties = {
  color: 'var(--ink)',
  border: '1px solid var(--border)',
  boxShadow: '0 6px 20px rgba(18,50,122,.14)',
};

/**
 * Contenido del tooltip que abre el monto de "Percepciones".
 *
 * El pie de la factura muestra el TOTAL, que es lo que el operador necesita para
 * cuadrar. Pero el total solo no le dice si la IA leyó bien: dos facturas con
 * $22.124,72 de percepciones pueden ser "todo IIBB Buenos Aires" o
 * "IIBB Buenos Aires + IIBB Santa Fe", y eso cambia a qué cuenta contable va cada
 * peso del otro lado. Esto lo muestra sin ocupar lugar en la pantalla.
 *
 * Devuelve `null` cuando no hay nada que aportar, y de eso depende que el número
 * NO se muestre subrayado prometiendo información que no existe. Dos casos
 * legítimos: percepciones en 0, y comprobantes procesados antes de que la IA
 * clasificara el desglose (de esos sólo se conoce el total).
 */
export function contenidoDesglosePercepciones(
  remitos: Remito[],
  total: number,
): ReactNode | null {
  if (Math.abs(total) < 0.01) return null;
  const lineas = desglosePercepciones(remitos);
  if (lineas.length === 0) return null;

  // Lo que el total dice y el desglose no explica. Se muestra en vez de
  // esconderse: si el operador corrigió el total a mano, o el comprobante viene
  // de antes del desglose, el tooltip tiene que cerrar contra el número que está
  // mirando. Un tooltip que suma distinto que el total de al lado es peor que no
  // tener tooltip.
  const resto = percepcionSinDesglosar(remitos, total);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
      {lineas.map((l) => (
        <div key={l.nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>
            {l.nombre}
            {l.descripciones.length > 0 && (
              // Los dos textos cumplen funciones distintas: la categoría es lo que
              // el ERP mapea a su código de percepción, y el texto del proveedor es
              // lo que el operador puede encontrar en el PDF que tiene al lado. El
              // crudo va en segundo plano porque es el de apoyo.
              //
              // `var(--muted)` y no `opacity`: sobre fondo claro, bajar la opacidad
              // acerca el texto al gris del fondo y se vuelve ilegible. Un color
              // más suave mantiene el contraste.
              <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11.5 }}>
                {l.descripciones.join(' · ')}
              </span>
            )}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {money(l.monto)}
          </span>
        </div>
      ))}
      {Math.abs(resto) >= 0.01 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            color: 'var(--muted)',
            // Separador oscuro: sobre gris claro, un borde blanco es invisible.
            borderTop: '1px solid var(--border-2)',
            paddingTop: 5,
          }}
        >
          <span>Sin desglosar</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {money(resto)}
          </span>
        </div>
      )}
    </div>
  );
}
