import { useState, type CSSProperties } from 'react';
import { Tooltip } from './Tooltip';

/** Categoría de lo que se está cargando en el comprobante. */
export type CategoriaCarga = 'proveedores' | 'servicios' | 'otros';

interface Opcion {
  key: CategoriaCarga;
  label: string;
  /** Texto de la burbuja al pasar el mouse. Todas las opciones tienen uno. */
  tooltip: string;
  /** Ancho de la burbuja, según el largo del texto. */
  anchoTooltip: number;
  habilitada: boolean;
}

const PROXIMAMENTE = 'Próximamente';

const OPCIONES: Opcion[] = [
  {
    key: 'proveedores',
    label: 'Proveedores',
    tooltip: 'Bienes/mercadería comercializados por la empresa',
    anchoTooltip: 210,
    habilitada: true,
  },
  { key: 'servicios', label: 'Servicios', tooltip: PROXIMAMENTE, anchoTooltip: 120, habilitada: false },
  { key: 'otros', label: 'Otros', tooltip: PROXIMAMENTE, anchoTooltip: 120, habilitada: false },
];

// Gris de las burbujas. Va en gris y no en el azul por defecto del Tooltip para que
// no compita con la pastilla del propio selector, que ya usa azul.
const TOOLTIP_GRIS = '#5b6472';

/**
 * Selector segmentado de categoría, en la barra superior de la pantalla "Nuevo".
 *
 * La pastilla azul es un elemento aparte posicionado en absoluto y desplazado con
 * `translateX`, no el fondo del botón activo: así el cambio de opción se anima con una
 * sola `transition` de transform en vez de un cross-fade de dos fondos. Las columnas
 * son de ancho igual (`1fr` cada una), lo que hace que `translateX(100%)` caiga exacto
 * sobre la columna siguiente sin medir nada con refs.
 *
 * Hoy sólo "Proveedores" está habilitada, así que el deslizamiento no se puede
 * disparar todavía; queda listo para cuando se habiliten las otras dos.
 */
export function CategoriaBar() {
  const [valor, setValor] = useState<CategoriaCarga>('proveedores');
  const activa = Math.max(0, OPCIONES.findIndex((o) => o.key === valor));

  return (
    <div style={wrap}>
      <span style={{ ...pastilla, transform: `translateX(${activa * 100}%)` }} />
      {OPCIONES.map((o) => {
        const seleccionada = o.key === valor;
        return (
          <Tooltip key={o.key} texto={o.tooltip} ancho={o.anchoTooltip} fondo={TOOLTIP_GRIS} wrapperStyle={celda}>
            {/*
              Sin `disabled`: un botón deshabilitado no emite eventos de mouse y el
              tooltip nunca aparecería. `aria-disabled` + sin `onClick` lo deja inerte
              igual, y el hover sigue llegando al wrapper del Tooltip.
            */}
            <button
              type="button"
              aria-pressed={seleccionada}
              aria-disabled={!o.habilitada}
              onClick={o.habilitada ? () => setValor(o.key) : undefined}
              style={btn(seleccionada, o.habilitada)}
            >
              {o.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

const wrap: CSSProperties = {
  position: 'relative',
  display: 'inline-grid',
  gridTemplateColumns: `repeat(${OPCIONES.length}, minmax(0, 1fr))`,
  background: '#f1f3f7',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 2,
};

// Azul apagado en vez de `--blue`: el control vive en la barra superior y no debería
// competir con los botones de acción.
const AZUL_APAGADO = '#5878b4';

const pastilla: CSSProperties = {
  position: 'absolute',
  top: 2,
  bottom: 2,
  left: 2,
  width: `calc((100% - 4px) / ${OPCIONES.length})`,
  borderRadius: 6,
  background: AZUL_APAGADO,
  transition: 'transform .26s cubic-bezier(.4,0,.2,1)',
};

const celda: CSSProperties = { display: 'flex', minWidth: 0 };

const btn = (seleccionada: boolean, habilitada: boolean): CSSProperties => ({
  position: 'relative',
  zIndex: 1,
  flex: 1,
  minWidth: 0,
  padding: '4px 13px',
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  fontSize: 12.5,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: habilitada ? 'pointer' : 'not-allowed',
  color: seleccionada ? '#fff' : habilitada ? 'var(--muted)' : 'var(--muted-3)',
  transition: 'color .26s cubic-bezier(.4,0,.2,1)',
});
