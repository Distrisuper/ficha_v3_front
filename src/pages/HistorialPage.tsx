import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useData } from '../context/data-context';
import { remitosApi } from '../api/remitos';
import { money, fmtDate } from '../utils/money';
import { toNumero } from '../utils/numero';
import { HISTORIAL_ESTADOS, historialEstadoView } from '../utils/estados';
import { applyFilters, type RemitoFilters } from '../utils/filtros';
import { downloadCsv } from '../utils/csv';
import type { Remito } from '../types/api';

interface Props {
  filters: RemitoFilters;
}

const PAGE_SIZE = 20;

// "Artículos" = cantidad de renglones distintos (p. ej. pastillas + amortiguador = 2).
// "Items" = suma de las cantidades de esos renglones (x3 + x2 = 5). `cantidad` puede
// venir como string desde el back, por eso el parseo compartido.
const totalArts = (r: Remito) => r.articulos?.length ?? 0;
const totalItems = (r: Remito) =>
  // toNumero: `Number('1,5')` da NaN y el `|| 0` lo volvía 0.
  r.articulos?.reduce((acc, a) => acc + toNumero(a.cantidad), 0) ?? 0;

export function HistorialPage({ filters }: Props) {
  const { proveedores, sucursales, sucursalId } = useData();

  // El historial NO comparte lista con Pendientes: se pide on-demand a
  // GET /remitos/history (que ya filtra los estados server-side).
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const provName = useCallback(
    (r: Remito) =>
      proveedores.find((p) => p.id === r.proveedorId)?.nombre ?? r.proveedor?.nombre ?? r.proveedorId ?? '—',
    [proveedores],
  );

  const sucName = useCallback(
    (r: Remito) => {
      const sid = r.sucursalId ?? r.sucursal?.id;
      return sucursales.find((s) => s.id === sid)?.nombre ?? r.sucursal?.nombre ?? '—';
    },
    [sucursales],
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

  // Al cambiar filtros/sucursal volvemos a la primera página.
  useEffect(() => {
    setPage(1);
  }, [filters, sucursalId]);

  const totalPages = Math.max(1, Math.ceil(historial.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => historial.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [historial, currentPage],
  );

  const exportCsv = useCallback(() => {
    const headers = [
      'Sucursal', 'Proveedor', 'Fecha', 'Remito', 'Factura', 'Estado', 'Artículos', 'Items',
      'Total', 'Fecha procesado', 'Fecha carga remito',
    ];
    const rows = historial.map((h) => [
      sucName(h),
      provName(h),
      fmtDate(h.fecha),
      h.remitoNro ?? '',
      h.facturaNro ?? '',
      historialEstadoView(h.estado).label,
      totalArts(h),
      totalItems(h),
      h.total,
      fmtDate(h.createdAt),
      fmtDate(h.approvedAt),
    ]);
    downloadCsv(`historial_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }, [historial, provName, sucName]);

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

      <div className="ds-scroll" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1200 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <Th>SUCURSAL</Th>
              <Th>PROVEEDOR</Th>
              <Th>FECHA</Th>
              <Th>REMITO</Th>
              <Th>FACTURA</Th>
              <Th>ESTADO</Th>
              <Th>ARTÍCULOS</Th>
              <Th>ITEMS</Th>
              <Th>TOTAL</Th>
              <Th>FECHA PROCESADO</Th>
              <Th>FECHA CARGA REMITO</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--muted-3)' }}>
                  Cargando registros…
                </td>
              </tr>
            )}
            {!loading && historial.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--muted-3)' }}>
                  Todavía no hay registros procesados.
                </td>
              </tr>
            )}
            {!loading && pageItems.map((h, i) => {
              const ev = historialEstadoView(h.estado);
              return (
                <tr key={h.id} style={{ borderTop: '1px solid #f2f4f8', background: i % 2 ? '#fbfcfe' : '#ffffff' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{sucName(h)}</td>
                  <td style={td}>{provName(h)}</td>
                  <td style={td}>{fmtDate(h.fecha)}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{h.remitoNro || '—'}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{h.facturaNro || '—'}</td>
                  <td style={{ ...td, color: ev.color, fontWeight: 700 }}>{ev.label}</td>
                  <td style={{ ...td, color: 'var(--blue)', fontWeight: 600 }}>{totalArts(h)}</td>
                  <td style={{ ...td, color: 'var(--blue)', fontWeight: 600 }}>{totalItems(h)}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{money(h.total)}</td>
                  <td style={td}>{fmtDate(h.createdAt)}</td>
                  <td style={td}>{fmtDate(h.approvedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && historial.length > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
            padding: '10px 20px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--muted)',
          }}
        >
          <span>Página {currentPage} de {totalPages}</span>
          <PagerBtn disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Anterior</PagerBtn>
          <PagerBtn disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente ›</PagerBtn>
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th
      style={{
        position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc', color: '#414a58',
        padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap',
        boxShadow: 'inset 0 -1px 0 var(--border)',
      }}
    >
      {children}
    </th>
  );
}

function PagerBtn({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: '1px solid var(--border)', background: '#fff', color: 'var(--ink-2)',
        borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

const td: CSSProperties = { padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--ink-2)' };
