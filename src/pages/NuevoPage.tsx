import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useData } from '../context/DataContext';
import { createFactura, subscribeFacturaEvents } from '../api/facturas';
import { remitosApi } from '../api/remitos';
import type { Articulo, JobEventDto, Remito } from '../types/api';
import { money, parseMoneyInput } from '../utils/money';
import { colorFor } from '../utils/colors';
import { PENDIENTES_ESTADOS } from '../utils/estados';
import { useSessionBoolean } from '../hooks/useSessionState';

type TipoComp = 'factura' | 'remito';
type Status = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface Props {
  onGoToPendientes: (remitoId?: string) => void;
}

export function NuevoPage({ onGoToPendientes }: Props) {
  const { proveedores, sucursales, sucursalId, setSucursal, remitos, reloadRemitos } = useData();

  const [tipoComp, setTipoComp] = useState<TipoComp>('factura');
  const [proveedorId, setProveedorId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [log, setLog] = useState<{ text: string; type: string }[]>([]);
  const [pct, setPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [remitosCargados, setRemitosCargados] = useState<Remito[]>([]);
  const [remitoSel, setRemitoSel] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ remitoId: string; itemId: string; field: keyof Articulo } | null>(null);
  const [approving, setApproving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendCollapsed, setPendCollapsed] = useSessionBoolean('ficha_pend_collapsed', false);

  const closeSseRef = useRef<(() => void) | null>(null);
  useEffect(() => () => closeSseRef.current?.(), []);

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

  function updateArticuloLocal(remitoId: string, articuloId: string, field: keyof Articulo, value: string) {
    setRemitosCargados((prev) =>
      prev.map((r) =>
        r.id !== remitoId
          ? r
          : {
              ...r,
              articulos: (r.articulos ?? []).map((a) => (a.id !== articuloId ? a : { ...a, [field]: value })),
            },
      ),
    );
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
      await Promise.all(scope.map((r) => remitosApi.approve(r.id)));
      setSuccessMsg('Comprobante(s) aprobado(s) correctamente.');
      setRemitosCargados([]);
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

  const pendientesPreview = useMemo(
    () => remitos.filter((r) => PENDIENTES_ESTADOS.has(r.estado)).slice(0, 8),
    [remitos],
  );

  const tipoBtnStyle = (active: boolean): CSSProperties => ({
    padding: '7px 18px',
    border: 'none',
    borderRadius: 7,
    fontSize: '13.5px',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? 'var(--blue)' : 'transparent',
    color: active ? '#fff' : 'var(--muted)',
    boxShadow: active ? '0 1px 2px rgba(18,50,122,.18)' : 'none',
  });

  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Tipo de comprobante</label>
          <div style={{ display: 'inline-flex', background: '#eef1f6', border: '1px solid var(--border)', borderRadius: 9, padding: 3 }}>
            <button onClick={() => setTipoComp('factura')} style={tipoBtnStyle(tipoComp === 'factura')}>
              Factura
            </button>
            <button onClick={() => setTipoComp('remito')} style={tipoBtnStyle(tipoComp === 'remito')}>
              Remito
            </button>
          </div>
          {tipoComp === 'remito' && (
            <span style={{ fontSize: 12, color: 'var(--muted-3)' }}>
              La API sólo tiene un endpoint de carga (factura); el PDF se procesa igual, sin desglose de IVA abajo.
            </span>
          )}
        </div>

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
                padding: '0 22px',
                borderRadius: 8,
                border: 'none',
                background: canProcess ? 'var(--blue)' : '#8a94a6',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: canProcess ? 'pointer' : 'not-allowed',
              }}
            >
              {status === 'uploading' || status === 'processing' ? 'Procesando…' : 'Procesar Archivo'}
            </button>
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
                      {money(articulo.total_unitario ?? Number(articulo.cantidad) * parseMoneyInput(String(articulo.precio_unitario)))}
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
              <label style={labelStyle}>Nº Factura</label>
              <div style={readonlyBoxStyle}>{remitosCargados[0]?.facturaNro || '—'}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 260, flex: 1 }}>
              <label style={labelStyle}>
                Nº Remito <span style={{ fontWeight: 400, color: 'var(--muted-3)' }}>· tocá para marcar sus artículos</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                {remitosCargados.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted-3)' }}>—</span>}
                {remitosCargados.map((r, i) => {
                  const { color, light } = colorFor(i);
                  const active = remitoSel === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRemitoSel((cur) => (cur === r.id ? null : r.id))}
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
              {approving ? 'Procesando…' : 'Procesar'}
            </button>
          </div>
        </section>
      </div>

      <aside
        style={{
          width: pendCollapsed ? 56 : 326,
          flex: 'none',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width .18s ease',
        }}
      >
        {pendCollapsed ? (
          <button
            onClick={() => setPendCollapsed(false)}
            title="Expandir remitos pendientes"
            style={{
              flex: 1,
              width: '100%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              padding: '16px 0',
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                flex: 'none',
                borderRadius: 6,
                border: '1px solid #e0e4ec',
                background: '#fff',
                color: 'var(--muted-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </span>
            <span style={{ color: 'var(--blue)', display: 'flex' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8l-9-5-9 5v8l9 5 9-5Z" />
                <path d="M3.3 7 12 12l8.7-5" />
                <path d="M12 22V12" />
              </svg>
            </span>
            <span
              style={{
                background: 'var(--blue)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 800,
                borderRadius: 999,
                minWidth: 22,
                height: 22,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 6px',
              }}
            >
              {pendientesPreview.length}
            </span>
            <span
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontSize: '12.5px',
                fontWeight: 800,
                letterSpacing: '.5px',
                color: 'var(--navy)',
                marginTop: 6,
              }}
            >
              Remitos Pendientes
            </span>
          </button>
        ) : (
          <>
            <div style={{ padding: '16px 18px 13px', borderBottom: '1px solid #eef1f6', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>Remitos Pendientes</div>
                <div style={{ fontSize: 12, color: 'var(--muted-3)', marginTop: 2 }}>Tocá una tarjeta para gestionar</div>
              </div>
              <span style={{ background: 'var(--blue-weak)', color: 'var(--blue)', fontSize: 13, fontWeight: 800, borderRadius: 999, minWidth: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
                {pendientesPreview.length}
              </span>
              <button
                onClick={() => setPendCollapsed(true)}
                title="Contraer"
                style={{
                  width: 26,
                  height: 26,
                  flex: 'none',
                  borderRadius: 6,
                  border: '1px solid #e0e4ec',
                  background: '#fff',
                  color: 'var(--muted-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            <div className="ds-scroll" style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendientesPreview.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--muted-3)', textAlign: 'center', padding: '20px 0' }}>Sin remitos pendientes.</div>
              )}
              {pendientesPreview.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onGoToPendientes(r.id)}
                  style={{
                    textAlign: 'left',
                    background: '#f9fbfe',
                    border: '1px solid #e3e9f3',
                    borderLeft: '4px solid #2563eb',
                    borderRadius: 10,
                    padding: '13px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', color: 'var(--muted-2)' }}>REMITO</span>
                    <span style={{ fontSize: 11, color: '#b6bdc9' }}>{r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR') : ''}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{r.remitoNro || '(sin número)'}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{r.proveedor?.nombre ?? '—'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{(r.articulos?.length ?? 0)} artículos</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>Ver →</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
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
