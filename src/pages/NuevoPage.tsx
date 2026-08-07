import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useData } from '../context/data-context';
import { useAuth } from '../context/auth-context';
import { permsFor } from '../utils/roles';
import { createFactura } from '../api/facturas';
import { remitosApi } from '../api/remitos';
import { approveFactura } from '../api/facturas';
import { ApiError } from '../api/client';
import { STAGES_EXTRACCION, useProceso } from '../hooks/useProceso';
import type { ProcesoStage } from '../types/events';
import type { Articulo, Remito, RemitoTipo } from '../types/api';
import { money } from '../utils/money';
import { round2, toNumero } from '../utils/numero';
import { colorFor } from '../utils/colors';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PanelAdvertencias } from '../components/PanelAdvertencias';
import { formatNroComprobante, normalizarNroComprobante } from '../utils/comprobante';
import { soloAvisos, soloErrores, validarLote } from '../utils/validacionFactura';
import { useLocalStorage } from '../hooks/useLocalStorage';

type Status = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface Props {
  tipoComp: RemitoTipo;
  // Salto a la pestaña Configuración (para el aviso de catálogos vacíos).
  onGoConfig?: () => void;
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

// `toCantidad`/`toPrecio` locales se reemplazaron por `toNumero` de utils/numero.ts.
// Eran dos de los tres parseos distintos que existían para los mismos campos: el
// mismo artículo mostraba 1,5 acá, contaba como 0 en Pendientes y se desplegaba como
// "1" en el formateo.
const toCantidad = toNumero;
const toPrecio = toNumero;

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

export function NuevoPage({ tipoComp, onGoConfig }: Props) {
  const { proveedores, sucursales, catalogosLoading, sucursalId, setSucursal, reloadRemitos } = useData();
  const { auth } = useAuth();
  const perms = permsFor(auth);

  // Persistido en localStorage (igual que la sucursal) para que sobreviva al cerrar/abrir.
  const [proveedorId, setProveedorId] = useLocalStorage('ficha_proveedor_id');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>(() => (loadStored(STORAGE_KEY).length > 0 ? 'done' : 'idle'));
  const [, setLog] = useState<{ text: string; type: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Proceso que esta pantalla está mirando. El stream ya está abierto a nivel
  // sesión: acá sólo se declara "me interesa este processId".
  const [jobId, setJobId] = useState<string | null>(null);
  // Sólo las etapas de extracción: la validación contra la orden de compra usa el
  // mismo processId (el jobId) y sus eventos no deben mover esta barra.
  const proceso = useProceso(jobId, STAGES_EXTRACCION);
  const pct = status === 'uploading' ? 2 : proceso.pct;

  const [remitosCargados, setRemitosCargados] = useState<Remito[]>(() => loadStored(STORAGE_KEY));
  const [originalRemitos, setOriginalRemitos] = useState<Remito[]>(() => loadStored(ORIGINAL_KEY));
  const [remitoSel, setRemitoSel] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ remitoId: string; itemId: string; field: keyof Articulo } | null>(null);
  const [editHeader, setEditHeader] = useState<{ id: string; field: 'facturaNro' | 'remitoNro' } | null>(null);
  const [approving, setApproving] = useState(false);
  const [confirmProcesar, setConfirmProcesar] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reacción a los estados terminales del proceso.
  //
  // Va en un effect y no en un callback del hook a propósito: el resultado
  // puede llegar mientras el usuario está en otra pestaña. Al volver, el estado
  // ya está en el context y esta pantalla lo levanta sin haber estado montada
  // cuando pasó. Ese es exactamente el caso que el stream por job no cubría.
  useEffect(() => {
    if (!jobId) return;

    if (proceso.estado === 'completado') {
      setStatus('done');
      void loadRemitosByJob(jobId);
      setJobId(null);
    } else if (proceso.estado === 'fallido') {
      setStatus('error');
      setErrorMsg(proceso.error ?? 'El procesamiento falló');
      setJobId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proceso.estado, jobId]);

  // Log de diagnóstico: se alimenta de la etapa reportada por el back.
  useEffect(() => {
    if (!jobId || !proceso.stage) return;
    setLog((l) => [{ text: etiquetaDeStage(proceso.stage!), type: 'progress' }, ...l]);
  }, [proceso.stage, jobId]);

  // Al abrir la app: si no hay nada cargado localmente, traemos el último comprobante
  // PROCESADO del usuario y lo dejamos listo para aprobar/rechazar.
  const ownFetched = useRef(false);
  useEffect(() => {
    if (ownFetched.current) return;
    ownFetched.current = true;
    if (remitosCargados.length > 0) return; // ya hay algo (resumido de localStorage)
    void (async () => {
      try {
        const data = await remitosApi.own();
        if (data && data.length > 0) {
          setRemitosCargados(data);
          setOriginalRemitos(data);
          setStatus('done');
          // Reflejamos el proveedor del comprobante cargado en el select.
          if (data[0]?.proveedorId) setProveedorId(data[0].proveedorId);
        }
      } catch {
        // /own es best-effort: si falla no bloquea la pantalla
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const isBusy = status === 'uploading' || status === 'processing';
  // Qué datos faltan para poder procesar (para avisar al usuario, no solo bloquear).
  const faltantes = [
    !sucursalId && 'sucursal',
    !proveedorId && 'proveedor',
    !file && 'PDF',
  ].filter(Boolean) as string[];
  const canProcess = faltantes.length === 0 && !isBusy;
  // Catálogos vacíos: sin sucursales o sin proveedores no se puede cargar nada,
  // así que avisamos y mandamos a Configuración (esperamos a que carguen primero).
  const catalogosFaltantes = [
    sucursales.length === 0 && 'sucursales',
    proveedores.length === 0 && 'proveedores',
  ].filter(Boolean) as string[];
  const showCatalogosWarn = !catalogosLoading && catalogosFaltantes.length > 0;
  // El operador puede crear proveedores pero no sucursales: si le falta una sucursal,
  // no alcanza con que vaya a Configuración, necesita un administrador.
  const needsAdmin = sucursales.length === 0 && !perms.sucursalAdd;
  // Hay un comprobante procesado esperando decisión (aprobar/rechazar).
  const hasPending = remitosCargados.length > 0;
  // Mientras se procesa o hay uno pendiente, no se puede cargar otro PDF.
  const locked = isBusy || hasPending;

  async function handleUpload() {
    if (isBusy) return;
    if (faltantes.length > 0) {
      // Se apretó "Procesar" con datos faltantes: avisamos cuáles.
      setSuccessMsg(null);
      setErrorMsg(`Faltan datos para procesar: ${faltantes.join(', ')}.`);
      return;
    }
    setStatus('uploading');
    setErrorMsg(null);
    setSuccessMsg(null);
    setLog([]);
    setRemitosCargados([]);
    setOriginalRemitos([]);
    setRemitoSel(null);
    try {
      if (!file) throw new Error('No hay archivo PDF seleccionado');
      const { jobId: nuevoJobId } = await createFactura(file, sucursalId, proveedorId);
      setLog((l) => [{ text: `Encolado · job ${nuevoJobId}`, type: 'sent' }, ...l]);
      setStatus('processing');
      // No se abre ninguna conexión: el stream ya está vivo desde el login.
      // Declarar el processId alcanza para que useProceso empiece a filtrarlo.
      setJobId(nuevoJobId);
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo enviar el archivo');
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

  // Verificaciones previas a la carga. Se corren sobre `scope` (lo que realmente se va
  // a aprobar) y no sobre `remitosCargados`: si el operador filtró por un remito, no
  // tiene sentido bloquearlo por un problema de otro que no está por procesar.
  const advertencias = useMemo(() => validarLote(scope), [scope]);
  const errores = useMemo(() => soloErrores(advertencias), [advertencias]);
  const avisos = useMemo(() => soloAvisos(advertencias), [advertencias]);
  // Bloqueo duro: mientras haya un error el comprobante no se manda.
  const bloqueadoPorValidacion = errores.length > 0;

  // Snapshot original de cada remito: sirve para detectar ediciones (qué mandar en el
  // PATCH) y como referencia de la alícuota de IVA al recalcular.
  const originalById = useMemo(
    () => Object.fromEntries(originalRemitos.map((r) => [r.id, r])),
    [originalRemitos],
  );
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
    // Se normaliza al confirmar la edición, no mientras se tipea: reescribir el input
    // caracter por caracter le pelea al operador. Si no se pudo normalizar se guarda
    // el valor crudo tal cual — así la advertencia puede mostrar lo que realmente
    // escribió en lugar de un campo vacío.
    const normalizado = normalizarNroComprobante(value) ?? value.trim();
    setRemitosCargados((prev) =>
      prev.map((r) => (applyToAll || r.id === remitoId ? { ...r, [field]: normalizado } : r)),
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
    // Última barrera. El botón y el modal ya lo impiden, pero esta función es la que
    // toca el back: la validación tiene que estar del lado del que hace el POST, no
    // sólo del que dibuja el botón.
    if (bloqueadoPorValidacion) {
      setSuccessMsg(null);
      setErrorMsg('El comprobante tiene datos a corregir. Revisá las advertencias antes de procesar.');
      return;
    }
    setApproving(true);
    setErrorMsg(null);
    try {
      // Sólo los campos editables de la cabecera, no el remito completo.
      //
      // Antes se mandaba el objeto entero (`remitosApi.update(r.id, r)`), lo que
      // significaba enviar `id`, `estado`, `total`, `companyId` y los flags en cada
      // edición. El back los aceptaba con un `Object.assign`: mandar el `id` de un
      // remito de otra empresa sobrescribía esa fila. Ahora el back rechaza con 400
      // cualquier campo no editable, así que mandar de más sería un error.
      //
      // Los montos NO van acá: se derivan de los artículos vía
      // `PATCH /remitos/:id/items`.
      //
      // Los números viajan NORMALIZADOS (sólo dígitos, con los ceros a la izquierda
      // completados): los separadores son presentación, no dato. Sin esto el mismo
      // comprobante entra a la base como `1-234`, `0001-00000234` y `000100000234`
      // según cómo lo haya impreso el proveedor, y cualquier cruce posterior falla
      // por una diferencia que no existe (ver utils/comprobante.ts).
      const payloadDe = (r: Remito) => ({
        remitoNro: normalizarNroComprobante(r.remitoNro) ?? r.remitoNro,
        facturaNro: normalizarNroComprobante(r.facturaNro) ?? r.facturaNro,
        fecha: r.fecha,
      });
      // Se compara el PAYLOAD contra el original, no el remito entero: `isDirty` mira
      // el JSON completo (incluidos los artículos, que no van en este PATCH) y además
      // no ve el caso "no lo editaron pero la normalización lo cambia".
      const editados = scope.filter((r) => {
        const orig = originalById[r.id];
        if (!orig) return true;
        const p = payloadDe(r);
        return p.remitoNro !== orig.remitoNro || p.facturaNro !== orig.facturaNro || p.fecha !== orig.fecha;
      });
      if (editados.length) {
        await Promise.all(editados.map((r) => remitosApi.update(r.id, payloadDe(r))));
      }
      await Promise.all(scope.map((r) => approveFactura(r.id)));
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

      // Un 404 NO es un fallo a reintentar: significa que el remito ya no existe
      // en el backend (lo descartó otro usuario, o quedó una referencia vieja en
      // localStorage). Conservarlo localmente lo volvería basura imborrable: el
      // botón fallaría para siempre y la pantalla quedaría trabada. Borrarlo del
      // estado local ES la reconciliación correcta.
      const fallidos = remitosCargados.filter((_, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') return false;
        if (r.reason instanceof ApiError && r.reason.status === 404) return false;
        return true;
      });
      const idsFallidos = new Set(fallidos.map((r) => r.id));
      // Conservamos solo los que fallaron de verdad (y sus snapshots) para reintentar.
      setRemitosCargados(fallidos);
      setOriginalRemitos((prev) => prev.filter((r) => idsFallidos.has(r.id)));
      if (fallidos.length === 0) {
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
        {showCatalogosWarn && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              background: 'var(--err-weak)',
              color: 'var(--err)',
              border: '1px solid #f0c6c6',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            <span style={{ flex: 1, minWidth: 220 }}>
              No hay {catalogosFaltantes.join(' ni ')} cargados.{' '}
              {needsAdmin
                ? 'Pedile a un administrador que dé de alta una sucursal en Configuración para poder cargar comprobantes.'
                : `Andá a Configuración y dá de alta al menos ${catalogosFaltantes.length > 1 ? 'una sucursal y un proveedor' : catalogosFaltantes[0] === 'sucursales' ? 'una sucursal' : 'un proveedor'} para poder cargar comprobantes.`}
            </span>
            {onGoConfig && (
              <button
                onClick={onGoConfig}
                style={{
                  flex: 'none',
                  height: 32,
                  padding: '0 13px',
                  borderRadius: 7,
                  border: '1px solid var(--err)',
                  background: '#fff',
                  color: 'var(--err)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Ir a Configuración
              </button>
            )}
          </div>
        )}

        {tipoComp === 'remito' && (
          <div style={{ fontSize: 12.5, color: 'var(--muted-3)', background: '#f4f8ff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 13px' }}>
            La API sólo tiene un endpoint de carga (factura); el PDF se procesa igual, sin desglose de IVA abajo.
          </div>
        )}

        {/*
          Advertencias de validación, arriba de todo y siempre visibles mientras haya un
          comprobante en pantalla. Sólo los ERRORES: los avisos (importes en cero) son
          situaciones legítimas y mostrarlos acá permanentemente los volvería ruido que
          el operador aprende a ignorar — van únicamente en el modal, que es el último
          momento en que puede frenar.
        */}
        <PanelAdvertencias
          advertencias={errores}
          titulo="Revisá estos datos antes de procesar"
        />

        <section style={cardStyle}>
          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={fieldColStyle}>
              <label style={labelStyle}>Sucursal</label>
              <select
                value={sucursalId}
                disabled={locked}
                onChange={(e) => {
                  const s = sucursales.find((x) => x.id === e.target.value);
                  setSucursal(e.target.value, s?.nombre ?? '');
                }}
                style={{ ...selectStyle, opacity: locked ? 0.55 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}
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
              <select
                value={proveedorId}
                disabled={locked}
                onChange={(e) => setProveedorId(e.target.value)}
                style={{ ...selectStyle, opacity: locked ? 0.55 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}
              >
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
                title={locked ? 'Aprobá o rechazá el comprobante actual para cargar otro' : undefined}
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
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.55 : 1,
                  pointerEvents: locked ? 'none' : 'auto',
                }}
              >
                {file ? `📄 ${file.name}` : '⬆ Elegir archivo PDF'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={locked}
                  style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {!hasPending && (
              <button
                disabled={isBusy}
                onClick={handleUpload}
                title={faltantes.length ? `Faltan: ${faltantes.join(', ')}` : undefined}
                style={{
                  height: 42,
                  padding: '0 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: canProcess ? 'var(--ok)' : '#8a94a6',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: isBusy ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {status === 'uploading' || status === 'processing' ? 'Procesando…' : 'Procesar Archivo'}
              </button>
            )}
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
              <div style={{ height: 8, background: '#eef1f6', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#6f8fd6,#2563eb)', transition: 'width .4s ease' }} />
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
                  placeholder="0001-00000234"
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
                  {formatNroComprobante(remitosCargados[0]?.facturaNro)}
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
                        placeholder="0001-00000234"
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
                      <span>{r.remitoNro ? formatNroComprobante(r.remitoNro) : '(sin número)'}</span>
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
            {/*
              El botón NO se deshabilita por validación: abre el modal igual. Ahí está
              el detalle de qué hay que corregir, y es el modal el que bloquea la
              confirmación. Deshabilitar el botón escondería la explicación de por qué
              está bloqueado — el operador vería un botón gris y ninguna razón.
            */}
            <button
              disabled={scope.length === 0 || approving}
              onClick={() => setConfirmProcesar(true)}
              title={bloqueadoPorValidacion ? `${errores.length} dato(s) a corregir antes de procesar` : undefined}
              style={{
                marginTop: 8,
                height: 46,
                borderRadius: 9,
                border: 'none',
                background:
                  scope.length === 0 || approving ? '#9bbfa8' : bloqueadoPorValidacion ? 'var(--warn)' : 'var(--ok)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: scope.length === 0 || approving ? 'not-allowed' : 'pointer',
              }}
            >
              {approving ? 'Procesando…' : bloqueadoPorValidacion ? 'Revisar y procesar' : 'Procesar factura'}
            </button>
          </div>
        </section>

        {confirmProcesar && (() => {
          const provNombre = proveedores.find((p) => p.id === proveedorId)?.nombre ?? scope[0]?.proveedor?.nombre ?? '—';
          const single = scope.length === 1 ? scope[0] : null;
          const rows: [string, string][] = single
            ? [
                ['Nº Factura', formatNroComprobante(single.facturaNro)],
                ['Nº Remito', formatNroComprobante(single.remitoNro)],
                ['Proveedor', provNombre],
                ['Total', money(totals.total)],
              ]
            : [
                ['Comprobantes', String(scope.length)],
                ['Proveedor', provNombre],
                ['Total', money(totals.total)],
              ];
          return (
            <ConfirmDialog
              open
              busy={approving}
              confirmDisabled={bloqueadoPorValidacion}
              title={bloqueadoPorValidacion ? 'No se puede cargar la factura' : 'Confirmar carga de factura'}
              confirmLabel="Cargar factura"
              onCancel={() => setConfirmProcesar(false)}
              onConfirm={() => {
                setConfirmProcesar(false);
                void handleProcesar();
              }}
              message={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 8, columnGap: 16 }}>
                    {rows.map(([k, v]) => (
                      <Fragment key={k}>
                        <span style={{ color: 'var(--muted-2)', fontWeight: 600 }}>{k}</span>
                        <span style={{ color: 'var(--ink-2)', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                      </Fragment>
                    ))}
                  </div>
                  {/* Errores: bloquean. Avisos: no bloquean, pero acá SÍ se muestran. */}
                  <PanelAdvertencias
                    advertencias={errores}
                    titulo="Hay que corregir esto antes de cargar"
                  />
                  <PanelAdvertencias advertencias={avisos} titulo="Tené en cuenta" />
                </div>
              }
            />
          );
        })()}
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

// La etiqueta sale de la etapa reportada por el back, que es información real,
// y no de un porcentaje inventado. Cuando se sume `orden_compra` como segunda
// etapa del pipeline, alcanza con agregarla a este Record — TypeScript exige
// que estén todas.
const ETIQUETA_POR_STAGE: Record<ProcesoStage, string> = {
  ocr: 'Leyendo el PDF…',
  llm: 'Extrayendo datos con IA…',
  persistencia: 'Guardando remitos…',
  orden_compra: 'Generando orden de compra…',
};

function etiquetaDeStage(stage: ProcesoStage): string {
  return ETIQUETA_POR_STAGE[stage] ?? stage;
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
