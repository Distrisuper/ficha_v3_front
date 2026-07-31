import { useEffect, useState } from 'react';
import { useSse } from '../context/sse-context';
import type { DomainEvent, ProcesoStage } from '../types/events';

export type EstadoProceso = 'inactivo' | 'en_curso' | 'completado' | 'fallido';

export interface VistaProceso {
  estado: EstadoProceso;
  stage?: ProcesoStage;
  /** 0-100. Aproximación para la barra: ver PCT_POR_STAGE. */
  pct: number;
  error?: string;
  /** Payload del evento terminal (por ejemplo `{ remitos: 3 }`). */
  resultado?: unknown;
}

export const PROCESO_INICIAL: VistaProceso = { estado: 'inactivo', pct: 0 };

/**
 * Porcentaje por etapa.
 *
 * Es una aproximación deliberada para que la barra avance: el progreso real de
 * una llamada al LLM no es observable. La etiqueta que ve el usuario sale de
 * `stage`, que sí es información verdadera; el número es sólo movimiento.
 */
const PCT_POR_STAGE: Record<ProcesoStage, number> = {
  ocr: 15,
  llm: 45,
  persistencia: 80,
  orden_compra: 90,
};

/**
 * Reduce un evento sobre el estado de la vista.
 *
 * Función pura y exportada a propósito: es toda la lógica del hook y así se
 * puede testear sin React ni una conexión.
 */
export function reducirProceso(prev: VistaProceso, evento: DomainEvent): VistaProceso {
  switch (evento.type) {
    case 'proceso.encolado':
      return { ...prev, estado: 'en_curso', pct: 5 };

    case 'proceso.etapa.iniciada':
    case 'proceso.etapa.progreso':
    case 'proceso.etapa.completada': {
      const pct = evento.stage ? PCT_POR_STAGE[evento.stage] : prev.pct;
      return {
        ...prev,
        estado: 'en_curso',
        stage: evento.stage ?? prev.stage,
        // Nunca retroceder. El dedup por seq ya evita el caso normal, pero dos
        // etapas concurrentes (cuando haya pipeline real) podrían desordenarse.
        pct: Math.max(prev.pct, pct),
      };
    }

    case 'proceso.completado':
      return { ...prev, estado: 'completado', pct: 100, resultado: evento.payload };

    case 'proceso.fallido': {
      const payload = evento.payload as { message?: string } | undefined;
      return {
        ...prev,
        estado: 'fallido',
        error: payload?.message ?? 'El procesamiento falló',
      };
    }

    default:
      return prev;
  }
}

/**
 * Sigue un proceso puntual sobre el stream global.
 *
 * El canal es de la empresa, así que llegan eventos de todos los procesos: el
 * filtrado por `processId` es responsabilidad del consumidor. Eso es lo que
 * permite que una sola conexión sirva a N pantallas siguiendo N procesos.
 */
export function useProceso(processId: string | null): VistaProceso {
  const { subscribe, ultimoEvento } = useSse();
  const [vista, setVista] = useState<VistaProceso>(PROCESO_INICIAL);

  useEffect(() => {
    if (!processId) {
      setVista(PROCESO_INICIAL);
      return;
    }

    // Arranque desde lo último que se vio de este proceso, si ya pasó algo.
    // El back publica `proceso.encolado` antes de responder el POST, así que
    // siempre hay al menos un evento perdido; y si el proceso fuese muy rápido
    // podría estar perdido hasta el `proceso.completado`.
    const previo = ultimoEvento(processId);
    setVista(
      previo
        ? reducirProceso({ estado: 'en_curso', pct: 5 }, previo)
        : { estado: 'en_curso', pct: 5 },
    );

    return subscribe('*', (evento) => {
      if (evento.processId !== processId) return;
      setVista((prev) => reducirProceso(prev, evento));
    });
  }, [processId, subscribe, ultimoEvento]);

  return vista;
}
