import { useCallback, useEffect, useRef, useState } from 'react';
import { useSse } from '../context/sse-context';
import type { DomainEvent } from '../types/events';

export type EstadoOrdenCompra = 'procesando' | 'fallida';

/**
 * Piso de visibilidad del spinner.
 *
 * Contra un mock local el ciclo entero (encolado → iniciada → progreso →
 * completado) cierra en menos de 100ms: el spinner aparecía y desaparecía en el
 * mismo frame. Es maquillaje de UI y no cambia el estado real — un fallo pasa a
 * 'fallida' de inmediato, sin esperar.
 */
const MIN_VISIBLE_MS = 900;

/**
 * Red de seguridad. Si el evento terminal nunca llega (worker muerto, evento
 * perdido, canal mal ruteado), el spinner se apaga solo en vez de quedar girando
 * para siempre.
 *
 * Un indicador de "procesando" que no puede apagarse es peor que no tenerlo: el
 * usuario deja de creerle.
 */
const TIMEOUT_SEGURIDAD_MS = 45_000;

export interface OrdenCompraTracker {
  /** Estado por `jobId`. */
  estados: Record<string, EstadoOrdenCompra>;
  /**
   * Marca un job como en proceso desde el lado del cliente.
   *
   * Se llama al disparar la acción, sin esperar el evento del bus. Es deliberado:
   * el front SABE que acaba de pedir una validación, así que no necesita que el
   * servidor se lo confirme para mostrar el spinner.
   *
   * Depender sólo de los eventos hacía que el indicador fuera frágil por diseño:
   * la ventana entre `proceso.encolado` y `proceso.completado` puede ser de 150ms,
   * y cualquier evento perdido dejaba al usuario sin ninguna señal de que algo
   * estaba pasando. Los eventos siguen usándose para APAGARLO y para el estado de
   * fallo, que es lo que el cliente no puede saber por su cuenta.
   */
  marcarEnProceso: (jobId: string) => void;
}

/**
 * Estado de la validación contra la orden de compra, indexado por `jobId`.
 *
 * El flujo publica su progreso con `processId = jobId` y `stage: 'orden_compra'`
 * (ver OrderProcessor), así que un remito se sigue por su `r.jobId`.
 *
 * Un solo hook con un solo juego de suscripciones para toda la pantalla: no se
 * puede llamar un hook por fila, y tampoco haría falta — el stream es uno.
 *
 * **Límite conocido:** el estado vive en memoria y no sobrevive a un refresh. Lo
 * resuelve la entidad `proceso` persistida (etapa 4), que va a permitir
 * reconstruirlo desde el snapshot del stream en vez de inferirlo de eventos.
 */
export function useOrdenCompra(): OrdenCompraTracker {
  const { subscribe, procesosActivos } = useSse();
  const [estados, setEstados] = useState<Record<string, EstadoOrdenCompra>>({});

  const iniciosRef = useRef<Record<string, number>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seguridadRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const quitar = useCallback((jobId: string) => {
    delete iniciosRef.current[jobId];
    delete timersRef.current[jobId];
    const seguridad = seguridadRef.current[jobId];
    if (seguridad) {
      clearTimeout(seguridad);
      delete seguridadRef.current[jobId];
    }
    setEstados((prev) => {
      if (!(jobId in prev)) return prev;
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
  }, []);

  const marcar = useCallback(
    (jobId: string, estado: EstadoOrdenCompra) => {
      if (estado === 'procesando' && !iniciosRef.current[jobId]) {
        iniciosRef.current[jobId] = Date.now();
      }
      // Un cierre pendiente ya no aplica si el proceso volvió a arrancar.
      const pendiente = timersRef.current[jobId];
      if (pendiente) {
        clearTimeout(pendiente);
        delete timersRef.current[jobId];
      }
      if (!seguridadRef.current[jobId]) {
        seguridadRef.current[jobId] = setTimeout(() => quitar(jobId), TIMEOUT_SEGURIDAD_MS);
      }
      setEstados((prev) => (prev[jobId] === estado ? prev : { ...prev, [jobId]: estado }));
    },
    [quitar],
  );

  const marcarEnProceso = useCallback((jobId: string) => marcar(jobId, 'procesando'), [marcar]);

  /**
   * Reconstrucción desde el snapshot del stream.
   *
   * Esto es lo que hace que el spinner **sobreviva a un refresh**. El snapshot llega
   * al conectar y al reconectar, con el estado persistido de cada etapa; hasta que la
   * etapa 2 empezó a escribir `estado_oc`, no había nada que reconstruir y este hook
   * dependía enteramente de eventos efímeros.
   *
   * No reemplaza a `marcarEnProceso`: son complementarios. El marcado optimista da
   * feedback en el mismo frame del click, antes de cualquier ida al servidor; el
   * snapshot cubre el caso de volver a una sesión con algo en vuelo. Ninguno de los
   * dos hace redundante al otro.
   */
  useEffect(() => {
    for (const proceso of procesosActivos) {
      if (proceso.estadoOc === 'corriendo') marcar(proceso.processId, 'procesando');
      else if (proceso.estadoOc === 'error') marcar(proceso.processId, 'fallida');
    }
  }, [procesosActivos, marcar]);

  useEffect(() => {
    // El pipeline de extracción usa el MISMO processId (el jobId) y los mismos
    // tipos de evento. Lo único que los distingue es el `stage`: sin este filtro,
    // el `proceso.completado` del LLM apagaría un spinner de orden de compra que
    // recién arranca.
    const esDeOrdenCompra = (evento: DomainEvent) => evento.stage === 'orden_compra';

    /** Cierra respetando el piso de visibilidad. */
    const limpiar = (jobId: string) => {
      const inicio = iniciosRef.current[jobId];
      const restante = inicio ? MIN_VISIBLE_MS - (Date.now() - inicio) : 0;
      if (restante <= 0) return quitar(jobId);

      const pendiente = timersRef.current[jobId];
      if (pendiente) clearTimeout(pendiente);
      timersRef.current[jobId] = setTimeout(() => quitar(jobId), restante);
    };

    const enCurso = (evento: DomainEvent) => {
      if (esDeOrdenCompra(evento)) marcar(evento.processId, 'procesando');
    };

    const desuscribir = [
      subscribe('proceso.encolado', enCurso),
      subscribe('proceso.etapa.iniciada', enCurso),
      subscribe('proceso.etapa.progreso', enCurso),
      subscribe('proceso.completado', (evento) => {
        if (esDeOrdenCompra(evento)) limpiar(evento.processId);
      }),
      subscribe('proceso.fallido', (evento) => {
        // El fallo no espera el piso: es información que el usuario necesita ya.
        if (esDeOrdenCompra(evento)) marcar(evento.processId, 'fallida');
      }),
    ];

    return () => {
      desuscribir.forEach((fn) => fn());
      Object.values(timersRef.current).forEach(clearTimeout);
      Object.values(seguridadRef.current).forEach(clearTimeout);
    };
  }, [subscribe, marcar, quitar]);

  return { estados, marcarEnProceso };
}
