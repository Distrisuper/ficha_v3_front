import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useData } from '../context/DataContext';
import { money, fmtDate, fmtDateTime } from '../utils/money';
import { HISTORIAL_ESTADOS } from '../utils/estados';
import type { Remito } from '../types/api';

export function HistorialPage() {
  const { remitos: remitosHistory, remitosLoading, remitosError, reloadRemitos, proveedores } = useData();

  // Los proveedores ya se cargan al arrancar (DataContext). El historial se mantiene
  // "afuera" de la carga inicial: sus remitos se piden al abrir esta pestaña.
  useEffect(() => {
    void reloadRemitos();
  }, [reloadRemitos]);

  const provName = (r: Remito) =>
    proveedores.find((p) => p.id === r.proveedorId)?.nombre ?? r.proveedor?.nombre ?? r.proveedorId ?? '—';

  const historial = useMemo(
    () =>
      remitosHistory
        .filter((r) => HISTORIAL_ESTADOS.has(r.estado))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [remitosHistory],
  );

  return (
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {remitosError && (
        <div style={{ padding: '14px 20px', background: 'var(--err-weak)', color: 'var(--err)', fontSize: 13 }}>{remitosError}</div>
      )}
      <div className="ds-scroll" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 190px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1000 }}>
          <thead>
            <tr style={{ background: '#f8fafc', color: '#414a58', textAlign: 'left' }}>
              <Th>ACTUALIZADO</Th>
              <Th>PROVEEDOR</Th>
              <Th>FECHA</Th>
              <Th>REMITO</Th>
              <Th>FACTURA</Th>
              <Th>ESTADO</Th>
              <Th>ITEMS</Th>
              <Th>TOTAL</Th>
            </tr>
          </thead>
          <tbody>
            {!remitosLoading && historial.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--muted-3)' }}>
                  Todavía no hay registros procesados.
                </td>
              </tr>
            )}
            {historial.map((h, i) => (
              <tr key={h.id} style={{ borderTop: '1px solid #f2f4f8', background: i % 2 ? '#fbfcfe' : '#ffffff' }}>
                <td style={td}>{fmtDateTime(h.updatedAt)}</td>
                <td style={td}>{provName(h)}</td>
                <td style={td}>{fmtDate(h.fecha)}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{h.remitoNro || '—'}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{h.facturaNro || '—'}</td>
                <td style={{ ...td, color: h.estado === 'aprobado' ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>{h.estado}</td>
                <td style={{ ...td, color: 'var(--blue)', fontWeight: 600 }}>{h.articulos?.length ?? 0}</td>
                <td style={td}>{money(h.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</th>;
}

const td: CSSProperties = { padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--ink-2)' };
