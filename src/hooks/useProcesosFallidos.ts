import { useMemo } from 'react';
import { useSse } from '../context/sse-context';
import type { ProcesoSnapshot } from '../types/events';

/** Texto para el operador según el `errorCode` persistido en el job. */
const MENSAJE_POR_CODE: Record<string, string> = {
  PDF_PARSE_FAILED: 'No se pudo leer el PDF (¿es un escaneo sin OCR?).',
  LLM_UNAVAILABLE: 'El servicio de IA no respondió. Volvé a subir el comprobante.',
  LLM_EMPTY_RESPONSE: 'La IA no pudo extraer datos del comprobante.',
  LLM_INVALID_RESPONSE: 'La IA devolvió datos que no se pudieron interpretar.',
  JOB_NOT_FOUND: 'El proceso ya no existe.',
  EMPRESA_URL_INVALID: 'La empresa no tiene configurada la URL de integración.',
  // Lo marca el reaper cuando un job quedó en curso sin nadie trabajándolo.
  JOB_ABANDONADO: 'El proceso quedó interrumpido. Volvé a subir el comprobante.',
};

export interface ProcesoFallido {
  processId: string;
  /** `extraccion` invalida el comprobante; `orden_compra` sólo el cruce de precios. */
  etapa: 'extraccion' | 'orden_compra';
  mensaje: string;
  errorCode: string | null;
  createdAt: string;
}

/**
 * Procesos que terminaron mal, derivados del estado persistido del job.
 *
 * ## Por qué existe
 *
 * Un fallo definitivo era **invisible**. El job quedaba en `error` en la base y no
 * había ninguna pantalla que lo consultara: el operador veía que su comprobante no
 * aparecía y no tenía forma de saber si estaba tardando o si había fallado. La única
 * señal era un evento SSE efímero — si estaba desconectado en ese momento, se perdía
 * para siempre.
 *
 * Esto es la alternativa al inbox de notificaciones, y para este caso es mejor: el
 * estado de error **es consultable y accionable** (se puede reintentar), mientras que
 * una notificación leída desaparece. Un inbox sólo hace falta cuando el aviso es el
 * único registro del hecho, y acá el hecho vive en la tabla.
 *
 * ## Las dos etapas se reportan distinto, a propósito
 *
 * Un fallo de extracción significa que **no hay comprobante**: hay que volver a
 * subirlo. Un fallo de orden de compra significa que los remitos están bien pero no se
 * pudieron cruzar contra la orden: se puede seguir trabajando. Mostrarlos con la misma
 * severidad haría que el operador tratara el segundo como el primero — y que dejara de
 * mirar los dos.
 */
export function useProcesosFallidos(): ProcesoFallido[] {
  const { procesosActivos } = useSse();

  return useMemo(() => {
    const fallidos: ProcesoFallido[] = [];

    for (const p of procesosActivos) {
      if (p.estadoExtraccion === 'error') {
        fallidos.push({
          processId: p.processId,
          etapa: 'extraccion',
          mensaje: mensajeDe(p, 'No se pudo procesar el comprobante.'),
          errorCode: p.errorCode,
          createdAt: p.createdAt,
        });
      } else if (p.estadoOc === 'error') {
        fallidos.push({
          processId: p.processId,
          etapa: 'orden_compra',
          mensaje: mensajeDe(p, 'No se pudo verificar contra la orden de compra.'),
          errorCode: p.errorCode,
          createdAt: p.createdAt,
        });
      }
    }

    return fallidos;
  }, [procesosActivos]);
}

function mensajeDe(p: ProcesoSnapshot, fallback: string): string {
  return (p.errorCode && MENSAJE_POR_CODE[p.errorCode]) || fallback;
}
