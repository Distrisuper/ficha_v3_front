import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { requestTicket, streamUrl } from '../api/events';
import { useAuth } from './auth-context';
import {
  SseContext,
  type EstadoConexion,
  type SseContextValue,
  type SseHandler,
  type SuscripcionTipo,
} from './sse-context';
import {
  esFrameDeStream,
  type DomainEvent,
  type ProcesoSnapshot,
  type SseFrame,
} from '../types/events';

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/**
 * El server late cada 25s. Si pasan 70 sin recibir nada, la conexión está muerta
 * aunque el navegador no haya disparado `onerror`.
 *
 * Ese caso existe y es el peor de todos: un proxy que corta la conexión sin
 * cerrar el socket deja al EventSource creyendo que sigue conectado para
 * siempre. Sin watchdog, el usuario ve la app "funcionando" y no le llega nada.
 */
const WATCHDOG_MS = 70_000;

/** Backoff exponencial con jitter. */
function backoffMs(intento: number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** intento);
  // El jitter no es adorno: si se cae nginx, TODOS los clientes reconectan en
  // el mismo instante y le pegan a la API en manada apenas vuelve.
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

/**
 * Conexión SSE única de la sesión.
 *
 * Vive acá y no en una pantalla: el stream es de la empresa, no de una vista.
 * Antes el EventSource se abría en NuevoPage y se cerraba al desmontar, así que
 * cambiar de pestaña mientras se procesaba una factura perdía el resultado.
 */
