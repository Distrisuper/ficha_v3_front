import type { CSSProperties } from 'react';
import type { RemitoTipo } from '../types/api';

interface Props {
  value: RemitoTipo;
  onChange: (t: RemitoTipo) => void;
}

const OPCIONES: { key: RemitoTipo; label: string }[] = [
  { key: 'factura', label: 'Factura' },
  { key: 'remito', label: 'Remito' },
];

// Control de "tipo de comprobante" que vive en la barra superior de la pantalla Nuevo,
// con el mismo look de filtro segmentado que FiltersBar. Selecciona qué se está cargando.
export function TipoCompBar({ value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={labelStyle}>Tipo de comprobante</span>
      <div style={segWrap}>
        {OPCIONES.map((o) => (
          <button key={o.key} onClick={() => onChange(o.key)} style={segBtn(value === o.key)}>
            {o.label}
          </button>
        ))}
      </div>
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
  padding: '5px 16px',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  background: active ? 'var(--blue)' : 'transparent',
  color: active ? '#fff' : 'var(--muted)',
  boxShadow: active ? '0 1px 2px rgba(18,50,122,.18)' : 'none',
});
