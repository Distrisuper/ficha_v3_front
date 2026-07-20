import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { remitosApi } from '../api/remitos';
import { fmtDate, fmtCantidad } from '../utils/money';
import { PENDIENTES_ESTADOS } from '../utils/estados';
import { applyFilters, type RemitoFilters } from '../utils/filtros';
import type { Remito } from '../types/api';

const MAX_ITEMS_HEIGHT = 430; // ~10 filas visibles; el resto scrollea

interface Props {
  filters: RemitoFilters;
  focusId?: string | null;
  onFocusHandled?: () => void;
}

export function PendientesPage({ filters, focusId, onFocusHandled }: Props) {
  const { remitos, remitosLoading, remitosError, reloadRemitos, proveedores } = useData();
  const pendientes = useMemo(
    () => applyFilters(remitos.filter((r) => PENDIENTES_ESTADOS.has(r.estado)), filters),
    [remitos, filters],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Modo edición (mostrar casillas) por remito, y selección de artículos por remito.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [selectedByRemito, setSelectedByRemito] = useState<Record<string, Set<string>>>({});

  // Los proveedores ya se cargan al arrancar (DataContext). Al abrir la pestaña sólo
  // refrescamos los remitos para ver el estado más reciente.
  useEffect(() => {
    void reloadRemitos();
  }, [reloadRemitos]);

  // Si venimos desde una card del panel de Nuevo, hacemos scroll hasta ese remito
  // y lo resaltamos un instante. Se espera a que la lista esté renderizada.
  useEffect(() => {
    if (!focusId) return;
    const el = cardRefs.current[focusId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(focusId);
    onFocusHandled?.();
    const t = setTimeout(() => setHighlightId(null), 2200);
    return () => clearTimeout(t);
  }, [focusId, pendientes, onFocusHandled]);

  const provName = (r: Remito) =>
    proveedores.find((p) => p.id === r.proveedorId)?.nombre ?? r.proveedor?.nombre ?? r.proveedorId ?? '—';

  const allItemIds = (r: Remito) => (r.articulos ?? []).map((a) => a.id);
  // Selección efectiva: la guardada, o TODOS por defecto (todo marcado).
  const getSelected = (r: Remito): Set<string> => selectedByRemito[r.id] ?? new Set(allItemIds(r));

  function toggleEdit(r: Remito) {
    setEditingIds((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) {
        next.delete(r.id);
      } else {
        next.add(r.id);
        // al entrar en edición, inicializamos con todos los artículos marcados
        setSelectedByRemito((s) => (s[r.id] ? s : { ...s, [r.id]: new Set(allItemIds(r)) }));
      }
      return next;
    });
  }

  function toggleItem(r: Remito, itemId: string) {
    setSelectedByRemito((s) => {
      const current = new Set(s[r.id] ?? allItemIds(r));
      if (current.has(itemId)) current.delete(itemId);
      else current.add(itemId);
      return { ...s, [r.id]: current };
    });
  }

  function toggleAll(r: Remito) {
    const ids = allItemIds(r);
    const sel = getSelected(r);
    const allSel = ids.length > 0 && ids.every((id) => sel.has(id));
    setSelectedByRemito((s) => ({ ...s, [r.id]: new Set(allSel ? [] : ids) }));
  }

  async function handleCargarStock(r: Remito) {
    const articulos = [...getSelected(r)];
    if (articulos.length === 0) {
      setNotice('Seleccioná al menos un artículo para cargar al stock.');
      return;
    }
    setBusyId(r.id);
    setNotice(null);
    try {
      // Enviamos los UUID de los artículos marcados; el back procesa la carga a stock.
      await remitosApi.submitMercaderia(r.id, articulos);
      setNotice(`Remito ${r.remitoNro || r.id.slice(0, 8)}: ${articulos.length} artículo(s) enviados a stock.`);
      setEditingIds((prev) => {
        const n = new Set(prev);
        n.delete(r.id);
        return n;
      });
      await reloadRemitos();
    } catch (e) {
      setNotice(e instanceof Error ? `Error: ${e.message}` : 'No se pudo cargar el stock');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>Tenés</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--blue)' }}>{pendientes.length} remitos</span>
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>esperando ser cargados al stock.</span>
      </div>

      {notice && (
        <div style={{ marginBottom: 16, background: '#eff4ff', color: 'var(--blue)', borderRadius: 8, padding: '10px 14px', fontSize: 13, maxWidth: 1100 }}>
          {notice}
        </div>
      )}
      {remitosError && (
        <div style={{ marginBottom: 16, background: 'var(--err-weak)', color: 'var(--err)', borderRadius: 8, padding: '10px 14px', fontSize: 13, maxWidth: 1100 }}>
          {remitosError}
        </div>
      )}
      {remitosLoading && <div style={{ fontSize: 13, color: 'var(--muted-3)' }}>Cargando remitos…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }}>
        {!remitosLoading && pendientes.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted-3)', padding: '20px 0' }}>No hay remitos pendientes.</div>
        )}
        {pendientes.map((r) => {
          const editing = editingIds.has(r.id);
          const items = r.articulos ?? [];
          const selected = getSelected(r);
          const selCount = items.filter((it) => selected.has(it.id)).length;
          const allSel = items.length > 0 && selCount === items.length;
          return (
            <div
              key={r.id}
              ref={(el) => {
                cardRefs.current[r.id] = el;
              }}
              style={{
                background: '#fff',
                border: highlightId === r.id ? '1px solid var(--blue)' : '1px solid var(--border)',
                borderRadius: 14,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: highlightId === r.id ? '0 0 0 3px var(--blue-weak)' : '0 1px 3px rgba(18,50,122,.05)',
                transition: 'box-shadow .2s ease, border-color .2s ease',
                scrollMarginTop: 12,
              }}
            >
              <div
                style={{
                  padding: '18px 22px',
                  background: 'linear-gradient(180deg,#f4f8ff,#ffffff)',
                  borderBottom: '1px solid #eef1f6',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 20,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: 36, alignItems: 'center', flexWrap: 'wrap' }}>
                  <HeadCell label="Nº REMITO" value={r.remitoNro || '—'} big />
                  <HeadCell label="Nº FACTURA" value={r.facturaNro || '—'} />
                  <HeadCell label="PROVEEDOR" value={provName(r)} />
                  <HeadCell label="ESTADO" value={r.estado} />
                </div>
                <span style={{ fontSize: 13, color: 'var(--muted-2)', fontWeight: 600 }}>{fmtDate(r.fecha)}</span>
              </div>
              <div style={{ padding: '10px 22px 14px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '.4px', color: 'var(--muted-3)', padding: '10px 0 4px', borderBottom: '1px solid #eef1f6' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    {editing && (
                      <input
                        type="checkbox"
                        checked={allSel}
                        onChange={() => toggleAll(r)}
                        title="Marcar / desmarcar todos"
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#2563eb' }}
                      />
                    )}
                    ARTÍCULO
                    {editing && (
                      <span style={{ fontWeight: 600, color: 'var(--blue)', letterSpacing: 0 }}>
                        · {selCount}/{items.length} seleccionados
                      </span>
                    )}
                  </span>
                  <span>CANT.</span>
                </div>
                <div
                  className="ds-scroll"
                  style={{ display: 'flex', flexDirection: 'column', maxHeight: MAX_ITEMS_HEIGHT, overflowY: 'auto' }}
                >
                  {items.length === 0 && (
                    <div style={{ padding: '11px 0', fontSize: 13, color: 'var(--muted-3)' }}>Sin artículos cargados.</div>
                  )}
                  {items.map((it) => {
                    const checked = selected.has(it.id);
                    return (
                      <div
                        key={it.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 0',
                          borderTop: '1px solid #f2f4f8',
                          opacity: editing && !checked ? 0.45 : 1,
                          transition: 'opacity .12s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          {editing && (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleItem(r, it.id)}
                              style={{ width: 16, height: 16, flex: 'none', cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontSize: 14, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.nombre}>
                              {it.nombre || '—'}
                            </span>
                            {it.codigo ? (
                              <span style={{ fontSize: 11.5, color: 'var(--muted-2)', fontVariantNumeric: 'tabular-nums' }}>{it.codigo}</span>
                            ) : null}
                          </div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', background: 'var(--blue-weak)', borderRadius: 6, padding: '2px 10px', flex: 'none' }}>
                          {fmtCantidad(it.cantidad)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ padding: '16px 22px', borderTop: '1px solid #eef1f6', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => toggleEdit(r)}
                  title="Seleccionar qué artículos cargar"
                  style={{
                    height: 44,
                    padding: '0 26px',
                    borderRadius: 9,
                    border: '1px solid #cfd8e6',
                    background: editing ? 'var(--blue-weak)' : '#fff',
                    color: 'var(--blue)',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  {editing ? 'Listo' : 'Editar'}
                </button>
                <button
                  onClick={() => handleCargarStock(r)}
                  disabled={busyId === r.id || (editing && selCount === 0)}
                  style={{
                    height: 44,
                    padding: '0 26px',
                    borderRadius: 9,
                    border: 'none',
                    background: busyId === r.id || (editing && selCount === 0) ? '#8a94a6' : 'var(--blue)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: busyId === r.id || (editing && selCount === 0) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {busyId === r.id ? 'Cargando…' : editing ? `Cargar Stock (${selCount})` : 'Cargar Stock'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeadCell({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px', color: 'var(--muted-2)' }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 16, fontWeight: big ? 800 : 700, color: big ? 'var(--navy)' : 'var(--ink-2)', letterSpacing: big ? '.3px' : undefined }}>
        {value}
      </div>
    </div>
  );
}
