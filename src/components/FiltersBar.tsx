import type { CSSProperties } from 'react';
import { useData } from '../context/data-context';
import { EMPTY_FILTERS, hayFiltrosActivos, type RemitoFilters } from '../utils/filtros';
import { ProveedorSelect } from './ProveedorSelect';

interface Props {
  value: RemitoFilters;
  onChange: (f: RemitoFilters) => void;
}

export function FiltersBar({ value, onChange }: Props) {
  // La sucursal NO es parte de `value`: es la sucursal global persistida en localStorage
  // (sucursalId/setSucursal). Así el filtro arranca con la guardada y, al cambiarla,
  // también actualiza el localStorage y la request. Ver DataContext.
  const { sucursales, proveedores, sucursalId, setSucursal } = useData();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <select
        value={sucursalId}
        onChange={(e) => {
          const s = sucursales.find((x) => x.id === e.target.value);
          setSucursal(e.target.value, s?.nombre ?? '');
        }}
        style={selectStyle}
        title="Filtrar por sucursal (se guarda como sucursal activa)"
      >
        <option value="">Sucursal: Todas</option>
        {sucursales.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>

      {/*
        Combobox con buscador en vez del `<select>` nativo: el catálogo de
        proveedores crece y encontrar uno en una lista larga era scrollear a ojo.
        Se busca también por razón social y CUIT — son los datos que el operador
        tiene delante en el comprobante, no el alias interno.
      */}
      <ProveedorSelect
        value={value.proveedorId}
        onChange={(proveedorId) => onChange({ ...value, proveedorId })}
        proveedores={proveedores}
        placeholder="Proveedor: Todos"
        emptyLabel="Proveedor: Todos"
        title="Filtrar por proveedor"
        style={{ height: 36, width: 200 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={labelStyle}>Fecha</span>
        <input
          type="date"
          value={value.fechaDesde}
          max={value.fechaHasta || undefined}
          onChange={(e) => onChange({ ...value, fechaDesde: e.target.value })}
          style={dateStyle}
          title="Desde"
        />
        <span style={{ fontSize: 12.5, color: 'var(--muted-2)' }}>a</span>
        <input
          type="date"
          value={value.fechaHasta}
          min={value.fechaDesde || undefined}
          onChange={(e) => onChange({ ...value, fechaHasta: e.target.value })}
          style={dateStyle}
          title="Hasta"
        />
      </div>

      {hayFiltrosActivos(value) && (
        <button onClick={() => onChange(EMPTY_FILTERS)} style={clearBtn} title="Quitar filtros">
          Limpiar
        </button>
      )}
    </div>
  );
}

const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: 'var(--muted-2)' };

const selectStyle: CSSProperties = {
  height: 36,
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  padding: '0 11px',
  fontSize: 13,
  color: 'var(--ink)',
  background: '#fff',
  cursor: 'pointer',
  maxWidth: 200,
};

const dateStyle: CSSProperties = {
  height: 36,
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  padding: '0 11px',
  fontSize: 13,
  color: 'var(--ink)',
  background: '#fff',
  cursor: 'pointer',
};

const clearBtn: CSSProperties = {
  height: 36,
  padding: '0 14px',
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  background: '#fff',
  color: 'var(--muted)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
