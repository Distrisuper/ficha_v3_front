import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useData } from '../context/DataContext';
import { createFactura, subscribeFacturaEvents } from '../api/facturas';
import { remitosApi } from '../api/remitos';
import type { Articulo, JobEventDto, Remito, RemitoTipo } from '../types/api';
import { money, parseMoneyInput } from '../utils/money';
import { colorFor } from '../utils/colors';

type Status = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface Props {
  tipoComp: RemitoTipo;
}

const STORAGE_KEY = 'ficha_remitos_procesados';
const ORIGINAL_KEY = 'ficha_remitos_original';

function loadStored(key: string): Remito[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// La cantidad puede venir como número o string (col char36 del back). Aceptamos coma decimal.
function toCantidad(v: number | string): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

// El precio llega como número desde el back ("1234.56") pero al editarse queda como string.
// Con coma => formato es-AR (puntos de miles, coma decimal); sin coma => punto decimal.
function toPrecio(v: number | string): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = s.includes(',') ? parseMoneyInput(s) : parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Recalcula el total por artículo (cantidad × precio), el subtotal (Σ totales) y el total
// del remito. El IVA se recalcula proporcional a la alícuota efectiva original (iva/subtotal
// del snapshot), dejando percepciones y bonificaciones fijas. Estos montos son los que se
// mandan en el PATCH al procesar (ver handleProcesar).
function recalcRemito(r: Remito, orig?: Remito): Remito {
  const articulos = (r.articulos ?? []).map((a) => ({
    ...a,
    total_unitario: round2(toCantidad(a.cantidad) * toPrecio(a.precio_unitario)),
  }));
  const subtotal = round2(articulos.reduce((acc, a) => acc + Number(a.total_unitario || 0), 0));
  const refSubtotal = Number(orig?.subtotal ?? r.subtotal ?? 0);
  const refIva = Number(orig?.iva ?? r.iva ?? 0);
  const rate = refSubtotal > 0 ? refIva / refSubtotal : 0;
  const iva = round2(subtotal * rate);
  const percepciones = Number(r.percepciones || 0);
  const descuentos = Number(r.descuentos || 0);
  const total = round2(subtotal - descuentos + percepciones + iva);
  return { ...r, articulos, subtotal, iva, total };
}

export function NuevoPage({ tipoComp }: Props) {
  const { proveedores, sucursales, sucursalId, setSucursal, reloadRemitos } = useData();

  const [proveedorId, setProveedorId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>(() => (loadStored(STORAGE_KEY).length > 0 ? 'done' : 'idle'));
  const [log, setLog] = useState<{ text: string; type: string }[]>([]);
  const [pct, setPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [remitosCargados, setRemitosCargados] = useState<Remito[]>(() => loadStored(STORAGE_KEY));
  const [originalRemitos, setOriginalRemitos] = useState<Remito[]>(() => loadStored(ORIGINAL_KEY));
  const [remitoSel, setRemitoSel] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ remitoId: string; itemId: string; field: keyof Articulo } | null>(null);
  const [editHeader, setEditHeader] = useState<{ id: string; field: 'facturaNro' | 'remitoNro' } | null>(null);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const closeSseRef = useRef<(() => void) | null>(null);
  useEffect(() => () => closeSseRef.current?.(), []);

  // Persistimos el/los remito(s) procesados en localStorage para que sobrevivan a
  // recargas o cambios de pestaña. Se limpia solo al Procesar (aprobar) o al Descartar.
  useEffect(() => {
    try {
      if (remitosCargados.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(remitosCargados));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage no disponible
    }
  }, [remitosCargados]);

  useEffect(() => {
    try {
      if (originalRemitos.length > 0) localStorage.setItem(ORIGINAL_KEY, JSON.stringify(originalRemitos));
      else localStorage.removeItem(ORIGINAL_KEY);
    } catch {
      // localStorage no disponible
    }
  }, [originalRemitos]);

  // Catálogos (proveedores/sucursales) y remitos ya se cargan en el DataContext al
  // arrancar, así que esta página solo los consume desde el context.

  const canProcess = !!file && !!sucursalId && !!proveedorId && status !== 'uploading' && status !== 'processing';

  async function handleUpload() {
    if (!file || !sucursalId || !proveedorId) return;
    setStatus('uploading');
    setErrorMsg(null);
    setSuccessMsg(null);
    setLog([]);
    setPct(2);
    setRemitosCargados([]);
    setOriginalRemitos([]);
    setRemitoSel(null);
    try {
      const { jobId } = await createFactura(file, sucursalId, proveedorId);
      setLog((l) => [{ text: `Encolado · job ${jobId}`, type: 'sent' }, ...l]);
      setStatus('processing');
      const close = subscribeFacturaEvents(
        jobId,
        (ev) => handleEvent(ev, jobId),
        () => setLog((l) => [{ text: 'Conexión interrumpida, reintentando…', type: 'reconnect' }, ...l]),
      );
      closeSseRef.current = close;
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo enviar el archivo');
    }
  }

  function handleEvent(ev: JobEventDto, jobId: string) {
    const p = percentOf(ev);
    if (p != null) setPct(p);
    setLog((l) => [{ text: labelOf(ev), type: ev.type }, ...l]);

    if (ev.type === 'completed') {
      closeSseRef.current?.();
      setPct(100);
      setStatus('done');
      loadRemitosByJob(jobId);
    } else if (ev.type === 'failed') {
      closeSseRef.current?.();
      setStatus('error');
      setErrorMsg(typeof ev.data === 'string' ? ev.data : 'El procesamiento falló');
    }
  }

  async function loadRemitosByJob(jobId: string) {
    try {
      const data = await remitosApi.getByJobId(jobId);
      setRemitosCargados(data ?? []);
      setOriginalRemitos(data ?? []); // snapshot original para detectar ediciones
      reloadRemitos();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo traer el resultado del procesamiento');
    }
  }

  const scope = useMemo(
    () => (remitoSel ? remitosCargados.filter((r) => r.id === remitoSel) : remitosCargados),
    [remitosCargados, remitoSel],
  );

  const filas = useMemo(() => {
    const rows: {
      remitoId: string;
      color: string;
      articulo: Articulo;
    }[] = [];
    remitosCargados.forEach((r, ri) => {
      const { color } = colorFor(ri);
      (r.articulos ?? []).forEach((a) => rows.push({ remitoId: r.id, color, articulo: a }));
    });
    return rows;
  }, [remitosCargados]);

  const visibleFilas = useMemo(
    () => (remitoSel ? filas.filter((f) => f.remitoId === remitoSel) : filas),
    [filas, remitoSel],
  );

  const totals = useMemo(() => {
    const subtotal = scope.reduce((a, r) => a + Number(r.subtotal || 0), 0);
    const percepciones = scope.reduce((a, r) => a + Number(r.percepciones || 0), 0);
    const descuentos = scope.reduce((a, r) => a + Number(r.descuentos || 0), 0);
    const iva = scope.reduce((a, r) => a + Number(r.iva || 0), 0);
    const total = scope.reduce((a, r) => a + Number(r.total || 0), 0);
    return { subtotal, percepciones, descuentos, iva, total };
  }, [scope]);

  // Detección de ediciones: comparamos cada remito contra su snapshot original.
  const originalById = useMemo(
    () => Object.fromEntries(originalRemitos.map((r) => [r.id, r])),
    [originalRemitos],
  );
  const isDirty = (r: Remito): boolean => {
    const orig = originalById[r.id];
    return !orig || JSON.stringify(r) !== JSON.stringify(orig);
  };

  function updateArticuloLocal(remitoId: string, articuloId: string, field: keyof Articulo, value: string) {
    setRemitosCargados((prev) =>
      prev.map((r) => {
        if (r.id !== remitoId) return r;
        const articulos = (r.articulos ?? []).map((a) => (a.id !== articuloId ? a : { ...a, [field]: value }));
        const updated = { ...r, articulos };
        // Editar cantidad/precio recalcula total del artículo, subtotal, IVA y total del remito.
        return field === 'cantidad' || field === 'precio_unitario' ? recalcRemito(updated, originalById[remitoId]) : updated;
      }),
    );
  }

  // Edición local (persistida en localStorage) del Nº de factura / remito.
  // facturaNro es compartido por todo el lote de un mismo comprobante (applyToAll).
  function updateRemitoField(remitoId: string, field: 'facturaNro' | 'remitoNro', value: string, applyToAll = false) {
    setRemitosCargados((prev) => prev.map((r) => (applyToAll || r.id === remitoId ? { ...r, [field]: value } : r)));
  }

  async function commitEdit() {
    const ec = editCell;
    setEditCell(null);
    if (!ec) return;
    const remito = remitosCargados.find((r) => r.id === ec.remitoId);
    const articulo = remito?.articulos?.find((a) => a.id === ec.itemId);
    if (!remito || !articulo) return;
    try {
      // Backend stub: PATCH /remitos/:id/items no persiste hoy los cambios, ver aviso en UI.
      await remitosApi.updateItems(remito.id, remito.articulos ?? []);
    } catch {
      // silencioso: es un stub conocido, no bloqueamos la edición visual
    }
  }

  async function handleProcesar() {
    if (scope.length === 0) return;
    setApproving(true);
    setErrorMsg(null);
    try {
      // Si hubo ediciones, mandamos el objeto completo del remito para que el back
      // verifique/persista los cambios antes de aprobar.
      const editados = scope.filter(isDirty);
      if (editados.length) {
        await Promise.all(editados.map((r) => remitosApi.update(r.id, r)));
      }
      await Promise.all(scope.map((r) => remitosApi.approve(r.id)));
      setSuccessMsg('Comprobante(s) aprobado(s) correctamente.');
      setRemitosCargados([]);
      setOriginalRemitos([]);
      setRemitoSel(null);
      setFile(null);
      setStatus('idle');
      reloadRemitos();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo procesar el comprobante');
    } finally {
      setApproving(false);
    }
  }

  async function handleDiscard() {
    if (remitosCargados.length === 0) return;
    setDiscarding(true);
    setErrorMsg(null);
    try {
      const results = await Promise.allSettled(remitosCargados.map((r) => remitosApi.discard(r.id)));
      const failed = remitosCargados.filter((_, i) => results[i].status === 'rejected');
      const failedIds = new Set(failed.map((r) => r.id));
      // Conservamos solo los que fallaron (y sus snapshots) para poder reintentar.
      setRemitosCargados(failed);
      setOriginalRemitos((prev) => prev.filter((r) => failedIds.has(r.id)));
      if (failed.length === 0) {
        setRemitoSel(null);
        setStatus('idle');
        setFile(null);
        setSuccessMsg('Remito descartado.');
      } else {
        setErrorMsg('Algunos remitos no pudieron ser descartados.');
      }
      reloadRemitos();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo descartar el remito');
    } finally {
      setDiscarding(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }}>
        {tipoComp === 'remito' && (
          <div style={{ fontSize: 12.5, color: 'var(--muted-3)', background: '#f4f8ff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 13px' }}>
            La API sólo tiene un endpoint de carga (factura); el PDF se procesa igual, sin desglose de IVA abajo.
          </div>
        )}

        <section style={cardStyle}>
          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={fieldColStyle}>
              <label style={labelStyle}>Sucursal</label>
              <select
                value={sucursalId}
                onChange={(e) => {
                  const s = sucursales.find((x) => x.id === e.target.value);
                  setSucursal(e.target.value, s?.nombre ?? '');
                }}
                style={selectStyle}
              >
                <option value="">Seleccionar sucursal</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldColStyle}>
              <label style={labelStyle}>Proveedor</label>
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={selectStyle}>
                <option value="">Seleccionar proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ ...fieldColStyle, minWidth: 220 }}>
              <label style={labelStyle}>Adjuntar PDF:</label>
              <label
                style={{
                  height: 42,
                  border: '1.5px dashed #cfd6e2',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: file ? 'var(--ink)' : '#a3abba',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {file ? `📄 ${file.name}` : '⬆ Elegir archivo PDF'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <button
              disabled={!canProcess}
              onClick={handleUpload}
              style={{
                height: 42,
                padding: '0 18px',
                borderRadius: 8,
                border: 'none',
                background: canProcess ? 'var(--blue)' : '#8a94a6',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: canProcess ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              {status === 'uploading' || status === 'processing' ? 'Procesando…' : 'Procesar Archivo'}
            </button>
            {status === 'done' && remitosCargados.length > 0 && (
              <button
                onClick={handleDiscard}
                disabled={discarding}
                title="Descartar comprobante procesado"
                aria-label="Descartar"
                style={{
                  height: 42,
                  width: 42,
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  border: '1px solid #f0c6c6',
                  background: '#fff',
                  color: 'var(--err)',
                  cursor: discarding ? 'not-allowed' : 'pointer',
                  opacity: discarding ? 0.6 : 1,
                  padding: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            )}
          </div>

          {(status === 'uploading' || status === 'processing') && (
            <div style={{ marginTop: 16 }}>
              <div style={{ height: 8, background: '#eef1f6', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#6f8fd6,#2563eb)', transition: 'width .4s ease' }} />
              </div>
              <div className="ds-scroll" style={{ maxHeight: 110, overflow: 'auto', fontSize: 12.5, color: 'var(--muted)' }}>
                {log.map((e, i) => (
                  <div key={i} style={{ padding: '3px 0' }}>
                    {e.text}
                  </div>
                ))}
              </div>
            </div>
          )}
          {errorMsg && (
            <div style={{ marginTop: 12, background: 'var(--err-weak)', color: 'var(--err)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div style={{ marginTop: 12, background: '#eefaf2', color: 'var(--ok)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
              {successMsg}
            </div>
          )}
        </section>

        <section style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div className="ds-scroll" style={{ height: 360, overflow: 'auto' }}>
            <div style={{ minWidth: 600 }}>
              <div style={gridHeaderStyle}>
                <span>CÓDIGO</span>
                <span>
                  PRODUCTO <span style={countBadge}>{filas.length}</span>
                </span>
                <span style={{ textAlign: 'right' }}>CANT.</span>
                <span style={{ textAlign: 'right' }}>PRECIO UNIT.</span>
                <span style={{ textAlign: 'right' }}>TOTAL</span>
              </div>
              {visibleFilas.length === 0 && (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--muted-3)', fontSize: 13 }}>
                  {status === 'done' ? 'Sin artículos.' : 'Subí un comprobante para ver los artículos acá.'}
                </div>
              )}
              {visibleFilas.map(({ remitoId, color, articulo }) => {
                const isSel = remitoSel === remitoId;
                const dimmed = remitoSel && !isSel;
                return (
                  <div
                    key={articulo.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 1fr 90px 140px 130px',
                      gap: 10,
                      alignItems: 'center',
                      padding: '11px 20px',
                      borderTop: '1px solid #f2f4f8',
                      opacity: dimmed ? 0.3 : 1,
                    }}
                  >
                    <EditableCell
                      value={articulo.codigo}
                      editing={editCell?.itemId === articulo.id && editCell.field === 'codigo'}
                      onStartEdit={() => setEditCell({ remitoId, itemId: articulo.id, field: 'codigo' })}
                      onChange={(v) => updateArticuloLocal(remitoId, articulo.id, 'codigo', v)}
                      onCommit={commitEdit}
                      align="left"
                      muted
                    />
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: color }} />
                      <EditableCell
                        value={articulo.nombre}
                        editing={editCell?.itemId === articulo.id && editCell.field === 'nombre'}
                        onStartEdit={() => setEditCell({ remitoId, itemId: articulo.id, field: 'nombre' })}
                        onChange={(v) => updateArticuloLocal(remitoId, articulo.id, 'nombre', v)}
                        onCommit={commitEdit}
                        align="left"
                        grow
                      />
                    </span>
                    <EditableCell
                      value={String(articulo.cantidad)}
                      editing={editCell?.itemId === articulo.id && editCell.field === 'cantidad'}
                      onStartEdit={() => setEditCell({ remitoId, itemId: articulo.id, field: 'cantidad' })}
                      onChange={(v) => updateArticuloLocal(remitoId, articulo.id, 'cantidad', v.replace(/[^0-9]/g, ''))}
                      onCommit={commitEdit}
                      align="right"
                      bold
                    />
                    <EditableCell
                      value={money(articulo.precio_unitario)}
                      rawValue={String(articulo.precio_unitario)}
                      editing={editCell?.itemId === articulo.id && editCell.field === 'precio_unitario'}
                      onStartEdit={() => setEditCell({ remitoId, itemId: articulo.id, field: 'precio_unitario' })}
                      onChange={(v) => updateArticuloLocal(remitoId, articulo.id, 'precio_unitario', v.replace(/[^0-9.,]/g, ''))}
                      onCommit={commitEdit}
                      align="right"
                    />
                    <span style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ink-2)' }} title="Se calcula automáticamente">
                      {money(articulo.total_unitario ?? round2(toCantidad(articulo.cantidad) * toPrecio(articulo.precio_unitario)))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: 230 }}>
              <label style={labelStyle}>Nº Factura <span style={{ fontWeight: 400, color: 'var(--muted-3)' }}>· doble clic para editar</span></label>
              {editHeader?.field === 'facturaNro' ? (
                <input
                  autoFocus
                  defaultValue={remitosCargados[0]?.facturaNro ?? ''}
                  onBlur={(e) => {
                    updateRemitoField(remitosCargados[0]?.id ?? '', 'facturaNro', e.target.value, true);
                    setEditHeader(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      setEditHeader(null);
                    }
                  }}
                  style={headerInputStyle}
                />
              ) : (
                <div
                  onDoubleClick={() => remitosCargados.length > 0 && setEditHeader({ id: remitosCargados[0].id, field: 'facturaNro' })}
                  title="Doble clic para editar"
                  style={{ ...readonlyBoxStyle, cursor: remitosCargados.length > 0 ? 'text' : 'default' }}
                >
                  {remitosCargados[0]?.facturaNro || '—'}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 260, flex: 1 }}>
              <label style={labelStyle}>
                Nº Remito <span style={{ fontWeight: 400, color: 'var(--muted-3)' }}>· clic para marcar sus artículos · doble clic para editar Nº</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                {remitosCargados.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted-3)' }}>—</span>}
                {remitosCargados.map((r, i) => {
                  const { color, light } = colorFor(i);
                  const active = remitoSel === r.id;
                  if (editHeader?.field === 'remitoNro' && editHeader.id === r.id) {
                    return (
                      <input
                        key={r.id}
                        autoFocus
                        defaultValue={r.remitoNro ?? ''}
                        onBlur={(e) => {
                          updateRemitoField(r.id, 'remitoNro', e.target.value);
                          setEditHeader(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          } else if (e.key === 'Escape') {
                            setEditHeader(null);
                          }
                        }}
                        style={{ ...headerInputStyle, width: 230, height: 34 }}
                      />
                    );
                  }
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRemitoSel((cur) => (cur === r.id ? null : r.id))}
                      onDoubleClick={() => setEditHeader({ id: r.id, field: 'remitoNro' })}
                      title="Clic: marcar artículos · Doble clic: editar Nº"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        height: 34,
                        padding: '0 13px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${active ? color : 'var(--border-2)'}`,
                        background: active ? light : '#fff',
                        color: active ? color : '#3a4352',
                      }}
                    >
                      <span style={{ width: 9, height: 9, flex: 'none', borderRadius: '50%', background: color }} />
                      <span>{r.remitoNro || '(sin número)'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ minWidth: 260, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {tipoComp === 'factura' && (
              <>
                <TotalLine k="Subtotal:" v={money(totals.subtotal)} />
                {totals.descuentos > 0 && <TotalLine k="Bonificaciones:" v={'- ' + money(totals.descuentos)} />}
                <TotalLine k="Percepciones" v={money(totals.percepciones)} />
                <TotalLine k="IVA:" v={money(totals.iva)} />
                <div style={{ height: 1, background: '#eef1f6', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, fontWeight: 800, color: 'var(--blue)' }}>
                  <span>Total:</span>
                  <span>{money(totals.total)}</span>
                </div>
              </>
            )}
            <button
              disabled={scope.length === 0 || approving}
              onClick={handleProcesar}
              style={{
                marginTop: 8,
                height: 46,
                borderRadius: 9,
                border: 'none',
                background: scope.length === 0 || approving ? '#a9b7dd' : '#6f8fd6',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: scope.length === 0 || approving ? 'not-allowed' : 'pointer',
              }}
            >
              {approving ? 'Procesando…' : 'Procesar factura'}
            </button>
          </div>
        </section>
    </div>
  );
}

function TotalLine({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--muted)' }}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

interface EditableCellProps {
  value: string;
  rawValue?: string;
  editing: boolean;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  align: 'left' | 'right';
  bold?: boolean;
  muted?: boolean;
  grow?: boolean;
}

function EditableCell({ value, rawValue, editing, onStartEdit, onChange, onCommit, align, bold, muted, grow }: EditableCellProps) {
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={rawValue ?? value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
        style={{
          width: '100%',
          height: 32,
          border: '1px solid var(--blue)',
          borderRadius: 6,
          padding: '0 8px',
          fontSize: '13.5px',
          color: 'var(--ink)',
          outline: 'none',
          background: '#fff',
          textAlign: align,
        }}
      />
    );
  }
  return (
    <span
      onDoubleClick={onStartEdit}
      title="Doble clic para editar"
      style={{
        textAlign: align,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: bold ? 700 : undefined,
        color: bold ? 'var(--navy)' : muted ? 'var(--muted-2)' : 'var(--ink-2)',
        fontSize: muted ? '12.5px' : 14,
        cursor: 'text',
        overflow: grow ? 'hidden' : undefined,
        textOverflow: grow ? 'ellipsis' : undefined,
        whiteSpace: grow ? 'nowrap' : undefined,
      }}
    >
      {value}
    </span>
  );
}

function percentOf(ev: JobEventDto): number | null {
  if (ev.type === 'completed') return 100;
  if (ev.type === 'active') return 5;
  if (ev.type === 'waiting') return 2;
  if (ev.type === 'progress') {
    const d = ev.data;
    if (typeof d === 'number') return d;
    if (d && typeof d === 'object' && 'progress' in d) return Number((d as { progress: unknown }).progress) || 0;
  }
  return null;
}

function labelOf(ev: JobEventDto): string {
  switch (ev.type) {
    case 'waiting':
      return 'En cola…';
    case 'active':
      return 'Job activo, iniciando procesamiento';
    case 'progress': {
      const d = ev.data;
      const p = typeof d === 'number' ? d : d && typeof d === 'object' && 'progress' in d ? (d as { progress: unknown }).progress : '';
      const step = d && typeof d === 'object' && 'step' in d ? ' · ' + (d as { step: unknown }).step : '';
      return `Progreso ${p ?? ''}%${step}`;
    }
    case 'completed':
      return 'Procesamiento completado ✓';
    case 'failed':
      return `Falló: ${typeof ev.data === 'string' ? ev.data : 'error desconocido'}`;
    default:
      return ev.type;
  }
}

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '20px 22px',
};

const fieldColStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  minWidth: 200,
  flex: 1,
};

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--muted)' };

const selectStyle: CSSProperties = {
  height: 42,
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  padding: '0 13px',
  fontSize: 14,
  color: 'var(--ink)',
  background: '#fff',
};

const headerInputStyle: CSSProperties = {
  height: 42,
  border: '1px solid var(--blue)',
  borderRadius: 8,
  padding: '0 13px',
  fontSize: 14,
  color: 'var(--ink)',
  outline: 'none',
  background: '#fff',
  width: '100%',
};

const readonlyBoxStyle: CSSProperties = {
  height: 42,
  border: '1px solid var(--border-2)',
  borderRadius: 8,
  background: '#fff',
  display: 'flex',
  alignItems: 'center',
  padding: '0 13px',
  fontSize: 14,
  color: 'var(--ink)',
};

const gridHeaderStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '140px 1fr 90px 140px 130px',
  gap: 10,
  padding: '14px 20px',
  borderBottom: '1px solid #eef1f6',
  background: '#f8fafc',
  fontSize: 13,
  fontWeight: 700,
  color: '#414a58',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const countBadge: CSSProperties = {
  background: '#e7ecf5',
  color: '#5b6472',
  borderRadius: 6,
  padding: '1px 7px',
  fontSize: 11,
  marginLeft: 4,
};
