import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useData } from '../context/DataContext';
import { remitosApi } from '../api/remitos';
import { money, fmtDate, fmtDateTime } from '../utils/money';
import { HISTORIAL_ESTADOS } from '../utils/estados';
import { applyFilters, type RemitoFilters } from '../utils/filtros';
import { downloadCsv } from '../utils/csv';
import type { Remito } from '../types/api';

interface Props {
  filters: RemitoFilters;
}

export function HistorialPage({ filters }: Props) {
  const { proveedores, sucursalId } = useData();

  // El historial NO comparte lista con Pendientes: se pide on-demand a
  // GET /remitos/history (que ya filtra los estados terminales server-side).
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provName = useCallback(
    (r: Remito) =>
      proveedores.find((p) => p.id === r.proveedorId)?.nombre ?? r.proveedor?.nombre ?? r.proveedorId ?? '—',
    [proveedores],
  );

  // Solo depende de la sucursal (único filtro que viaja al endpoint). Los demás
  // filtros (proveedor/fecha) se aplican client-side, sin refetch.
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await remitosApi.history(sucursalId || undefined);
      setRemitos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial');
    } finally {
      setLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const historial = useMemo(
    () =>
      applyFilters(
        remitos.filter((r) => HISTORIAL_ESTADOS.has(r.estado)),
        filters,
      ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [remitos, filters],
  );

  const exportCsv = useCallback(() => {
    const headers = [
      'Actualizado', 'Proveedor', 'Fecha', 'Remito', 'Factura', 'Estado',
      'Items', 'Subtotal', 'IVA', 'Percepciones', 'Total', 'Aprobado',
    ];
    const rows = historial.map((h) => [
      fmtDateTime(h.updatedAt),
      provName(h),
      fmtDate(h.fecha),
      h.remitoNro ?? '',
      h.facturaNro ?? '',
      h.estado,
      h.articulos?.length ?? 0,
      h.subtotal,
      h.iva,
      h.percepciones,
      h.total,
      fmtDateTime(h.approvedAt),
    ]);
    downloadCsv(`historial_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }, [historial, provName]);

  const exportDisabled = loading || historial.length === 0;

  return (
    <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '12px 20px', borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--muted-3)' }}>
          {loading ? 'Cargando…' : `${historial.length} registro${historial.length === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exportDisabled}
          style={{
            border: '1px solid var(--border)', background: '#fff', color: 'var(--ink-2)',
            borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600,
            cursor: exportDisabled ? 'not-allowed' : 'pointer', opacity: exportDisabled ? 0.5 : 1,
          }}
        >
          Exportar CSV
        </button>
      </div>

      {error && (
        <div style={{ padding: '14px 20px', background: 'var(--err-weak)', color: 'var(--err)', fontSize: 13 }}>{error}</div>
      )}

      <div className="ds-scroll" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1200 }}>
          <thead>
            <tr style={{ background: '#f8fafc', color: '#414a58', textAlign: 'left' }}>
              <Th>ACTUALIZADO</Th>
              <Th>PROVEEDOR</Th>
              <Th>FECHA</Th>
              <Th>REMITO</Th>
              <Th>FACTURA</Th>
              <Th>ESTADO</Th>
              <Th>ITEMS</Th>
              <Th>SUBTOTAL</Th>
              <Th>IVA</Th>
              <Th>PERCEP.</Th>
              <Th>TOTAL</Th>
              <Th>APROBADO</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={12} style={{ padding: 24, textAlign: 'center', color: 'var(--muted-3)' }}>
                  Cargando registros…
                </td>
              </tr>
            )}
            {!loading && historial.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: 24, textAlign: 'center', color: 'var(--muted-3)' }}>
                  Todavía no hay registros procesados.
                </td>
              </tr>
            )}
            {!loading && historial.map((h, i) => (
              <tr key={h.id} style={{ borderTop: '1px solid #f2f4f8', background: i % 2 ? '#fbfcfe' : '#ffffff' }}>
                <td style={td}>{fmtDateTime(h.updatedAt)}</td>
                <td style={td}>{provName(h)}</td>
                <td style={td}>{fmtDate(h.fecha)}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{h.remitoNro || '—'}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{h.facturaNro || '—'}</td>
                <td style={{ ...td, color: h.estado === 'aprobado' ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>{h.estado}</td>
                <td style={{ ...td, color: 'var(--blue)', fontWeight: 600 }}>{h.articulos?.length ?? 0}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{money(h.subtotal)}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{money(h.iva)}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{money(h.percepciones)}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{money(h.total)}</td>
                <td style={td}>{fmtDateTime(h.approvedAt)}</td>
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
