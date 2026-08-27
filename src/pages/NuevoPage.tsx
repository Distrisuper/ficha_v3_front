import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useData } from '../context/data-context';
import { useAuth } from '../context/auth-context';
import { permsFor } from '../utils/roles';
import { createFactura } from '../api/facturas';
import { remitosApi, textoArticulo, LARGO_CODIGO, LARGO_NOMBRE, type UpdateItemsInput } from '../api/remitos';
import { submitFacturaBatch } from '../api/facturas';
import { ApiError } from '../api/client';
import { STAGES_EXTRACCION, useProceso } from '../hooks/useProceso';
import type { ProcesoStage } from '../types/events';
import type { Articulo, Remito, RemitoTipo } from '../types/api';
import { money } from '../utils/money';
import {
  contenidoDesglosePercepciones,
  estiloTooltipDesglose,
  TOOLTIP_DESGLOSE_BG,
} from '../components/DesglosePercepciones';
import { round2, toNumero } from '../utils/numero';
import { colorFor } from '../utils/colors';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PanelAdvertencias } from '../components/PanelAdvertencias';
import { Tooltip } from '../components/Tooltip';
import { formatNroComprobante, normalizarNroComprobante } from '../utils/comprobante';
import {
  claveCampo,
  indexarPorCampo,
  soloAvisos,
  soloErrores,
  validarLote,
  type CampoAdvertencia,
} from '../utils/validacionFactura';
import { useLocalStorage } from '../hooks/useLocalStorage';

// Color de fondo de la burbuja de advertencia (ámbar oscuro, legible con texto blanco).
const TOOLTIP_WARN_BG = '#c99c3d';

type Status = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

/** Montos de cabecera editables de un remito. */
type MontoRemito = 'subtotal' | 'iva' | 'percepciones' | 'descuentos' | 'total';

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

/**
 * Recálculo en cascada, SIEMPRE hacia abajo.
 *
 * El valor por defecto de cada monto es lo que devolvió el LLM. Editar un campo propaga
 * únicamente a sus derivados de "más abajo" en la jerarquía, y nunca hacia arriba:
 *
 *   cantidad/precio (línea) → total de esa línea → subtotal → total
 *   total de línea (manual) → subtotal → total
 *   subtotal (manual)       → total
 *   bonif/percep/IVA (manual) → total
 *   total (manual)          → nada
 *
 * El IVA es un valor independiente: no se re-deriva solo (antes se recalculaba por
 * alícuota, lo que pisaba el valor del LLM). Si un campo editado a mano deja de coincidir
 * con su cálculo (p. ej. el subtotal no da con la suma de las líneas), NO se corrige
 * solo: se marca en amarillo desde la validación (`math-subtotal`, `math-total`, etc.).
 *
 * `sumaLineas`/`totalDe` son los dos únicos recálculos, y cada handler llama sólo los
 * que correspondan a la dirección de la edición.
 */
function sumaLineas(articulos: Articulo[]): number {
  return round2(articulos.reduce((acc, a) => acc + toNumero(a.total_unitario), 0));
}

