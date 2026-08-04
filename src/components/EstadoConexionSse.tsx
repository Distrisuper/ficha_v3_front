import { useSse } from '../context/sse-context';
import { Spinner } from './OrdenCompra';

/**
 * Indicador del estado del stream de eventos.
 *
 * ## Por qué hace falta
 *
 * `SseContext` calculaba `estado` desde el principio y **ningún componente lo
 * consumía**. Consecuencia: el stream podía quedar caído indefinidamente —por un
 * loop de reconexión, un proxy que corta sin cerrar el socket, o un ticket que falla
 * siempre— y el usuario seguía viendo la pantalla de Pendientes con datos viejos
 * **creyendo que estaban al día**.
 *
 * Para una pantalla operativa donde varias personas se coordinan en vivo, eso es
 * peor que un error visible: la app miente en silencio.
 *
 * No se muestra nada cuando está conectado. Un indicador verde permanente es ruido
 * que la gente deja de mirar; lo que importa es que se note cuando NO está.
 */
export function EstadoConexionSse() {
  const { estado } = useSse();

  if (estado === 'conectado') return null;

  const conectando = estado === 'conectando';

  return (
    <div
      role="status"
      title={
        conectando
          ? 'Reconectando al canal de eventos. Los cambios de tus compañeros pueden tardar en aparecer.'
          : 'Sin conexión al canal de eventos. La pantalla NO se está actualizando en tiempo real: recargá para ver el estado actual.'
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        height: 28,
        padding: '0 11px',
        borderRadius: 99,
        border: `1px solid ${conectando ? '#f3dca6' : '#f0c6c6'}`,
        background: conectando ? '#fdf8ec' : 'var(--err-weak)',
        color: conectando ? 'var(--warn)' : 'var(--err)',
        fontSize: 12.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: 'help',
      }}
    >
      {conectando ? <Spinner size={12} /> : <IconoSinConexion />}
      {conectando ? 'Reconectando…' : 'Sin tiempo real'}
    </div>
  );
}

function IconoSinConexion() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      style={{ flex: 'none' }}
      aria-hidden
    >
      <path d="M2 2l20 20" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 12.9a10 10 0 0 1 5.2-2.7" />
      <path d="M13.8 10.2A10 10 0 0 1 19 12.9" />
      <path d="M12 20h.01" />
    </svg>
  );
}
