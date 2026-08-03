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

/** Etapas del pipeline de extracción. NO incluye `orden_compra`, que es otro flujo. */
export const STAGES_EXTRACCION: ProcesoStage[] = ['ocr', 'llm', 'persistencia'];

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
/**
 * @param stages etapas que le interesan a este consumidor. **Filtrar por etapa no
 *        es opcional en la práctica**: el flujo de orden de compra publica con el
 *        MISMO `processId` (el jobId) y los mismos tipos de evento que el pipeline
 *        de extracción. Sin esta lista, un `proceso.fallido` de la validación de
 *        orden de compra marcaría la extracción como fallida, aunque el LLM
 *        hubiera terminado bien horas antes.
 *
 *        Los eventos sin `stage` (el `proceso.encolado` de la subida, el
 *        `proceso.completado` del LLM) siempre pasan: son del proceso base.
 */
export function useProceso(processId: string | null, stages?: ProcesoStage[]): VistaProceso {
  const { subscribe, ultimoEvento } = useSse();
  const [vista, setVista] = useState<VistaProceso>(PROCESO_INICIAL);

  // Se serializa para que el array literal del caller no reinicie el effect en
  // cada render.
  const clave = stages?.join(',') ?? '';

  useEffect(() => {
    if (!processId) {
      setVista(PROCESO_INICIAL);
      return;
    }

    const permitidas = clave ? (clave.split(',') as ProcesoStage[]) : null;
    const aplica = (evento: DomainEvent) =>
      evento.processId === processId &&
      (!permitidas || !evento.stage || permitidas.includes(evento.stage));

    // Arranque desde lo último que se vio de este proceso, si ya pasó algo.
    // El back publica `proceso.encolado` antes de responder el POST, así que
    // siempre hay al menos un evento perdido; y si el proceso fuese muy rápido
    // podría estar perdido hasta el `proceso.completado`.
    const previo = ultimoEvento(processId);
    const inicial: VistaProceso = { estado: 'en_curso', pct: 5 };
    setVista(previo && aplica(previo) ? reducirProceso(inicial, previo) : inicial);

    return subscribe('*', (evento) => {
      if (!aplica(evento)) return;
      setVista((prev) => reducirProceso(prev, evento));
    });
  }, [processId, clave, subscribe, ultimoEvento]);

  return vista;
}