/** total = subtotal − bonificaciones + percepciones + IVA, con los valores actuales. */
function totalDe(r: Remito): number {
  return round2(toNumero(r.subtotal) - toNumero(r.descuentos) + toNumero(r.percepciones) + toNumero(r.iva));
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
  // Remito que el back marcó como duplicado (factura ya cargada). Se resalta en rojo y
  // se limpia al re-subir, descartar, cargar bien o editar su Nº.
  const [duplicadoRemitoId, setDuplicadoRemitoId] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ remitoId: string; itemId: string; field: keyof Articulo } | null>(null);
  const [editHeader, setEditHeader] = useState<{ id: string; field: 'facturaNro' | 'remitoNro' } | null>(null);
  // Edición de un monto de cabecera (subtotal/iva/percepciones/descuentos/total) del
  // remito. Sólo se habilita cuando hay un único remito en `scope`.
  const [editAmount, setEditAmount] = useState<{ remitoId: string; field: MontoRemito } | null>(null);
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
    setDuplicadoRemitoId(null);
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

  // Desglose para el tooltip del pie. `null` si no hay nada que aportar, y de eso
  // depende que el número no aparezca subrayado prometiendo información que no
  // existe (percepciones en 0, o comprobantes previos a la clasificación).
  const tooltipPercepciones = useMemo(
    () => contenidoDesglosePercepciones(scope, totals.percepciones),
    [scope, totals.percepciones],
  );

  // Verificaciones previas a la carga. Se corren sobre `scope` (lo que realmente se va
  // Se valida la factura ENTERA (`remitosCargados`), no el subconjunto resaltado: la
  // carga es todo-o-nada, así que un problema en cualquier remito (p. ej. uno sin Nº)
  // tiene que marcarse aunque el operador tenga otro seleccionado.
  const advertencias = useMemo(() => validarLote(remitosCargados), [remitosCargados]);
  const errores = useMemo(() => soloErrores(advertencias), [advertencias]);
  const avisos = useMemo(() => soloAvisos(advertencias), [advertencias]);
  // Bloqueo duro: sólo los `error` (Nº vacío, código faltante, importe base en cero)
  // frenan la carga. Los `aviso` (formato, descalces, importes en cero) marcan el campo
  // en amarillo pero se pueden cargar igual.
  const bloqueadoPorValidacion = errores.length > 0;
  // Hay algo para revisar (bloqueante o no): cambia el color y el texto del botón.
  const hayAdvertencias = advertencias.length > 0;

  // Índice campo → mensajes, para pintar de amarillo cada input/celda con su tooltip.
  const advIndex = useMemo(() => indexarPorCampo(advertencias), [advertencias]);
  const warnArt = (remitoId: string, articuloId: string, campo: CampoAdvertencia): string[] =>
    (advIndex.get(claveCampo(remitoId, campo, articuloId)) ?? []).map((a) => a.mensaje);
  const warnRem = (remitoId: string, campo: CampoAdvertencia): string[] =>
    (advIndex.get(claveCampo(remitoId, campo)) ?? []).map((a) => a.mensaje);
  // El Nº de factura es compartido por todo el lote: junto los avisos de todos los remitos.
  const warnFactura = remitosCargados.flatMap((r) => warnRem(r.id, 'facturaNro'));
  // Los montos de cabecera sólo se editan cuando hay un único remito: con varios, el pie
  // muestra la SUMA y editar un agregado no mapea a ningún remito concreto.
  const remitoUnico = scope.length === 1 ? scope[0] : null;

  // Snapshot original de cada remito: sirve para detectar ediciones (qué mandar en el
  // PATCH) y como referencia de la alícuota de IVA al recalcular.
  const originalById = useMemo(
    () => Object.fromEntries(originalRemitos.map((r) => [r.id, r])),
    [originalRemitos],
  );
  function updateArticuloLocal(remitoId: string, articuloId: string, field: keyof Articulo, value: string) {
    const afectaMontos = field === 'cantidad' || field === 'precio_unitario';
    setRemitosCargados((prev) =>
      prev.map((r) => {
        if (r.id !== remitoId) return r;
        const articulos = (r.articulos ?? []).map((a) => {
          if (a.id !== articuloId) return a;
          const na = { ...a, [field]: value };
          // Cantidad/precio recalculan el total de ESA línea (cascada hacia abajo).
          if (afectaMontos) na.total_unitario = round2(toCantidad(na.cantidad) * toPrecio(na.precio_unitario));
          return na;
        });
        if (!afectaMontos) return { ...r, articulos }; // nombre/código: no toca montos
        // total de línea → subtotal → total. IVA/bonif/percep quedan como están.
        const conSub = { ...r, articulos, subtotal: sumaLineas(articulos) };
        return { ...conSub, total: totalDe(conSub) };
      }),
    );
  }

  // Edición manual del total de una línea. Cascada hacia abajo: subtotal → total.
  function editArticuloTotal(remitoId: string, articuloId: string, value: string) {
    setRemitosCargados((prev) =>
      prev.map((r) => {
        if (r.id !== remitoId) return r;
        const articulos = (r.articulos ?? []).map((a) =>
          a.id !== articuloId ? a : { ...a, total_unitario: toNumero(value) },
        );
        const conSub = { ...r, articulos, subtotal: sumaLineas(articulos) };
        return { ...conSub, total: totalDe(conSub) };
      }),
    );
  }

  // Edición manual de un monto de cabecera. Cascada SÓLO hacia abajo:
  //   - total → no afecta nada
  //   - subtotal / bonificaciones / percepciones / IVA → sólo el total
  function editRemitoAmount(remitoId: string, field: MontoRemito, value: string) {
    setRemitosCargados((prev) =>
      prev.map((r) => {
        if (r.id !== remitoId) return r;
        const actualizado = { ...r, [field]: toNumero(value) };
        return field === 'total' ? actualizado : { ...actualizado, total: totalDe(actualizado) };
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
    // El operador está corrigiendo el número: se saca el resaltado de duplicado. Si editó
    // el Nº de factura (compartido) se limpia para todos; si fue el Nº de remito, sólo ese.
    if (applyToAll || field === 'facturaNro') setDuplicadoRemitoId(null);
    else if (remitoId === duplicadoRemitoId) setDuplicadoRemitoId(null);
  }

  // Cerrar la edición de una celda no persiste nada: el valor ya se aplicó localmente
  // (onChange → updateArticuloLocal) y sobrevive en localStorage. La persistencia al
  // back se hace UNA sola vez al aprobar (handleProcesar), con el remito ya recalculado
  // y sin el problema de leer un estado stale desde este callback.
  function commitEdit() {
    setEditCell(null);
  }

  /**
   * Payload para `PATCH /remitos/:id/items`.
   *
   * Traduce del contrato del front (`precio_unitario`, `total_unitario`) al del back
   * (`precioUnitario`, `total`) y adjunta los montos de cabecera ya calculados, para que
   * el back los persista en vez de recalcularlos con un modelo distinto.
   *
   * `codigo` y `nombre` también viajan: las dos celdas son editables (doble clic) y sin
   * mandarlas la corrección se veía en pantalla pero no llegaba nunca al back, así que
   * al aprobar se persistía el valor que había leído el LLM.
   *
   * Pasan por `textoArticulo`, que recorta al largo de la columna y omite el campo si
   * quedó vacío (ver el porqué en su docblock, en api/remitos.ts).
   */
  const itemsPayloadDe = (r: Remito): UpdateItemsInput => ({
    items: (r.articulos ?? []).map((a) => ({
      id: a.id,
      codigo: textoArticulo(a.codigo, LARGO_CODIGO),
      nombre: textoArticulo(a.nombre, LARGO_NOMBRE),
      cantidad: toNumero(a.cantidad),
      precioUnitario: toNumero(a.precio_unitario),
      total: toNumero(a.total_unitario),
    })),
    subtotal: toNumero(r.subtotal),
    iva: toNumero(r.iva),
    percepciones: toNumero(r.percepciones),
    descuentos: toNumero(r.descuentos),
    total: toNumero(r.total),
  });

  async function handleProcesar() {
    // La factura se carga ENTERA: siempre todos los remitos del PDF, no el subconjunto
    // resaltado (`scope`). El resaltado es sólo visual; la carga no puede ser parcial.
    const aCargar = remitosCargados;
    if (aCargar.length === 0) return;
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
      // Los montos y los ítems van por `PATCH /remitos/:id/items` (ver más abajo), no
      // en este PATCH de cabecera.
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
      const editados = aCargar.filter((r) => {
        const orig = originalById[r.id];
        if (!orig) return true;
        const p = payloadDe(r);
        return p.remitoNro !== orig.remitoNro || p.facturaNro !== orig.facturaNro || p.fecha !== orig.fecha;
      });
      if (editados.length) {
        await Promise.all(editados.map((r) => remitosApi.update(r.id, payloadDe(r))));
      }
      // Persistimos ítems y montos (cantidades, precios, subtotal/IVA/percep/bonif/total)
      // ANTES de cargar: la validación contra la orden de compra que dispara el submit
      // corre sobre los artículos ya guardados, y el webhook al cliente lee estos montos.
      // Se manda una sola vez por remito con lo que quedó en pantalla (ya recalculado),
      // en vez de un PATCH por cada tecla como antes (que además mandaba mal los campos).
      await Promise.all(aCargar.map((r) => remitosApi.updateItems(r.id, itemsPayloadDe(r))));
      // Carga ATÓMICA de la factura entera: o se cargan todos los remitos, o ninguno.
      // Si un remito choca con una factura ya cargada, el back devuelve 409 sin cambiar
      // nada ni notificar al cliente externo, y el catch deja el comprobante en pantalla.
      await submitFacturaBatch(aCargar.map((r) => r.id));
      setSuccessMsg('Factura cargada correctamente.');
      setDuplicadoRemitoId(null);
      setRemitosCargados([]);
      setOriginalRemitos([]);
      setRemitoSel(null);
      setFile(null);
      setStatus('idle');
      reloadRemitos();
    } catch (e) {
      // Factura ya cargada: el back manda en `details` el remito EN PANTALLA que choca.
      // Lo resaltamos en rojo (y lo enfocamos) para que el operador sepa cuál corregir.
      if (e instanceof ApiError && e.code === 'FACTURA_ALREADY_LOADED') {
        const det = e.details as { remitoId?: string } | undefined;
        if (det?.remitoId) {
          setDuplicadoRemitoId(det.remitoId);
          setRemitoSel(det.remitoId);
        }
      }
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
      // Si el remito duplicado se descartó, se saca el resaltado.
      setDuplicadoRemitoId((cur) => (cur && idsFallidos.has(cur) ? cur : null));
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1100, height: '100%' }}>
        {showCatalogosWarn && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              flexShrink: 0,
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
          <div style={{ fontSize: 12.5, color: 'var(--muted-3)', background: '#f4f8ff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 13px', flexShrink: 0 }}>
            La API sólo tiene un endpoint de carga (factura); el PDF se procesa igual, sin desglose de IVA abajo.
          </div>
        )}

        {/*
          Las advertencias ya NO van en un cartel arriba: cada campo con problema se
          marca en amarillo con su tooltip (ver `warnArt`/`warnRem`). En el modal sí se
          listan todas antes de cargar.
        */}
        <section style={{ ...cardStyle, flexShrink: 0 }}>
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

        <section style={{ ...cardStyle, padding: 0, overflow: 'hidden', flex: 1, minHeight: 220, display: 'flex', flexDirection: 'column' }}>
          <div className="ds-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
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
                      warn={warnArt(remitoId, articulo.id, 'codigo')}
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
                        warn={warnArt(remitoId, articulo.id, 'nombre')}
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
                      warn={warnArt(remitoId, articulo.id, 'cantidad')}
                    />
                    <EditableCell
                      value={money(articulo.precio_unitario)}
                      rawValue={String(articulo.precio_unitario)}
                      editing={editCell?.itemId === articulo.id && editCell.field === 'precio_unitario'}
                      onStartEdit={() => setEditCell({ remitoId, itemId: articulo.id, field: 'precio_unitario' })}
                      onChange={(v) => updateArticuloLocal(remitoId, articulo.id, 'precio_unitario', v.replace(/[^0-9.,]/g, ''))}
                      onCommit={commitEdit}
                      align="right"
                      warn={warnArt(remitoId, articulo.id, 'precio_unitario')}
                    />
                    {/*
                      El total de línea por defecto es cantidad × precio (o el valor del
                      LLM) y se recalcula solo, pero es editable como última instancia:
                      al editarlo queda lockeado y deja de recalcularse (ver
                      editArticuloTotal). Amarillo si hay descalce o está en cero.
                    */}
                    <EditableCell
                      value={money(articulo.total_unitario ?? round2(toCantidad(articulo.cantidad) * toPrecio(articulo.precio_unitario)))}
                      rawValue={String(articulo.total_unitario ?? '')}
                      editing={editCell?.itemId === articulo.id && editCell.field === 'total_unitario'}
                      onStartEdit={() => setEditCell({ remitoId, itemId: articulo.id, field: 'total_unitario' })}
                      onChange={(v) => editArticuloTotal(remitoId, articulo.id, v.replace(/[^0-9.,]/g, ''))}
                      onCommit={commitEdit}
                      align="right"
                      bold
                      warn={warnArt(remitoId, articulo.id, 'total_unitario')}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'space-between', flexShrink: 0 }}>
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
                <ReadonlyBox
                  onDoubleClick={() => remitosCargados.length > 0 && setEditHeader({ id: remitosCargados[0].id, field: 'facturaNro' })}
                  warn={warnFactura}
                  editable={remitosCargados.length > 0}
                >
                  {formatNroComprobante(remitosCargados[0]?.facturaNro)}
                </ReadonlyBox>
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
                  const duplicado = duplicadoRemitoId === r.id;
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
                  const warnRemito = warnRem(r.id, 'remitoNro');
                  const advertido = warnRemito.length > 0;
                  const boton = (
                    <button
                      key={r.id}
                      onClick={() => setRemitoSel((cur) => (cur === r.id ? null : r.id))}
                      onDoubleClick={() => setEditHeader({ id: r.id, field: 'remitoNro' })}
                      title={duplicado
                        ? 'Esta factura ya fue cargada para el proveedor (Nº factura + Nº remito). Corregí el número o descartá el comprobante.'
                        : 'Clic: marcar artículos · Doble clic: editar Nº'}
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
                        // Precedencia: rojo (duplicado) > amarillo (falta/está mal el Nº) >
                        // azul (selección) > normal.
                        border: `1px solid ${duplicado ? 'var(--err)' : advertido ? 'var(--warn)' : active ? color : 'var(--border-2)'}`,
                        background: duplicado ? 'var(--err-weak)' : advertido ? '#fdf8ec' : active ? light : '#fff',
                        color: duplicado ? 'var(--err)' : advertido ? 'var(--warn)' : active ? color : '#3a4352',
                      }}
                    >
                      <span style={{ width: 9, height: 9, flex: 'none', borderRadius: '50%', background: duplicado ? 'var(--err)' : advertido ? 'var(--warn)' : color }} />
                      <span>{r.remitoNro ? formatNroComprobante(r.remitoNro) : '(sin número)'}</span>
                      {(duplicado || advertido) && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }} aria-hidden>
                          <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                          <path d="M12 9v4M12 17h.01" />
                        </svg>
                      )}
                    </button>
                  );
                  return advertido ? (
                    <Tooltip key={r.id} texto={mensajesTooltip(warnRemito)} fondo={TOOLTIP_WARN_BG}>
                      {boton}
                    </Tooltip>
                  ) : (
                    boton
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ minWidth: 260, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {tipoComp === 'factura' && (
              <>
                {/*
                  Cada monto por defecto es lo que devolvió el LLM y se recalcula solo,
                  pero es editable como última instancia cuando hay un único remito (doble
                  clic). Amarillo si el subtotal/total no cierra. Con varios remitos se
                  muestra la SUMA, sin edición.
                */}
                <EditableAmount
                  label="Subtotal:"
                  value={money(totals.subtotal)}
                  rawValue={remitoUnico ? String(remitoUnico.subtotal ?? '') : undefined}
                  editable={!!remitoUnico}
                  editing={editAmount?.field === 'subtotal'}
                  onStartEdit={() => remitoUnico && setEditAmount({ remitoId: remitoUnico.id, field: 'subtotal' })}
                  onChange={(v) => remitoUnico && editRemitoAmount(remitoUnico.id, 'subtotal', v)}
                  onCommit={() => setEditAmount(null)}
                  warn={remitoUnico ? warnRem(remitoUnico.id, 'subtotal') : []}
                />
                <EditableAmount
                  label="Bonificaciones:"
                  value={(totals.descuentos > 0 ? '- ' : '') + money(totals.descuentos)}
                  rawValue={remitoUnico ? String(remitoUnico.descuentos ?? '') : undefined}
                  editable={!!remitoUnico}
                  editing={editAmount?.field === 'descuentos'}
                  onStartEdit={() => remitoUnico && setEditAmount({ remitoId: remitoUnico.id, field: 'descuentos' })}
                  onChange={(v) => remitoUnico && editRemitoAmount(remitoUnico.id, 'descuentos', v)}
                  onCommit={() => setEditAmount(null)}
                />
                <EditableAmount
                  label="Percepciones:"
                  value={money(totals.percepciones)}
                  rawValue={remitoUnico ? String(remitoUnico.percepciones ?? '') : undefined}
                  editable={!!remitoUnico}
                  editing={editAmount?.field === 'percepciones'}
                  onStartEdit={() => remitoUnico && setEditAmount({ remitoId: remitoUnico.id, field: 'percepciones' })}
                  onChange={(v) => remitoUnico && editRemitoAmount(remitoUnico.id, 'percepciones', v)}
                  onCommit={() => setEditAmount(null)}
                  detalle={tooltipPercepciones}
                />
                <EditableAmount
                  label="IVA:"
                  value={money(totals.iva)}
                  rawValue={remitoUnico ? String(remitoUnico.iva ?? '') : undefined}
                  editable={!!remitoUnico}
                  editing={editAmount?.field === 'iva'}
                  onStartEdit={() => remitoUnico && setEditAmount({ remitoId: remitoUnico.id, field: 'iva' })}
                  onChange={(v) => remitoUnico && editRemitoAmount(remitoUnico.id, 'iva', v)}
                  onCommit={() => setEditAmount(null)}
                />
                <div style={{ height: 1, background: '#eef1f6', margin: '4px 0' }} />
                <EditableAmount
                  label="Total:"
                  value={money(totals.total)}
                  rawValue={remitoUnico ? String(remitoUnico.total ?? '') : undefined}
                  editable={!!remitoUnico}
                  editing={editAmount?.field === 'total'}
                  onStartEdit={() => remitoUnico && setEditAmount({ remitoId: remitoUnico.id, field: 'total' })}
                  onChange={(v) => remitoUnico && editRemitoAmount(remitoUnico.id, 'total', v)}
                  onCommit={() => setEditAmount(null)}
                  warn={remitoUnico ? warnRem(remitoUnico.id, 'total') : []}
                  big
                />
              </>
            )}
            {/*
              El botón NO se deshabilita por validación: abre el modal igual. Ahí está
              el detalle de qué hay que corregir, y es el modal el que bloquea la
              confirmación. Deshabilitar el botón escondería la explicación de por qué
              está bloqueado — el operador vería un botón gris y ninguna razón.
            */}
            <button
              disabled={remitosCargados.length === 0 || approving}
              onClick={() => setConfirmProcesar(true)}
              title={
                bloqueadoPorValidacion
                  ? `${errores.length} dato(s) a corregir antes de procesar`
                  : avisos.length > 0
                    ? `${avisos.length} dato(s) para revisar`
                    : undefined
              }
              style={{
                marginTop: 8,
                height: 46,
                borderRadius: 9,
                border: 'none',
                background: remitosCargados.length === 0 || approving ? '#9bbfa8' : 'var(--ok)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: remitosCargados.length === 0 || approving ? 'not-allowed' : 'pointer',
              }}
            >
              {approving ? 'Procesando…' : hayAdvertencias ? 'Revisar y procesar' : 'Procesar factura'}
            </button>
          </div>
        </section>

        {confirmProcesar && (() => {
          // El modal muestra la factura ENTERA (todos los remitos), que es lo que se
          // carga, sin importar el resaltado.
          const provNombre = proveedores.find((p) => p.id === proveedorId)?.nombre ?? remitosCargados[0]?.proveedor?.nombre ?? '—';
          const facturaTotal = remitosCargados.reduce((a, r) => a + Number(r.total || 0), 0);
          const single = remitosCargados.length === 1 ? remitosCargados[0] : null;
          const rows: [string, string][] = single
            ? [
                ['Nº Factura', formatNroComprobante(single.facturaNro)],
                ['Nº Remito', formatNroComprobante(single.remitoNro)],
                ['Proveedor', provNombre],
                ['Total', money(single.total)],
              ]
            : [
                ['Nº Factura', formatNroComprobante(remitosCargados[0]?.facturaNro)],
                ['Remitos', String(remitosCargados.length)],
                ['Proveedor', provNombre],
                ['Total', money(facturaTotal)],
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

interface EditableAmountProps {
  label: string;
  value: string;
  /** Valor numérico crudo para el input (sin formato de moneda). */
  rawValue?: string;
  editable: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  warn?: string[];
  /**
   * Contenido informativo para el tooltip (ej. el desglose de percepciones).
   *
   * Independiente de `warn`: `warn` es "este número puede estar mal" (ámbar),
   * `detalle` es "este número se compone así" (azul). Si hay `warn`, gana `warn`:
   * un problema tiene prioridad sobre información de contexto.
   */
  detalle?: ReactNode;
  /** Fila de total (grande y en azul). */
  big?: boolean;
}

/**
 * Fila de un monto del pie de factura. Muestra el valor formateado; con doble clic (si
 * `editable`) pasa a input para el override manual. Amarillo + tooltip si hay `warn`,
 * azul + tooltip si hay `detalle`.
 */
function EditableAmount({ label, value, rawValue, editable, editing, onStartEdit, onChange, onCommit, warn, detalle, big }: EditableAmountProps) {
  const advertido = (warn?.length ?? 0) > 0;
  // `detalle` sólo se ofrece si no hay advertencia: dos tooltips sobre el mismo
  // span se pisan, y el problema importa más que el desglose.
  const conDetalle = !advertido && detalle != null;
  const filaStyle: CSSProperties = big
    ? { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 19, fontWeight: 800, color: 'var(--blue)' }
    : { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, color: 'var(--muted)' };

  const valorColor = advertido ? 'var(--warn)' : big ? 'var(--blue)' : 'var(--ink-2)';

  const display = (
    <span
      onDoubleClick={editable ? onStartEdit : undefined}
      title={editable && !advertido && !conDetalle ? 'Doble clic para editar' : undefined}
      style={{
        fontVariantNumeric: 'tabular-nums',
        color: valorColor,
        // `help` también con detalle: es el affordance que ya usa el resto de la
        // app (EcoInline, HeadCell) para "pasá el mouse que hay más".
        cursor: advertido || conDetalle ? 'help' : editable ? 'text' : 'default',
        textDecoration: advertido || conDetalle ? 'underline dotted' : undefined,
        textUnderlineOffset: advertido || conDetalle ? 3 : undefined,
        fontWeight: big ? 800 : 600,
      }}
    >
      {value}
    </span>
  );

  return (
    <div style={filaStyle}>
      <span>{label}</span>
      {editing ? (
        <input
          autoFocus
          defaultValue={rawValue ?? ''}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          style={{
            width: 130,
            height: 30,
            border: `1px solid ${advertido ? 'var(--warn)' : 'var(--blue)'}`,
            borderRadius: 6,
            padding: '0 8px',
            fontSize: big ? 16 : 13.5,
            fontWeight: big ? 800 : 600,
            color: 'var(--ink)',
            outline: 'none',
            background: '#fff',
            textAlign: 'right',
          }}
        />
      ) : advertido ? (
        <Tooltip texto={mensajesTooltip(warn!)} fondo={TOOLTIP_WARN_BG}>
          {display}
        </Tooltip>
      ) : conDetalle ? (
        // Más ancho que el default (240) porque cada línea lleva categoría +
        // texto del proveedor + importe. Fondo gris claro con texto oscuro: es
        // información de contexto, no una alerta, así que no compite con el ámbar
        // de las advertencias ni con el azul de los tooltips de ayuda.
        <Tooltip texto={detalle} ancho={320} fondo={TOOLTIP_DESGLOSE_BG} style={estiloTooltipDesglose}>
          {display}
        </Tooltip>
      ) : (
        display
      )}
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
  /** Mensajes de advertencia: si hay, la celda se pinta de amarillo con tooltip. */
  warn?: string[];
}

function EditableCell({ value, rawValue, editing, onStartEdit, onChange, onCommit, align, bold, muted, grow, warn }: EditableCellProps) {
  const advertido = (warn?.length ?? 0) > 0;
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
          border: `1px solid ${advertido ? 'var(--warn)' : 'var(--blue)'}`,
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
  const contenido = (
    <span
      onDoubleClick={onStartEdit}
      title={advertido ? undefined : 'Doble clic para editar'}
      style={{
        // En las columnas numéricas (align derecha) el span ocupa toda la celda para que
        // el valor quede alineado con el encabezado de la columna. En las de la izquierda
        // (código/nombre) se deja el comportamiento inline original (ellipsis, etc.).
        display: align === 'right' ? 'block' : undefined,
        width: align === 'right' ? '100%' : undefined,
        textAlign: align,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: bold ? 700 : undefined,
        // Con advertencia el color ámbar manda por encima del color normal de la celda.
        color: advertido ? 'var(--warn)' : bold ? 'var(--navy)' : muted ? 'var(--muted-2)' : 'var(--ink-2)',
        fontSize: muted ? '12.5px' : 14,
        cursor: advertido ? 'help' : 'text',
        overflow: grow ? 'hidden' : undefined,
        textOverflow: grow ? 'ellipsis' : undefined,
        whiteSpace: grow ? 'nowrap' : undefined,
        textDecoration: advertido ? 'underline dotted' : undefined,
        textUnderlineOffset: advertido ? 3 : undefined,
      }}
    >
      {value}
    </span>
  );
  if (!advertido) return contenido;
  // El wrapper del tooltip ocupa toda la celda y reparte el contenido según `align`, para
  // no perder la alineación con el encabezado de la columna al envolver en la burbuja.
  return (
    <Tooltip
      texto={mensajesTooltip(warn!)}
      fondo={TOOLTIP_WARN_BG}
      wrapperStyle={
        align === 'right'
          ? { width: '100%', justifyContent: 'flex-end' }
          : { maxWidth: '100%', minWidth: 0 }
      }
    >
      {contenido}
    </Tooltip>
  );
}

/** Une varios mensajes de advertencia en el texto de una burbuja (uno por línea). */
function mensajesTooltip(mensajes: string[]): string {
  return mensajes.length === 1 ? mensajes[0] : mensajes.map((m) => `• ${m}`).join('\n');
}

/** Caja de sólo lectura (Nº de factura) con doble clic para editar y warn opcional. */
function ReadonlyBox({
  children,
  onDoubleClick,
  warn,
  editable,
}: {
  children: ReactNode;
  onDoubleClick: () => void;
  warn?: string[];
  editable: boolean;
}) {
  const advertido = (warn?.length ?? 0) > 0;
  const box = (
    <div
      onDoubleClick={onDoubleClick}
      title={editable && !advertido ? 'Doble clic para editar' : undefined}
      style={{
        ...readonlyBoxStyle,
        cursor: editable ? 'text' : 'default',
        borderColor: advertido ? 'var(--warn)' : 'var(--border-2)',
        color: advertido ? 'var(--warn)' : 'var(--ink)',
      }}
    >
      {children}
    </div>
  );
  return advertido ? (
    <Tooltip texto={mensajesTooltip(warn!)} fondo={TOOLTIP_WARN_BG} wrapperStyle={{ display: 'block' }}>
      {box}
    </Tooltip>
  ) : (
    box
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
