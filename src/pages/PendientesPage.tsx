import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../context/data-context';
import { remitosApi } from '../api/remitos';
import { money, fmtDate, fmtCantidad } from '../utils/money';
import { toNumero } from '../utils/numero';
import { PENDIENTES_ESTADOS } from '../utils/estados';
import { applyFilters, type RemitoFilters } from '../utils/filtros';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BadgeOrdenCompra, IconosMatch, Spinner } from '../components/OrdenCompra';
import { useOrdenCompra } from '../hooks/useOrdenCompra';
import { useProcesosFallidos } from '../hooks/useProcesosFallidos';
import type { Articulo, Remito } from '../types/api';

type ConfirmAction = { type: 'factura' | 'stock'; remito: Remito };

const MAX_ITEMS_HEIGHT = 430; // ~10 filas visibles; el resto scrollea

interface Props {
  filters: RemitoFilters;
  focusId?: string | null;
  onFocusHandled?: () => void;
}

export function PendientesPage({ filters, focusId, onFocusHandled }: Props) {
  const { remitos, remitosLoading, remitosError, refreshRemito, removeRemitoLocal, patchRemitoLocal, proveedores, sucursales, sucursalId } = useData();
  const pendientes = useMemo(
    () => applyFilters(remitos.filter((r) => PENDIENTES_ESTADOS.has(r.estado)), filters),
    [remitos, filters],
  );
  // Estado de la validación contra la orden de compra, por jobId. Un solo juego
  // de suscripciones al stream para toda la pantalla (no se puede llamar un hook
  // por fila, y tampoco haría falta: el stream es uno).
  const { estados: ordenCompraPorJob, marcarEnProceso } = useOrdenCompra();

  // Fallos definitivos, del estado persistido en el job. No dependen de haber estado
  // conectado cuando ocurrieron: sobreviven a un refresh.
  const procesosFallidos = useProcesosFallidos();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Modal de confirmación antes de cargar factura / stock.
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Modo edición (mostrar casillas) por remito, y selección de artículos por remito.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [selectedByRemito, setSelectedByRemito] = useState<Record<string, Set<string>>>({});
  // Artículos colapsados por defecto; se expanden por remito al clickear el encabezado.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // El DataContext ya recarga los remitos al montar y cuando cambian sucursal/filtros
  // (reloadRemitos depende de ellos). Evitamos recargar también acá para no disparar
  // dos requests en paralelo por cada cambio de filtro (era la causa del "pantallazo").

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

  const sucName = (r: Remito) => {
    const sid = r.sucursalId ?? r.sucursal?.id;
    return sucursales.find((s) => s.id === sid)?.nombre ?? r.sucursal?.nombre ?? '—';
  };
  // Solo mostramos la sucursal en cada card cuando el filtro global es "Todas".
  const mostrarSucursal = sucursalId === '';

  // Total de unidades (suma de cantidades) de los artículos indicados (o todos).
  const totalUnidades = (r: Remito, sel?: Set<string>) =>
    (r.articulos ?? [])
      .filter((a) => !sel || sel.has(a.id))
      // toNumero y no `Number(...) || 0`: con `cantidad: '1,5'` (la columna llega
      // como string según el driver) Number() da NaN y el `|| 0` lo convertía en 0,
      // así que un artículo de 1,5 unidades no contaba.
      .reduce((acc, a) => acc + toNumero(a.cantidad), 0);

  // Total de la factura: usa el del back si viene, sino lo reconstruye desde los ítems.
  const totalFacturaOf = (r: Remito) => {
    const items = r.articulos ?? [];
    const artSubtotal = items.reduce((a, it) => a + Number(it.total_unitario || 0), 0);
    const subtotal = Number(r.subtotal) > 0 ? Number(r.subtotal) : artSubtotal;
    const iva = Number(r.iva || 0);
    const percepciones = Number(r.percepciones || 0);
    const descuentos = Number(r.descuentos || 0);
    return Number(r.total) > 0 ? Number(r.total) : subtotal - descuentos + percepciones + iva;
  };

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
    const seleccionados = [...getSelected(r)];
    if (seleccionados.length === 0) {
      setNotice('Seleccioná al menos un artículo para cargar al stock.');
      return;
    }
    setBusyId(r.id);
    setNotice(null);
    try {
      // Enviamos los UUID de los artículos marcados; el back procesa la carga a stock.
      // submitMercaderia lanza si no es 2xx; si resuelve, fue 200 → actualizamos SOLO
      // en el front, sin refetch (evita el "pantallazo" de recargar toda la lista).
      await remitosApi.submitMercaderia(r.id, seleccionados);
      const cargados = new Set(seleccionados);
      const restantes = (r.articulos ?? []).filter((a) => !cargados.has(a.id));
      if (restantes.length === 0) {
        removeRemitoLocal(r.id); // se cargó todo el remito → sale de pendientes
      } else {
        patchRemitoLocal(r.id, { articulos: restantes }); // carga parcial: quedan artículos
      }
      setNotice(`Remito ${r.remitoNro || r.id.slice(0, 8)}: ${seleccionados.length} artículo(s) enviados a stock.`);
      setEditingIds((prev) => {
        const n = new Set(prev);
        n.delete(r.id);
        return n;
      });
    } catch (e) {
      setNotice(e instanceof Error ? `Error: ${e.message}` : 'No se pudo cargar el stock');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCargarFactura(r: Remito) {
    try {
      setBusyId(r.id);
      setNotice(null);
      // El spinner arranca ACÁ, no cuando llega `proceso.encolado`.
      //
      // Esta acción dispara la validación contra la orden de compra, así que el
      // front ya sabe que hay algo en curso: esperar la confirmación del servidor
      // para mostrarlo hacía que el indicador dependiera de que un evento llegue
      // dentro de una ventana de ~150ms. Los eventos siguen apagándolo y siguen
      // siendo la única fuente del estado de fallo.
      if (r.jobId) marcarEnProceso(r.jobId);
      await remitosApi.submitFactura(r.id);
      setNotice(`Remito ${r.remitoNro || r.id.slice(0, 8)}: factura cargada correctamente.`);
      // Sólo esta card, no la lista entera: reloadRemitos() reemplazaba el array
      // completo y hacía perder el scroll justo cuando empiezan a llegar los
      // eventos de la orden de compra.
      await refreshRemito(r.id);
    } catch (e) {
      setNotice(e instanceof Error ? `Error: ${e.message}` : 'No se pudo cargar la factura');
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

      {/*
        Fallos definitivos, derivados del estado persistido del job.
        Antes eran INVISIBLES: el job quedaba en `error` en la base y ninguna
        pantalla lo consultaba. El operador veía que su comprobante no aparecía y no
        tenía forma de saber si tardaba o si había fallado.
      */}
      {procesosFallidos.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 1100 }}>
          {procesosFallidos.map((f) => {
            // Un fallo de extracción invalida el comprobante: hay que volver a
            // subirlo. Uno de orden de compra sólo invalida el cruce de precios, los
            // remitos siguen siendo usables. Igualarlos haría que el operador tratara
            // el segundo como el primero.
            const grave = f.etapa === 'extraccion';
            return (
              <div
                key={`${f.processId}-${f.etapa}`}
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: grave ? 'var(--err-weak)' : '#fdf8ec',
                  color: grave ? 'var(--err)' : 'var(--warn)',
                  border: `1px solid ${grave ? '#f0c6c6' : '#f3dca6'}`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 13,
                }}
              >
                <strong style={{ fontWeight: 700 }}>
                  {grave ? 'No se procesó' : 'Orden de compra no verificada'}
                </strong>
                <span>{f.mensaje}</span>
                {f.errorCode && (
                  <code style={{ marginLeft: 'auto', fontSize: 11.5, opacity: 0.75 }}>{f.errorCode}</code>
                )}
              </div>
            );
          })}
        </div>
      )}

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
      {/* Sólo en la carga inicial. Si se muestra durante un refetch con datos ya en
          pantalla, la lista se desmonta, la página colapsa a casi 0 de alto y el
          navegador manda el scroll arriba de todo. */}
      {remitosLoading && pendientes.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted-3)' }}>Cargando remitos…</div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          maxWidth: 1100,
          // Durante un refetch la lista SIGUE MONTADA (no hay `!remitosLoading &&`
          // en el map): se atenúa apenas para dar feedback sin perder el scroll ni
          // desmontar las cards.
          opacity: remitosLoading && pendientes.length > 0 ? 0.6 : 1,
          transition: 'opacity .15s ease',
        }}
      >
        {!remitosLoading && pendientes.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted-3)', padding: '20px 0' }}>No hay remitos pendientes.</div>
        )}
        {pendientes.map((r) => {
          const editing = editingIds.has(r.id);
          const items = r.articulos ?? [];
          const selected = getSelected(r);
          const selCount = items.filter((it) => selected.has(it.id)).length;
          const allSel = items.length > 0 && selCount === items.length;
          // Artículos colapsados por defecto; en modo edición se muestran siempre.
          const expanded = expandedIds.has(r.id);
          const showItems = expanded || editing;
          // "Factura a cargar": el remito ya fue cargado y falta cargar la factura
          // (facturaCargada !== true). En estas cards mostramos el desglose económico y
          // NO permitimos editar (solo cargar). Si el remito trae los totales en 0 aún sin
          // consolidar, calculamos el subtotal desde los artículos.
          const esFacturaACargar = r.facturaCargada !== true;
          const artSubtotal = items.reduce((a, it) => a + Number(it.total_unitario || 0), 0);
          const subtotal = Number(r.subtotal) > 0 ? Number(r.subtotal) : artSubtotal;
          const iva = Number(r.iva || 0);
          const percepciones = Number(r.percepciones || 0);
          const descuentos = Number(r.descuentos || 0);
          const totalFactura = Number(r.total) > 0 ? Number(r.total) : subtotal - descuentos + percepciones + iva;
          // El flujo de orden de compra publica su progreso con processId = jobId.
          const estadoOc = r.jobId ? ordenCompraPorJob[r.jobId] : undefined;
          const ocProcesando = estadoOc === 'procesando';
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
                  borderLeft: '3px solid #D8AA12',
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
                  {mostrarSucursal && <HeadCell label="SUCURSAL" value={sucName(r)} />}
                  <HeadCell label="ESTADO" value={r.facturaCargada === true ? 'Factura cargada' : 'Remito Cargado'} />
                  {estadoOc && <BadgeOrdenCompra estado={estadoOc} />}
                </div>
                <span style={{ fontSize: 13, color: 'var(--muted-2)', fontWeight: 600 }}>{fmtDate(r.fecha)}</span>
              </div>
              <div style={{ padding: '10px 22px 14px', flex: 1 }}>
                <div
                  onClick={() => toggleExpanded(r.id)}
                  title={showItems ? 'Ocultar artículos' : 'Ver artículos'}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '.4px', color: 'var(--muted-3)', padding: '10px 0 4px', borderBottom: '1px solid #eef1f6', cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ transform: showItems ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease', flex: 'none' }}>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    {/* Con los artículos colapsados no se ven los indicadores, así
                        que el resumen va acá para no tener que expandir la card. */}
                    {!showItems && items.length > 0 && (
                      <ResumenMatch items={items} procesando={ocProcesando} />
                    )}
                    {editing && (
                      <input
                        type="checkbox"
                        checked={allSel}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleAll(r)}
                        title="Marcar / desmarcar todos"
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#2563eb' }}
                      />
                    )}
                    ARTÍCULOS
                    <span style={{ fontWeight: 700, color: 'var(--blue)', letterSpacing: 0 }}>{items.length}</span>
                    {editing && (
                      <span style={{ fontWeight: 600, color: 'var(--blue)', letterSpacing: 0 }}>
                        · {selCount}/{items.length} seleccionados
                      </span>
                    )}
                  </span>
                  {showItems && <span>CANT.</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateRows: showItems ? '1fr' : '0fr', transition: 'grid-template-rows .28s ease' }}>
                  <div style={{ overflow: 'hidden', minHeight: 0 }}>
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                          {/*
                            Amarillo mientras se consulta la orden de compra, después
                            verde o rojo según el flag. Los dos van juntos porque
                            mientras la consulta está en vuelo NINGUNO de los dos
                            flags es confiable.
                          */}
                          <IconosMatch
                            estado={ocProcesando ? 'procesando' : 'resuelto'}
                            precioMatch={it.precioMatch}
                            stockMatch={it.stockMatch}
                          />
                          {/*
                            minWidth fijo + tabular-nums: sin esto el ancho del
                            badge depende del número (165 vs 5) y los iconos de la
                            izquierda quedaban en una columna distinta en cada fila.
                            Los dígitos tabulares además evitan que "111" y "999"
                            midan diferente.
                          */}
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: 'var(--navy)',
                              background: 'var(--blue-weak)',
                              borderRadius: 6,
                              padding: '2px 10px',
                              minWidth: 58,
                              textAlign: 'center',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {fmtCantidad(it.cantidad)}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '14px 22px 16px', borderTop: '1px solid #eef1f6', display: 'flex', flexDirection: 'column', gap: 12, background: esFacturaACargar ? '#fbfcfe' : '#fff' }}>
                {esFacturaACargar && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', fontSize: 12.5, color: 'var(--muted-2)' }}>
                    <EcoInline k="Subtotal" v={money(subtotal)} />
                    {descuentos > 0 && <EcoInline k="Bonificaciones" v={'- ' + money(descuentos)} sep />}
                    <EcoInline k="Percepciones" v={money(percepciones)} sep />
                    <EcoInline k="IVA" v={money(iva)} sep />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  {esFacturaACargar ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', color: 'var(--muted-2)' }}>TOTAL</span>
                      <span style={{ fontSize: 23, fontWeight: 800, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{money(totalFactura)}</span>
                    </div>
                  ) : (
                    <span />
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {!esFacturaACargar && (
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
                        {editing ? 'Listo' : 'Seleccionar artículos'}
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmAction({ type: esFacturaACargar ? 'factura' : 'stock', remito: r })}
                      disabled={busyId === r.id || (editing && selCount === 0)}
                      style={{
                        height: 44,
                        padding: '0 26px',
                        borderRadius: 9,
                        border: 'none',
                        background: busyId === r.id || (editing && selCount === 0) ? '#8a94a6' : 'var(--ok)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: busyId === r.id || (editing && selCount === 0) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {busyId === r.id ? 'Cargando…' : editing ? `Cargar (${selCount})` : r.facturaCargada === true ? 'Cargar Remito' : 'Cargar Factura'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {confirmAction && (() => {
        const r = confirmAction.remito;
        const esFactura = confirmAction.type === 'factura';
        const rows: [string, string][] = esFactura
          ? [
              ['Nº Factura', r.facturaNro || '—'],
              ['Nº Remito', r.remitoNro || '—'],
              ['Proveedor', provName(r)],
              ['Total', money(totalFacturaOf(r))],
            ]
          : [
              ['Nº Remito', r.remitoNro || '—'],
              ['Proveedor', provName(r)],
              ['Items', String(totalUnidades(r, getSelected(r)))],
            ];
        return (
          <ConfirmDialog
            open
            busy={busyId === r.id}
            title={esFactura ? 'Confirmar carga de factura' : 'Confirmar carga de remito'}
            confirmLabel={esFactura ? 'Cargar factura' : 'Cargar remito'}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => {
              setConfirmAction(null);
              if (esFactura) handleCargarFactura(r);
              else handleCargarStock(r);
            }}
            message={
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 8, columnGap: 16, marginTop: 4 }}>
                {rows.map(([k, v]) => (
                  <Fragment key={k}>
                    <span style={{ color: 'var(--muted-2)', fontWeight: 600 }}>{k}</span>
                    <span style={{ color: 'var(--ink-2)', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </Fragment>
                ))}
              </div>
            }
          />
        );
      })()}
    </div>
  );
}

/**
 * Contador de artículos observados, para verlo con la card colapsada.
 *
 * "Observado" = no coincide en cantidad, o no coincide en precio, o no figura en
 * la orden de compra. Los tres casos son indistinguibles con los flags actuales
 * (ver la nota del tercer estado en types/api.ts).
 */
function ResumenMatch({ items, procesando }: { items: Articulo[]; procesando: boolean }) {
  if (procesando) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--warn)', fontWeight: 700, letterSpacing: 0 }}>
        <Spinner size={11} />
        verificando OC
      </span>
    );
  }

  // Sin verificar (null) NO cuenta como observado: contarlo sería reportar un
  // problema que nadie comprobó. Sólo el `false` explícito es una diferencia real.
  const sinVerificar = items.every((it) => it.precioMatch == null && it.stockMatch == null);
  if (sinVerificar) {
    return (
      <span
        title="Orden de compra pendiente de verificar. Se controla al cargar la factura."
        style={{ color: 'var(--warn)', fontWeight: 700, letterSpacing: 0, cursor: 'help' }}
      >
        OC Pend.
      </span>
    );
  }

  const observados = items.filter((it) => it.precioMatch === false || it.stockMatch === false).length;
  const ok = observados === 0;

  return (
    <span
      title={
        ok
          ? 'Todos los artículos coinciden con la orden de compra'
          : `${observados} de ${items.length} artículo(s) no coinciden con la orden de compra`
      }
      style={{ color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 700, letterSpacing: 0, cursor: 'help' }}
    >
      {ok ? '✓ OC OK' : `${observados} obs.`}
    </span>
  );
}

function EcoInline({ k, v, sep }: { k: string; v: string; sep?: boolean }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {sep && <span style={{ color: 'var(--muted-3)', marginRight: 8 }}>·</span>}
      {k} <b style={{ fontWeight: 700, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{v}</b>
    </span>
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
