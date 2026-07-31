import { createContext, useContext } from 'react';
import type { DomainEvent, DomainEventType, ProcesoSnapshot } from '../types/events';

export type EstadoConexion = 'conectando' | 'conectado' | 'desconectado';

export type SseHandler = (evento: DomainEvent) => void;

/** '*' recibe todos los eventos de dominio. */
export type SuscripcionTipo = DomainEventType | '*';

export interface SseContextValue {
  estado: EstadoConexion;

  /**
   * Registra un handler. Devuelve la función para desuscribirse.
   *
   * Es estable entre renders (sólo toca refs), así que se puede usar como
   * dependencia de un useEffect sin provocar reconexiones.
   */
  subscribe: (tipo: SuscripcionTipo, handler: SseHandler) => () => void;

  /**
   * Último evento visto de un proceso, aunque no hubiera nadie suscrito cuando
   * llegó.
   *
   * Existe por una carrera real: el back publica `proceso.encolado` ANTES de
   * responder el POST /facturas, así que la pantalla todavía no sabe qué
   * processId mirar. Si el proceso fuera muy rápido, hasta el
   * `proceso.completado` podría llegar antes y la pantalla quedaría colgada en
   * "Procesando…". Con esto, quien se suscribe tarde arranca del último estado
   * conocido en vez de arrancar ciego.
   */
  ultimoEvento: (processId: string) => DomainEvent | undefined;

  /**
   * Procesos en curso **del usuario conectado**, según el último snapshot.
   * No incluye los de sus compañeros: el pipeline viaja por el canal personal.
   */
  procesosActivos: ProcesoSnapshot[];
}

export const SseContext = createContext<SseContextValue | null>(null);

export function useSse(): SseContextValue {
  const ctx = useContext(SseContext);
  if (!ctx) throw new Error('useSse debe usarse dentro de SseProvider');
  return ctx;
}
