import type { CSSProperties } from 'react';
import { useData } from '../context/DataContext';
import { EMPTY_FILTERS, hayFiltrosActivos, type RemitoFilters, type TipoFiltro } from '../utils/filtros';

interface Props {
  value: RemitoFilters;
  onChange: (f: RemitoFilters) => void;
}

const TIPOS: { key: TipoFiltro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'remito', label: 'Remito' },
  { key: 'factura', label: 'Factura' },
];

export function FiltersBar({ value, onChange }: Props) {
  // La sucursal NO es parte de `value`: es la sucursal global persistida en localStorage
  // (sucursalId/setSucursal). Así el filtro arranca con la guardada y, al cambiarla,
  // también actualiza el localStorage y la request. Ver DataContext.
  const { sucursales, proveedores, sucursalId, setSucursal } = useData();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={labelStyle}>Tipo</span>
        <div style={segWrap}>
          {TIPOS.map((t) => (
            <button key={t.key} onClick={() => onChange({ ...value, tipo: t.key })} style={segBtn(value.tipo === t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

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

      <select
        value={value.proveedorId}
        onChange={(e) => onChange({ ...value, proveedorId: e.target.value })}
        style={selectStyle}
        title="Filtrar por proveedor"
      >
        <option value="">Proveedor: Todos</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>

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

const segWrap: CSSProperties = {
  display: 'inline-flex',
  background: '#eef1f6',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 3,
};

const segBtn = (active: boolean): CSSProperties => ({
  padding: '5px 13px',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  background: active ? 'var(--blue)' : 'transparent',
  color: active ? '#fff' : 'var(--muted)',
  boxShadow: active ? '0 1px 2px rgba(18,50,122,.18)' : 'none',
});

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