export function SseProvider({ children }: { children: ReactNode }) {
  const { auth, logout } = useAuth();

  const [estado, setEstado] = useState<EstadoConexion>('desconectado');
  const [procesosActivos, setProcesosActivos] = useState<ProcesoSnapshot[]>([]);

  // Handlers en ref y no en state: registrar/desregistrar una suscripción no
  // debe re-renderizar el árbol entero, y los eventos llegan seguido.
  const handlersRef = useRef(new Map<SuscripcionTipo, Set<SseHandler>>());

  // Último seq aplicado por proceso. Es la defensa contra duplicados y contra
  // el solapamiento entre el snapshot y el stream vivo.
  const seqRef = useRef(new Map<string, number>());

  // Último evento por proceso, se haya despachado a alguien o no. Permite que
  // un consumidor que se suscribe tarde no arranque ciego (ver sse-context.ts).
  // Una entrada por proceso: acotado por definición.
  const ultimoEventoRef = useRef(new Map<string, DomainEvent>());

  // logout cambia de identidad en cada render del AuthProvider; en un ref no
  // arrastra la reconexión del stream.
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const subscribe = useCallback((tipo: SuscripcionTipo, handler: SseHandler) => {
    const mapa = handlersRef.current;
    if (!mapa.has(tipo)) mapa.set(tipo, new Set());
    mapa.get(tipo)!.add(handler);

    return () => {
      const set = mapa.get(tipo);
      set?.delete(handler);
      if (set && set.size === 0) mapa.delete(tipo);
    };
  }, []);

  const ultimoEvento = useCallback(
    (processId: string) => ultimoEventoRef.current.get(processId),
    [],
  );

  useEffect(() => {
    if (!auth) {
      setEstado('desconectado');
      setProcesosActivos([]);
      seqRef.current.clear();
      return;
    }

    // Todo el ciclo de vida de la conexión vive en variables locales del effect
    // en vez de refs. Así no hay closures viejas posibles y el cleanup es
    // exactamente "lo que este effect creó".
    let cancelado = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
    let intentos = 0;

    function cerrarConexion() {
      es?.close();
      es = null;
    }

    function limpiarTimers() {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (watchdogTimer) clearTimeout(watchdogTimer);
      reconnectTimer = undefined;
      watchdogTimer = undefined;
    }

    function armarWatchdog() {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => reconectar(), WATCHDOG_MS);
    }

    /**
     * @param inmediato true para cierres planificados (`stream.expirado`), donde
     *        aplicar backoff sería agregar un hueco de varios segundos gratis.
     */
    function reconectar(inmediato = false) {
      if (cancelado) return;
      cerrarConexion();
      limpiarTimers();
      setEstado('conectando');
      reconnectTimer = setTimeout(() => void conectar(), inmediato ? 0 : backoffMs(intentos++));
    }

    async function conectar() {
      if (cancelado) return;
      setEstado('conectando');

      let ticket: string;
      try {
        ticket = await requestTicket();
      } catch (error) {
        // 401 = el JWT venció de verdad. Reintentar es inútil y encima
        // esconde el problema: hay que volver al login.
        if (error instanceof ApiError && error.status === 401) {
          logoutRef.current();
          return;
        }
        reconectar();
        return;
      }

      // El await de arriba pudo tardar: el usuario puede haber cerrado sesión.
      if (cancelado) return;

      es = new EventSource(streamUrl(ticket));

      es.onopen = () => {
        intentos = 0;
        setEstado('conectado');
        armarWatchdog();
      };

      es.onmessage = (m) => {
        armarWatchdog();
        manejarFrame(m.data as string);
      };

      // El ticket es de un solo uso, así que el auto-reconnect nativo de
      // EventSource NO sirve: reintentaría contra la misma URL con un ticket ya
      // quemado. Cerramos y manejamos la reconexión a mano.
      es.onerror = () => reconectar();
    }

    function manejarFrame(raw: string) {
      let frame: SseFrame;
      try {
        frame = JSON.parse(raw) as SseFrame;
      } catch {
        return; // frame ilegible: se ignora, no tira la conexión
      }

      // Los frames de control no son eventos de negocio: los consume esta capa
      // y no llegan a ninguna pantalla. El return temprano además le permite a
      // TypeScript angostar `frame` a DomainEvent abajo, sin cast.
      if (esFrameDeStream(frame)) {
        if (frame.type === 'stream.snapshot') {
          aplicarSnapshot(frame.procesos ?? []);
        } else if (frame.type === 'stream.expirado') {
          // Cierre anunciado por el server, no una caída: reconectar ya, sin
          // backoff. Aplicarlo sería regalar varios segundos de hueco cada
          // media hora.
          reconectar(true);
        }
        // stream.heartbeat: el watchdog ya se rearmó en onmessage.
        return;
      }

      despachar(frame);
    }

    function aplicarSnapshot(procesos: ProcesoSnapshot[]) {
      setProcesosActivos(procesos);
      // Sembrar el seq es lo que evita que el snapshot pise estado más nuevo:
      // snapshot y stream vivo se suscriben en paralelo del lado del server, así
      // que el snapshot puede llegar después de un evento en vivo.
      for (const proceso of procesos) {
        const actual = seqRef.current.get(proceso.processId) ?? 0;
        if (proceso.seq > actual) seqRef.current.set(proceso.processId, proceso.seq);
      }
    }

    function despachar(evento: DomainEvent) {
      const ultimo = seqRef.current.get(evento.processId) ?? 0;
      if (evento.seq <= ultimo) return; // duplicado o fuera de orden
      seqRef.current.set(evento.processId, evento.seq);

      // Se guarda SIEMPRE, haya o no suscriptores: puede que la pantalla que
      // va a mirar este proceso todavía no se haya montado.
      ultimoEventoRef.current.set(evento.processId, evento);

      handlersRef.current.get(evento.type)?.forEach((h) => h(evento));
      handlersRef.current.get('*')?.forEach((h) => h(evento));
    }

    void conectar();

    return () => {
      cancelado = true;
      cerrarConexion();
      limpiarTimers();
      setEstado('desconectado');
    };
    // Sólo la identidad del usuario reconecta. En StrictMode este effect corre
    // dos veces en desarrollo: el guard `cancelado` hace que el primer intento
    // se descarte limpio (a costa de quemar un ticket, que dura 30s).
  }, [auth?.id]);

  const value = useMemo<SseContextValue>(
    () => ({ estado, subscribe, ultimoEvento, procesosActivos }),
    [estado, subscribe, ultimoEvento, procesosActivos],
  );

  return <SseContext.Provider value={value}>{children}</SseContext.Provider>;
}
