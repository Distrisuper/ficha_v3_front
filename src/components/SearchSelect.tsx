import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { coincideBusqueda } from '../utils/texto';

/**
 * Una opción del combobox.
 *
 * `alias` es texto secundario (razón social, CUIT) que se MUESTRA debajo del
 * nombre y además ENTRA en la búsqueda. Las dos cosas juntas y no una sola: el
 * operador tiene la factura en la mano, donde figura la razón social y no el
 * alias interno con el que el proveedor está cargado en Ficha. Si sólo se
 * buscara por nombre no lo encontraría; si sólo se buscara sin mostrarlo, no
 * podría distinguir dos proveedores con nombres parecidos.
 */
export interface OpcionBuscable {
  id: string;
  nombre: string;
  alias?: string | null;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  options: OpcionBuscable[];
  /** Texto del botón cuando no hay nada elegido. */
  placeholder: string;
  /**
   * Si viene, se ofrece una primera opción que LIMPIA la selección (ej.
   * "Proveedor: Todos"). Sin esto el combobox no tiene forma de volver a "sin
   * filtro" una vez elegido algo.
   */
  emptyLabel?: string;
  disabled?: boolean;
  title?: string;
  /** Ancho y alto los pone la pantalla; el resto del estilo es del componente. */
  style?: CSSProperties;
  placeholderBusqueda?: string;
}

/**
 * Select con buscador.
 *
 * Reemplaza al `<select>` nativo donde la lista es un catálogo que crece: con
 * decenas de proveedores, elegir uno es scrollear a ojo hasta encontrarlo, y el
 * type-ahead del select nativo sólo matchea el PREFIJO del nombre — no sirve
 * para "el que tiene 'sur' en el medio", ni para buscar por CUIT.
 *
 * ── Por qué un botón + panel y no un input siempre visible ──────────────────
 * Cerrado se ve y se comporta como el select que reemplaza (misma altura, mismo
 * borde, muestra lo elegido). El input de búsqueda aparece sólo al abrir, así
 * que la pantalla no se llena de cajas de texto vacías que parecen campos a
 * completar.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  disabled,
  title,
  style,
  placeholderBusqueda = 'Buscar…',
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState('');
  /** Índice resaltado dentro de `visibles` (teclado). */
  const [activo, setActivo] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);

  const seleccionada = options.find((o) => o.id === value) ?? null;

  /**
   * Opciones que se ven ahora. La de "limpiar" sólo aparece sin búsqueda
   * escrita: tipear un nombre y que Enter caiga sobre "Todos" —que está primera
   * y es la resaltada por defecto— borraría el filtro en vez de aplicarlo.
   */
  const visibles = useMemo<OpcionBuscable[]>(() => {
    const filtradas = options.filter((o) => coincideBusqueda(query, o.nombre, o.alias));
    if (emptyLabel != null && query.trim() === '') {
      return [{ id: '', nombre: emptyLabel }, ...filtradas];
    }
    return filtradas;
  }, [options, query, emptyLabel]);

  // Al abrir: búsqueda en blanco y el cursor sobre lo que ya está elegido, para
  // que las flechas arranquen desde ahí y no desde el principio de la lista.
  useEffect(() => {
    if (!abierto) return;
    setQuery('');
    const i = visibles.findIndex((o) => o.id === value);
    setActivo(i >= 0 ? i : 0);
    inputRef.current?.focus();
    // Sólo al abrir: incluir `visibles`/`value` reposicionaría el resaltado en
    // cada tecla, justo lo que las flechas acaban de mover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Cerrar al clickear afuera. `mousedown` y no `click`: si el click cae sobre
  // otro control, el panel tiene que estar cerrado ANTES de que ese control
  // reciba el evento.
  useEffect(() => {
    if (!abierto) return;
    const alClickear = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClickear);
    return () => document.removeEventListener('mousedown', alClickear);
  }, [abierto]);

  // El resaltado tiene que quedar a la vista aunque se mueva con el teclado.
  useEffect(() => {
    if (!abierto) return;
    const fila = listaRef.current?.children[activo] as HTMLElement | undefined;
    fila?.scrollIntoView({ block: 'nearest' });
  }, [activo, abierto]);

  function elegir(id: string) {
    onChange(id);
    setAbierto(false);
  }

  function alTeclear(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibles.length === 0) return;
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      setActivo((i) => (i + paso + visibles.length) % visibles.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opcion = visibles[activo];
      if (opcion) elegir(opcion.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAbierto(false);
    } else if (e.key === 'Tab') {
      // Sin esto el foco se va al siguiente control y el panel queda flotando
      // encima de la pantalla, tapando lo que el usuario acaba de enfocar.
      setAbierto(false);
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setAbierto((v) => !v)}
        style={{
          ...triggerStyle,
          width: '100%',
          height: '100%',
          borderColor: abierto ? 'var(--blue)' : 'var(--border-2)',
          color: seleccionada ? 'var(--ink)' : 'var(--muted-2)',
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {seleccionada ? seleccionada.nombre : placeholder}
        </span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flex: 'none', opacity: 0.6, transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div style={panelStyle}>
          <div style={{ padding: 8, borderBottom: '1px solid #eef1f6' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActivo(0); // la lista cambió: el resaltado vuelve al primero
              }}
              onKeyDown={alTeclear}
              placeholder={placeholderBusqueda}
              style={inputStyle}
            />
          </div>
          <div ref={listaRef} className="ds-scroll" style={{ maxHeight: 240, overflowY: 'auto' }}>
            {visibles.length === 0 && (
              <div style={{ padding: '12px 13px', fontSize: 13, color: 'var(--muted-3)' }}>
                Ningún resultado para “{query.trim()}”.
              </div>
            )}
            {visibles.map((o, i) => {
              const esActiva = i === activo;
              const esElegida = o.id === value;
              return (
                <div
                  key={o.id || '__vacia__'}
                  // `onMouseDown` y no `onClick`: el `mousedown` del documento
                  // cierra el panel, y con onClick la fila ya no existe cuando
                  // el click termina de dispararse.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(o.id);
                  }}
                  onMouseEnter={() => setActivo(i)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: '9px 13px',
                    cursor: 'pointer',
                    background: esActiva ? 'var(--blue-weak)' : 'transparent',
                    color: o.id === '' ? 'var(--muted-2)' : 'var(--ink-2)',
                    fontWeight: esElegida ? 700 : 500,
                  }}
                >
                  <span style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.nombre}
                  </span>
                  {o.alias && (
                    <span style={{ fontSize: 11.5, color: 'var(--muted-3)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.alias}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const triggerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  padding: '0 11px',
  fontSize: 13,
  fontWeight: 500,
  background: '#fff',
  textAlign: 'left',
};

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  // El panel no se achica al ancho del trigger (que en los filtros es angosto):
  // los nombres de proveedor son largos y recortarlos a 200px haría elegir a
  // ciegas entre dos que empiezan igual.
  minWidth: '100%',
  maxWidth: 360,
  width: 'max-content',
  background: '#fff',
  border: '1px solid var(--border-2)',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(18,50,122,.12)',
  zIndex: 40,
  overflow: 'hidden',
};

const inputStyle: CSSProperties = {
  width: '100%',
  height: 34,
  border: '1px solid var(--border-2)',
  borderRadius: 7,
  padding: '0 10px',
  fontSize: 13,
  color: 'var(--ink)',
  outline: 'none',
  background: '#fff',
  boxSizing: 'border-box',
};
