import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useData } from '../context/data-context';
import { remitosApi } from '../api/remitos';
import { money, fmtDate, fmtCantidad } from '../utils/money';
import { toNumero } from '../utils/numero';
import { PENDIENTES_ESTADOS } from '../utils/estados';
import { applyFilters, type RemitoFilters } from '../utils/filtros';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PanelAdvertencias } from '../components/PanelAdvertencias';
import { Tooltip } from '../components/Tooltip';
import {
  contenidoDesglosePercepciones,
  estiloTooltipDesglose,
  TOOLTIP_DESGLOSE_BG,
} from '../components/DesglosePercepciones';
// `Spinner` ya no se importa: el único indicador animado de la card es
// `BadgeOrdenCompra`. `BadgeSinErp` tampoco (su uso quedó comentado más abajo).
import {
  BadgeOcContrastada,
  BadgeOrdenCompra,
  CeldaVeredicto,
  cantidadPorDebajoDeOc,
  EncabezadoVeredictos,
  textoVeredictoOc,
  type EstadoVeredicto,
} from '../components/OrdenCompra';
import { formatNroComprobante } from '../utils/comprobante';
import {
  advertenciasExistenciaErp,
  codigosVerificados,
  claveCampo,
  indexarPorCampo,
  soloAvisos,
  soloErrores,
  validarRemito,
  type Advertencia,
  type CampoAdvertencia,
  cuadraElComprobante,
} from '../utils/validacionFactura';

// Fondo de la burbuja de advertencia (ámbar oscuro, legible con texto blanco).
const TOOLTIP_WARN_BG = '#8a6410';
import { useOrdenCompra } from '../hooks/useOrdenCompra';
// import { useProcesosFallidos } from '../hooks/useProcesosFallidos'; // reactivar junto con el bloque de alertas comentado
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
  // NOTA: el hook se reactiva junto con el bloque de alertas de `procesosFallidos` que
  // está comentado más abajo. Mientras ese bloque no se use, dejarlo activo rompía el
  // build (noUnusedLocals), así que queda comentado a la par.
  // const procesosFallidos = useProcesosFallidos();

  // Verificaciones previas a la carga de la factura, por remito.
  //
  // Sólo se calculan para las cards que van a mandar la FACTURA (`facturaCargada !==
  // true`). Las otras ya la cargaron y lo único que resta es mover mercadería a stock:
  // bloquear eso por un total mal sumado dejaría el stock trabado por un problema que
  // ya no está en juego.
  //
  // Va en un `useMemo` sobre la lista y no dentro del `.map` para no re-validar cada
  // remito en cada render (se redibuja con cada evento del stream de orden de compra).
  const advertenciasPorRemito = useMemo(() => {
    const out: Record<string, Advertencia[]> = {};
    for (const r of pendientes) {
      if (r.facturaCargada !== true) out[r.id] = validarRemito(r);
    }
    return out;
  }, [pendientes]);

  // Avisos del cruce contra la orden de compra, por remito.
  //
  // Se calculan para TODAS las cards, no sólo para las que van a mandar la factura:
  // el aviso apunta a la carga de mercadería a stock, y a esa altura la factura ya
  // está cargada (`facturaCargada === true`), justo el caso que `advertenciasPorRemito`
  // excluye.
  //
  // Se omiten los remitos con la consulta de OC en vuelo: mientras está procesando
  // el veredicto de existencia todavia no es confiable, y avisar
  // sobre un veredicto que puede cambiar en el próximo evento del stream es peor que
  // no avisar.
  const advOrdenCompraPorRemito = useMemo(() => {
    const out: Record<string, Advertencia[]> = {};
    for (const r of pendientes) {
      if (r.jobId && ordenCompraPorJob[r.jobId] === 'procesando') continue;
      /**
       * SÓLO existencia en el sistema. El aviso de "no coincide con la OC" se sacó.
       *
       * La etapa de OC sigue corriendo y sigue guardando `stockMatch`/`precioMatch`
       * y la (OC, línea) imputada — el integrador los usa para fichar al precio de
       * la orden. Lo que se sacó es el AVISO al operador: la diferencia de cantidad
       * o precio contra la orden no es algo que él resuelva antes de cargar, y
       * mostrarlo por renglón competía con el único aviso que sí requiere una acción
       * suya: que el código no exista.
       *
       * Un aviso que no tiene acción asociada le enseña al operador a ignorar el
       * amarillo. Después, cuando el amarillo importe, tampoco lo va a mirar.
       */
      const avisos = advertenciasExistenciaErp(r);
      if (avisos.length > 0) out[r.id] = avisos;
    }
    return out;
  }, [pendientes, ordenCompraPorJob]);

  // Índice campo → mensajes, para pintar de amarillo cada dato con problema y mostrar el
  // motivo en un tooltip (reemplaza el cartel amarillo que antes iba arriba de la card).
  const advIndex = useMemo(
    () =>
      indexarPorCampo([
        ...Object.values(advertenciasPorRemito).flat(),
        ...Object.values(advOrdenCompraPorRemito).flat(),
      ]),
    [advertenciasPorRemito, advOrdenCompraPorRemito],
  );
  const warnFor = (remitoId: string, campo: CampoAdvertencia, articuloId?: string): string[] =>
    (advIndex.get(claveCampo(remitoId, campo, articuloId)) ?? []).map((a) => a.mensaje);

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

      /**
       * Lo que quedó para cargar a mano.
       *
       * El popup ya lo avisó, pero ese aviso se lee mientras el operador decide si
       * confirma. Lo que le queda POR HACER después de cerrar el modal es cargar
       * esos artículos en el sistema, y para eso necesita los códigos a la vista
       * justo en el momento en que va a hacerlo — no dos clics atrás.
       *
       * Mismo criterio que usa el back para `cargaManual` (`existeEnErp === false`),
       * así que lo que dice el aviso es lo que efectivamente quedó afuera.
       */
      const aMano = (r.articulos ?? []).filter(
        (a) => cargados.has(a.id) && a.existeEnErp === false,
      );
      const ref = r.remitoNro || r.id.slice(0, 8);
      setNotice(
        aMano.length === 0
          ? `Remito ${ref}: ${seleccionados.length} artículo(s) enviados a stock.`
          : `Remito ${ref}: ${seleccionados.length - aMano.length} artículo(s) enviados a stock. ` +
            `FALTA CARGAR A MANO en el sistema: ${aMano
              .map((a) => a.codigo || a.nombre || 's/código')
              .join(', ')}.`,
      );
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

  /**
   * Reintenta la verificación de códigos.
   *
   * `marcarEnProceso` optimista: el spinner arranca al apretar, no cuando llega el
   * evento del stream. Sin eso, entre el POST y el primer evento no pasa nada
   * visible y el operador vuelve a apretar.
   */
  async function handleReverificar(r: Remito) {
    try {
      setBusyId(r.id);
      setNotice(null);
      await remitosApi.reverificarCodigos(r.id);
      if (r.jobId) marcarEnProceso(r.jobId);
      setNotice('Verificando los códigos contra el catálogo del sistema…');
    } catch (e) {
      setNotice(
        e instanceof Error
          ? `No se pudo reencolar la verificación: ${e.message}`
          : 'No se pudo reencolar la verificación de códigos',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleCargarFactura(r: Remito) {
    // Última barrera antes del POST. El modal ya bloquea el botón, pero la validación
    // tiene que estar del lado del que llama al back, no sólo del que dibuja el botón.
    if (soloErrores(advertenciasPorRemito[r.id] ?? []).length > 0) {
      setNotice('La factura tiene datos a corregir. Revisá las advertencias de la card.');
      return;
    }
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

      {/* {procesosFallidos.length > 0 && (
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
      )} */}

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
          /**
           * Estado de la validación, UNIFICADO. Un solo concepto para toda la card.
           *
           * Antes había tres indicadores animados a la vez —el spinner del botón de
           * reverificar, el badge "Procesando orden de compra" y el "verificando
           * códigos" del resumen— diciendo la misma cosa. Tres spinners para un
           * proceso no informan tres veces: informan una vez y molestan dos.
           *
           * ── De dónde sale ────────────────────────────────────────────────────
           * `r.estadoOc` / `r.estadoCodigos` vienen del JOB y están PERSISTIDOS, así
           * que sobreviven a un refresh y a que un evento del stream se pierda. El
           * tracker en memoria (`ordenCompraPorJob`) se sigue usando sólo para el
           * arranque optimista: da feedback en el mismo frame del click, antes de
           * que el servidor conteste.
           *
           * Ése es el arreglo del "el cartel de orden de compra no disponible sólo
           * aparece si recargo": el dato ahora viaja en el remito, y el refresco
           * puntual de la card (que ya dispara `orden_compra.validada`) lo trae.
           */
          const trackerEnMemoria = r.jobId ? ordenCompraPorJob[r.jobId] : undefined;
          const validando =
            trackerEnMemoria === 'procesando' ||
            r.estadoOc === 'corriendo' ||
            r.estadoCodigos === 'corriendo';
          // La OC no está disponible cuando su etapa falló. `estadoOc` persistido
          // primero; el tracker cubre la ventana antes del primer refresco.
          const ocFallida = r.estadoOc === 'error' || trackerEnMemoria === 'fallida';
          // `ocProcesando` alimenta los semáforos: mientras se valida, ningún flag
          // es confiable todavía.
          const ocProcesando = validando;
          /**
           * Errores del comprobante (bloquean la confirmación en el modal).
           *
           * Ya NO se usa el total de advertencias para el color del botón: eso
           * incluía los avisos de "importes en cero", que son el caso normal, y
           * dejaba el botón ámbar en casi toda factura. Ahora el ámbar de la
           * factura sale de `cuadra` y el del remito de `matchRemito`, que son los
           * dos hechos sobre los que el operador puede decidir algo.
           */
          const advCard = advertenciasPorRemito[r.id] ?? [];
          const erroresCard = soloErrores(advCard);

          /**
           * Gate de la carga: sin códigos verificados el remito NO se puede cargar.
           *
           * `codigosOk` se deriva de los artículos (`existeEnErp != null`), no del
           * tracker en memoria: sobrevive a un refresh. `validando` sí sale
           * del tracker, y sólo cambia el MENSAJE — "esperá" vs "falló, reintentá".
           * Si el tracker se perdió por un refresh, se muestra el segundo, que es el
           * que ofrece salida.
           *
           * Aplica sólo a la carga del REMITO. La factura se carga antes y es
           * justamente lo que dispara la verificación: bloquearla sería un
           * interbloqueo.
           */
          /**
           * Estado de cada una de las tres columnas de veredicto, por artículo.
           *
           * Un solo lugar que traduce los flags a lo que se dibuja, para que las
           * tres columnas no puedan divergir en su criterio de "sin dato".
           *
           * `sinOc === true` fuerza raya en las dos columnas de la orden de
           * compra: no es que no coincida, es que no había con qué comparar. Y el
           * spinner gana sobre todo mientras la verificación está en vuelo — un
           * veredicto de la corrida anterior mostrado como si fuera de esta es
           * peor que no mostrar nada.
           */
          const sinOcDelProveedor = r.ocLineasProveedor === 0;
          const veredicto = (flag: boolean | null | undefined, esDeOc: boolean): EstadoVeredicto => {
            if (validando) return 'cargando';
            if (esDeOc && sinOcDelProveedor) return 'sin-dato';
            if (flag === true) return 'ok';
            if (flag === false) return 'mal';
            return 'sin-dato';
          };

          /**
           * ¿Cuántos artículos puede cargar el sistema?
           *
           * Determina qué dice y de qué color es el botón, porque la consecuencia
           * de apretarlo es distinta en cada caso:
           *
           *   completo → el sistema carga todo. Verde, "Cargar remito".
           *   parcial  → el sistema carga una parte y el resto lo hace una
           *              persona. Ámbar, y el texto lo dice.
           *   ninguno  → el sistema no carga nada. El botón sólo registra la
           *              carga en Ficha; la mercadería la ingresa alguien a mano.
           *
           * El tercero es el que más importa comunicar: apretar un botón que dice
           * "Cargar remito" y que no cargue nada en el sistema es la peor versión
           * de un fallo silencioso — el operador se va convencido de que terminó.
           *
           * Se calcula sobre los artículos con veredicto: mientras se verifica,
           * `validando` gana y el botón muestra otra cosa.
           */
          // ¿Cierra `subtotal − bonificaciones + percepciones + IVA = total`?
          // Es lo único que decide el color del botón de FACTURA: se recalcula del
          // estado, así que al corregir un importe pasa a verde solo.
          const cuadra = cuadraElComprobante(r);

          const conVeredicto = items.filter((it) => it.existeEnErp != null);
          const fichables = conVeredicto.filter((it) => it.existeEnErp === true).length;
          const matchRemito: 'completo' | 'parcial' | 'ninguno' =
            conVeredicto.length === 0 || fichables === conVeredicto.length
              ? 'completo'
              : fichables === 0
                ? 'ninguno'
                : 'parcial';

          const codigosOk = codigosVerificados(r);
          /**
           * Bloquea si los códigos no están verificados O si se está validando.
           *
           * El segundo caso faltaba: con un veredicto de una corrida anterior,
           * `codigosOk` daba true y el botón se habilitaba MIENTRAS una nueva
           * validación estaba en curso. Se habría cargado el remito con el
           * veredicto viejo, justo el que se estaba recalculando.
           */
          const bloqueadoPorCodigos = !esFacturaACargar && (!codigosOk || validando);
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
                  <HeadCell label="Nº REMITO" value={formatNroComprobante(r.remitoNro)} big warn={warnFor(r.id, 'remitoNro')} />
                  <HeadCell label="Nº FACTURA" value={formatNroComprobante(r.facturaNro)} warn={warnFor(r.id, 'facturaNro')} />
                  <HeadCell label="PROVEEDOR" value={provName(r)} />
                  {mostrarSucursal && <HeadCell label="SUCURSAL" value={sucName(r)} />}
                  <HeadCell label="ESTADO" value={r.facturaCargada === true ? 'Factura cargada' : 'Remito Cargado'} />
                  {/*
                    UN solo badge animado por card. Cubre "validando" y "la OC
                    falló"; el resto de los indicadores (resumen, botón) ya no
                    animan nada.
                  */}
                  {validando ? (
                    <BadgeOrdenCompra estado="procesando" />
                  ) : ocFallida ? (
                    <BadgeOrdenCompra estado="fallida" />
                  ) : (
                    /*
                      Trazabilidad: contra qué OC se contrastó este remito.
                      
                      Sólo cuando la verificación terminó — mientras corre, el
                      dato es de la corrida ANTERIOR y mostrarlo al lado de un
                      "procesando" haría creer que es de esta. Y no compite con el
                      badge de estado porque son excluyentes por construcción.
                    */
                    <BadgeOcContrastada
                      ocNumeros={r.ocNumeros}
                      ocVerificadaEn={r.ocVerificadaEn}
                    />
                  )}
                  {/*
                    Sólo cuando la consulta al ERP terminó: mientras está en vuelo
                    `existeEnErp` todavía no es confiable y el aviso podría
                    desaparecer en el próximo evento del stream.
                  */}
                  {/* {!ocProcesando && <BadgeSinErp cantidad={contarSinErp(r)} />} — reimportar ambos al reactivar */}
                  {/*
                    Reverificar códigos. Sólo ícono y sólo cuando hace falta: si los
                    códigos están verificados no hay nada que reintentar, y un botón
                    que no hace falta en el header compite con los badges.

                    Vive acá y no en la barra de acciones de abajo porque no es una
                    acción del flujo (cargar / seleccionar) sino la reparación de un
                    dato que falta. Ponerlo al lado de "Cargar" lo hacía parecer una
                    alternativa a cargar.
                  */}
                  {/*
                    Ya NO muestra un spinner propio: el badge del encabezado es el
                    único indicador animado de la card.
                    
                    Y sigue visible y HABILITADO mientras valida, a propósito. La
                    tentación era esconderlo (no tiene sentido reintentar durante un
                    intento), pero `estadoCodigos = 'corriendo'` está PERSISTIDO y no
                    tiene timeout: si el worker se muere a mitad de camino, ese
                    'corriendo' queda para siempre. Escondiendo el botón, la card
                    quedaba sin ninguna salida — bloqueada, girando, y sin nada que
                    apretar.
                    
                    Reintentar durante una verificación en curso es inofensivo:
                    `reencolarCodigos` usa un id único por disparo y la verificación
                    es determinista, así que dos corridas escriben lo mismo. El costo
                    es una consulta de más al integrador.
                  */}
                  {!esFacturaACargar && !codigosOk && (
                    <button
                      onClick={() => handleReverificar(r)}
                      disabled={busyId === r.id}
                      title={
                        validando
                          ? 'Verificando los códigos… Podés reintentar si quedó trabado; no reprocesa el PDF.'
                          : 'Reverificar los códigos contra el catálogo del sistema. No reprocesa el PDF.'
                      } 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border: '1px solid #f3dca6',
                        background: '#fdf8ec',
                        color: 'var(--warn)',
                        cursor: busyId === r.id ? 'default' : 'pointer',
                        flex: 'none',
                        padding: 0,
                      }}
                    >
                      <IconoRecargar />
                    </button>
                  )}
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
                      <ResumenSinErp items={items} procesando={ocProcesando} />
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
                  {/*
                    Encabezados de la derecha, en UN grupo flex con el MISMO `gap`
                    que el grupo derecho de cada fila. Así las etiquetas caen
                    exactamente sobre sus celdas: los anchos los fija
                    `ANCHO_COL_VEREDICTO` y el badge de cantidad su `minWidth`.
                    Si los gaps se desincronizan, las columnas se corren y no hay
                    nada que lo avise.
                  */}
                  {showItems && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                    <EncabezadoVeredictos />
                    {/*
                      Total de UNIDADES, espejando el contador de artículos de la
                      izquierda. Son dos preguntas distintas y las dos se hacen: 22
                      renglones y 336 unidades no son lo mismo, y el que descarga la
                      mercadería cuenta unidades.
                    */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 58, justifyContent: 'center' }}>
                      CANT.
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'var(--blue)',
                          letterSpacing: 0,
                          // Alineado con el badge de cantidad de cada renglón, que
                          // usa el mismo minWidth para que la columna no baile.
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtCantidad(totalUnidades(r))}
                      </span>
                    </span>
                  </span>
                  )}
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
                    const warnNombre = warnFor(r.id, 'nombre', it.id);
                    const warnCodigo = warnFor(r.id, 'codigo', it.id);
                    const warnCantidad = warnFor(r.id, 'cantidad', it.id);
                    // El veredicto del código pasó a la columna ART. (tilde/cruz), así
                    // que ya no hacen falta ni el flag `noExiste` ni la advertencia por
                    // campo: la columna lee `existeEnErp` directo y su tooltip explica
                    // cada uno de los tres estados.
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
                          // SIN tinte de fila. El veredicto del código ahora vive en
                          // la columna ART. como una cruz roja, que es más preciso y
                          // no compite con nada: pintar el renglón entero de ámbar
                          // hacía que una lista con varios códigos faltantes se
                          // volviera un bloque amarillo donde no se distinguía cuál
                          // era cuál.
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
                            {(() => {
                              const nombreNode = (
                                <span
                                  style={{
                                    fontSize: 14,
                                    // Sin ámbar: el color de advertencia se sacó de
                                    // las filas. El dato del problema no se pierde —
                                    // queda el tooltip, y el subrayado punteado avisa
                                    // que hay algo que leer.
                                    color: 'var(--ink-2)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    cursor: warnNombre.length ? 'help' : undefined,
                                    textDecoration: warnNombre.length ? 'underline dotted' : undefined,
                                    textUnderlineOffset: warnNombre.length ? 3 : undefined,
                                  }}
                                  title={warnNombre.length ? undefined : it.nombre}
                                >
                                  {it.nombre || '—'}
                                </span>
                              );
                              return warnNombre.length ? conAdvertencia(warnNombre, nombreNode) : nombreNode;
                            })()}
                            {it.codigo || warnCodigo.length ? (
                              (() => {
                                const codigoNode = (
                                  <span
                                    style={{
                                      fontSize: 11.5,
                                      color: 'var(--muted-2)', // sin ámbar en las filas

                                      fontVariantNumeric: 'tabular-nums',
                                      cursor: warnCodigo.length ? 'help' : undefined,
                                      textDecoration: warnCodigo.length ? 'underline dotted' : undefined,
                                      textUnderlineOffset: warnCodigo.length ? 3 : undefined,
                                    }}
                                  >
                                    {it.codigo || 'sin código'}
                                  </span>
                                );
                                return warnCodigo.length ? conAdvertencia(warnCodigo, codigoNode) : codigoNode;
                              })()
                            ) : null}
                          </div>
                        </div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                          {/*
                            TRES COLUMNAS de veredicto: ART. / $ / STOCK.
                            
                            Antes eran dos iconos ($ y caja) apretados a la derecha
                            más un tercer indicador —el del código— del otro lado del
                            renglón: tres veredictos en dos lugares y con tres formas
                            distintas. Ahora una columna por pregunta, con ancho fijo,
                            así el ojo baja por la columna y encuentra las cruces sin
                            leer la fila.

                            Las dos primeras responden preguntas de naturaleza
                            distinta, y eso NO cambió:
                              · ART.       → ¿el código existe? BLOQUEA la carga.
                              · $ y STOCK  → ¿coincide con lo pedido? Informativo.
                            Lo que cambió es la presentación, no la semántica.
                          */}
                          <CeldaVeredicto
                            estado={veredicto(it.existeEnErp, false)}
                            texto={
                              validando
                                ? 'Verificando el código contra el catálogo del sistema…'
                                : it.existeEnErp === true
                                  ? `El código existe en el sistema${it.codigoErp ? ` (${it.codigoErp})` : ''}.`
                                  : it.existeEnErp === false
                                    ? 'Este código NO existe en el catálogo del sistema para este proveedor. El sistema no lo va a cargar: hay que darlo de alta o cargarlo a mano.'
                                    : 'Todavía no se verificó si el código existe en el sistema.'
                            }
                          />
                          <CeldaVeredicto
                            estado={veredicto(it.precioMatch, true)}
                            texto={textoVeredictoOc('precio', it, r, validando)}
                          />
                          <CeldaVeredicto
                            /*
                              El flag del back es igualdad exacta contra el saldo
                              pendiente: que llegue MÁS y que llegue MENOS de lo
                              esperado vienen los dos como `stockMatch: false`.
                              Sólo el primero es un problema; el segundo es una
                              entrega parcial y va en verde (ver
                              `cantidadPorDebajoDeOc`). El dato crudo no se toca.
                            */
                            estado={veredicto(cantidadPorDebajoDeOc(it) ? true : it.stockMatch, true)}
                            texto={textoVeredictoOc('stock', it, r, validando)}
                          />
                          {/*
                            minWidth fijo + tabular-nums: sin esto el ancho del
                            badge depende del número (165 vs 5) y los iconos de la
                            izquierda quedaban en una columna distinta en cada fila.
                            Los dígitos tabulares además evitan que "111" y "999"
                            midan diferente.
                          */}
                          {(() => {
                            const cantidadNode = (
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  // Sin ámbar ni borde: el badge queda siempre igual
                                  // para que la columna no baile de fila en fila. El
                                  // aviso vive en el tooltip.
                                  color: 'var(--navy)',
                                  background: 'var(--blue-weak)',
                                  borderRadius: 6,
                                  padding: '2px 10px',
                                  minWidth: 58,
                                  textAlign: 'center',
                                  fontVariantNumeric: 'tabular-nums',
                                  cursor: warnCantidad.length ? 'help' : undefined,
                                }}
                              >
                                {fmtCantidad(it.cantidad)}
                              </span>
                            );
                            return warnCantidad.length ? conAdvertencia(warnCantidad, cantidadNode) : cantidadNode;
                          })()}
                        </span>
                      </div>
                    );
                  })}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '14px 22px 16px', borderTop: '1px solid #eef1f6', display: 'flex', flexDirection: 'column', gap: 12, background: esFacturaACargar ? '#fbfcfe' : '#fff' }}>
                {/*
                  Las advertencias ya NO van en un cartel arriba de la card: cada dato con
                  problema se marca en amarillo con su tooltip (Nº, artículos, importes). En
                  el modal sí se listan todas antes de cargar.
                */}
                {esFacturaACargar && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', fontSize: 12.5, color: 'var(--muted-2)' }}>
                    <EcoInline k="Subtotal" v={money(subtotal)} warn={warnFor(r.id, 'subtotal')} />
                    {descuentos > 0 && <EcoInline k="Bonificaciones" v={'- ' + money(descuentos)} sep />}
                    <EcoInline
                      k="Percepciones"
                      v={money(percepciones)}
                      sep
                      // `[r]` y no el scope: acá cada card es UN remito, así que el
                      // desglose es el suyo. En NuevoPage el pie suma varios.
                      detalle={contenidoDesglosePercepciones([r], percepciones)}
                    />
                    <EcoInline k="IVA" v={money(iva)} sep />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  {esFacturaACargar ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', color: 'var(--muted-2)' }}>TOTAL</span>
                      {(() => {
                        const warnTotal = warnFor(r.id, 'total');
                        const totalNode = (
                          <span
                            style={{
                              fontSize: 23,
                              fontWeight: 800,
                              color: warnTotal.length ? 'var(--warn)' : 'var(--blue)',
                              fontVariantNumeric: 'tabular-nums',
                              cursor: warnTotal.length ? 'help' : undefined,
                              textDecoration: warnTotal.length ? 'underline dotted' : undefined,
                              textUnderlineOffset: warnTotal.length ? 4 : undefined,
                            }}
                          >
                            {money(totalFactura)}
                          </span>
                        );
                        return warnTotal.length ? conAdvertencia(warnTotal, totalNode) : totalNode;
                      })()}
                    </div>
                  ) : (
                    <span />
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {!esFacturaACargar && (
                      /*
                        Acción SECUNDARIA, no un botón al lado del principal.
                        
                        Tenía el mismo alto, el mismo peso de fuente y un borde
                        propio, así que competía de igual a igual con "Cargar
                        remito" — y no es una alternativa a cargar: es un ajuste
                        que se usa en los pocos casos donde no se carga todo.
                        Cuando está activo sí toma color, porque ahí es un modo en
                        el que la pantalla está y conviene que se note.
                      */
                      <button
                        onClick={() => toggleEdit(r)}
                        title="Elegir qué artículos cargar (por defecto se cargan todos)"
                        style={{
                          height: 44,
                          padding: '0 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: editing ? 'var(--blue-weak)' : 'transparent',
                          color: editing ? 'var(--blue)' : 'var(--muted)',
                          fontWeight: editing ? 700 : 600,
                          fontSize: 13,
                          textDecoration: editing ? 'none' : 'underline',
                          textDecorationColor: '#cfd8e6',
                          textUnderlineOffset: 4,
                          cursor: 'pointer',
                        }}
                      >
                        {editing ? 'Listo' : 'Elegir artículos'}
                      </button>
                    )}
                    {/*
                      El botón sigue abriendo el modal aunque haya errores: ahí está el
                      detalle y es el modal el que bloquea la confirmación. Un botón gris
                      sin explicación es peor que uno que abre y dice por qué no puede.

                      La EXCEPCIÓN es la verificación de códigos: ahí sí se deshabilita,
                      porque no hay nada que revisar en el modal — falta un dato del
                      sistema. El `title` explica cuál y qué hacer; un botón gris sin
                      motivo es lo que hace que el operador crea que la app se rompió.
                    */}
                    <button
                      onClick={() => setConfirmAction({ type: esFacturaACargar ? 'factura' : 'stock', remito: r })}
                      disabled={busyId === r.id || (editing && selCount === 0) || bloqueadoPorCodigos}
                      title={
                        bloqueadoPorCodigos
                          ? validando
                            ? 'Verificando los códigos contra el catálogo del sistema. En cuanto termine se habilita.'
                            : 'Los códigos todavía no se verificaron contra el catálogo del sistema. Hasta saber cuáles existen no se puede cargar: si uno no existe, el sistema rechaza el remito completo. Usá "Reverificar códigos".'
                          : !esFacturaACargar && matchRemito === 'ninguno'
                            // El caso que más hay que explicar: el botón NO carga
                            // la mercadería, sólo la registra acá.
                            ? 'Ningún código existe en el sistema: la carga hay que hacerla a mano en el ERP. Esto sólo la registra en Ficha.'
                            : !esFacturaACargar && matchRemito === 'parcial'
                              ? `El sistema carga ${fichables} de ${conVeredicto.length} artículos. El resto hay que cargarlo a mano en el ERP.`
                              : erroresCard.length > 0
                                ? `${erroresCard.length} dato(s) a corregir`
                                : esFacturaACargar && !cuadra
                                  ? 'Subtotal − bonificaciones + percepciones + IVA no da el total. Revisá los importes; se puede cargar igual.'
                                  : undefined
                      }
                      style={{
                        height: 44,
                        padding: '0 26px',
                        borderRadius: 9,
                        border: 'none',
                        background:
                          busyId === r.id || (editing && selCount === 0) || bloqueadoPorCodigos
                            ? '#8a94a6'
                            : esFacturaACargar
                              // FACTURA: ámbar sólo si la aritmética no cierra.
                              // Antes dependía de `hayAdvertenciasCard`, que es
                              // true en casi toda factura (avisa por
                              // bonificaciones en 0), así que el ámbar no
                              // distinguía nada.
                              ? (!cuadra ? 'var(--warn)' : 'var(--ok)')
                              // REMITO: ámbar en parcial y en carga manual,
                              // porque en los dos el sistema no carga todo.
                              : matchRemito === 'completo'
                                ? 'var(--ok)'
                                : 'var(--warn)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14,
                        cursor:
                          busyId === r.id || (editing && selCount === 0) || bloqueadoPorCodigos
                            ? 'not-allowed'
                            : 'pointer',
                      }}
                    >
                      {busyId === r.id
                        ? 'Cargando…'
                        : bloqueadoPorCodigos
                          ? validando
                            ? 'Verificando códigos…'
                            : 'Códigos sin verificar'
                          : editing
                            ? `Cargar (${selCount})`
                            : esFacturaACargar
                              ? !cuadra
                                ? 'Revisar totales y cargar'
                                : 'Cargar Factura'
                              : matchRemito === 'ninguno'
                                ? 'Aceptar carga manual'
                                : matchRemito === 'parcial'
                                  ? 'Cargar remito parcial'
                                  : 'Cargar Remito'}
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
        // Se recalcula contra la lista actual (no contra el snapshot guardado en
        // `confirmAction`): si un evento del stream actualizó el remito con el modal
        // abierto, se confirma sobre lo que hay ahora.
        const advertencias = esFactura ? advertenciasPorRemito[r.id] ?? [] : [];
        const errores = soloErrores(advertencias);
        const avisos = soloAvisos(advertencias);
        // Avisos de orden de compra: sólo en el flujo de stock, y sólo de los artículos
        // que se están cargando — la selección puede ser un subconjunto, y avisar sobre
        // un ítem que queda afuera de esta carga es ruido.
        const seleccionados = getSelected(r);
        // `advOrdenCompraPorRemito` mezcla dos cosas con consecuencias distintas, y
        // acá se separan porque el operador tiene que decidir distinto con cada una:
        //
        //  · campo 'codigo'       → el artículo NO EXISTE en el sistema. No se va a
        //    cargar; hay que cargarlo a mano por afuera. ROJO.
        //  · campo 'orden-compra' → la cantidad o el precio no coinciden con la OC.
        //    Se carga igual, es informativo. ÁMBAR.
        const advDelRemito = esFactura
          ? []
          : (advOrdenCompraPorRemito[r.id] ?? []).filter(
              (a) => !a.articuloId || seleccionados.has(a.articuloId),
            );
        // Ya no hay que separar nada: `advOrdenCompraPorRemito` sólo trae las de
        // existencia (campo 'codigo'). Los avisos de OC se sacaron.
        const noSeVanACargar = advDelRemito;
        const rows: [string, string][] = esFactura
          ? [
              ['Nº Factura', formatNroComprobante(r.facturaNro)],
              ['Nº Remito', formatNroComprobante(r.remitoNro)],
              ['Proveedor', provName(r)],
              ['Total', money(totalFacturaOf(r))],
            ]
          : [
              ['Nº Remito', formatNroComprobante(r.remitoNro)],
              ['Proveedor', provName(r)],
              ['Items', String(totalUnidades(r, seleccionados))],
            ];
        return (
          <ConfirmDialog
            open
            busy={busyId === r.id}
            confirmDisabled={errores.length > 0}
            title={
              errores.length > 0
                ? 'No se puede cargar la factura'
                : esFactura
                  ? 'Confirmar carga de factura'
                  : 'Confirmar carga de remito'
            }
            confirmLabel={esFactura ? 'Cargar factura' : 'Cargar remito'}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => {
              setConfirmAction(null);
              if (esFactura) handleCargarFactura(r);
              else handleCargarStock(r);
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
                <PanelAdvertencias advertencias={errores} titulo="Hay que corregir esto antes de cargar" />
                <PanelAdvertencias advertencias={avisos} titulo="Tené en cuenta" />
                {/* ROJO primero: es la única consecuencia que le deja trabajo pendiente
                    al operador después de cerrar el modal. Si va debajo del ámbar, se
                    lee último o no se lee. */}
                {noSeVanACargar.length > 0 && (
                  <div
                    role="alert"
                    style={{
                      background: 'var(--err-weak)',
                      border: '1px solid #f0c6c6',
                      borderRadius: 8,
                      padding: '11px 14px',
                      fontSize: 13,
                      color: 'var(--err)',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flex: 'none', marginTop: 2 }}
                    >
                      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4M12 17h.01" />
                    </svg>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        {noSeVanACargar.length === 1
                          ? '1 artículo no se va a cargar'
                          : `${noSeVanACargar.length} artículos no se van a cargar`}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.4 }}>
                        {noSeVanACargar.map((a) => {
                          const articulo = (r.articulos ?? []).find((it) => it.id === a.articuloId);
                          const codigo = String(articulo?.codigo ?? '').trim() || 'Sin código';
                          return <li key={a.id}>{codigo}</li>;
                        })}
                      </ul>
                    </div>
                  </div>
                )}
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
/**
 * Resumen para el encabezado de la lista colapsada.
 *
 * Reemplaza al `ResumenMatch`, que contaba diferencias con la orden de compra
 * ("✓ OC OK" / "3 obs."). Ese resumen se sacó junto con el resto de los avisos de
 * OC: no había ninguna acción del operador detrás de ese número.
 *
 * Ahora resume lo único que sí le pide algo: cuántos artículos NO se van a poder
 * cargar porque el código no existe en el sistema.
 */
function ResumenSinErp({ items, procesando }: { items: Articulo[]; procesando: boolean }) {
  // SIN spinner: el badge del encabezado es el único indicador animado de la card.
  // Tres spinners para un proceso no informan tres veces.
  if (procesando) {
    return (
      <span
        title="Verificando los códigos contra el catálogo del sistema."
        style={{ color: 'var(--muted-2)', fontWeight: 700, letterSpacing: 0, cursor: 'help' }}
      >
        verificando…
      </span>
    );
  }

  const sinVeredicto = items.filter((it) => it.existeEnErp == null).length;
  const inexistentes = items.filter((it) => it.existeEnErp === false).length;

  // NINGUNO verificado: la etapa no corrió todavía.
  if (sinVeredicto === items.length) {
    return (
      <span
        title="Los códigos todavía no se verificaron contra el sistema. Se controla al cargar la factura."
        style={{ color: 'var(--muted-2)', fontWeight: 700, letterSpacing: 0, cursor: 'help' }}
      >
        sin verificar
      </span>
    );
  }

  /**
   * ALGUNOS verificados y otros no. Esto NO debería pasar.
   *
   * La verificación es por lote: o corre sobre todos o sobre ninguno. Un estado
   * mixto significa que la escritura se cortó a mitad — y pasó: un remito quedó
   * con 6 de 22 artículos verificados.
   *
   * Antes este caso caía en la rama de abajo y mostraba "5 sin código", que suena
   * a "los otros 17 están bien". No lo estaban: 1 tenía veredicto y 16 no. El
   * resumen inducía exactamente la conclusión equivocada.
   *
   * Se reporta como incompleto y en ámbar: hay que reverificar, no interpretar.
   */
  if (sinVeredicto > 0) {
    return (
      <span
        title={
          `Verificación INCOMPLETA: ${items.length - sinVeredicto} de ${items.length} artículo(s) ` +
          `tienen veredicto y ${sinVeredicto} quedaron sin verificar. La verificación es por lote, ` +
          'así que esto significa que se cortó a mitad de camino. Usá "Reverificar códigos".'
        }
        style={{ color: 'var(--warn)', fontWeight: 700, letterSpacing: 0, cursor: 'help' }}
      >
        {sinVeredicto} sin verificar
      </span>
    );
  }

  if (inexistentes === 0) {
    return (
      <span
        title="Todos los códigos existen en el sistema para este proveedor"
        style={{ color: 'var(--ok)', fontWeight: 700, letterSpacing: 0, cursor: 'help' }}
      >
        ✓ códigos OK
      </span>
    );
  }

  return (
    <span
      title={
        `${inexistentes} de ${items.length} artículo(s) tienen un código que no existe en el sistema ` +
        'para este proveedor. No se van a cargar automáticamente: hay que cargarlos a mano.'
      }
      style={{ color: 'var(--warn)', fontWeight: 700, letterSpacing: 0, cursor: 'help' }}
    >
      {inexistentes} sin código
    </span>
  );
}

function EcoInline({
  k,
  v,
  sep,
  warn,
  detalle,
}: {
  k: string;
  v: string;
  sep?: boolean;
  warn?: string[];
  /** Tooltip informativo (azul). Si hay `warn`, gana `warn`: un problema importa más. */
  detalle?: ReactNode;
}) {
  const advertido = (warn?.length ?? 0) > 0;
  const conDetalle = !advertido && detalle != null;
  const valor = (
    <b
      style={{
        fontWeight: 700,
        color: advertido ? 'var(--warn)' : 'var(--ink-2)',
        fontVariantNumeric: 'tabular-nums',
        cursor: advertido || conDetalle ? 'help' : undefined,
        textDecoration: advertido || conDetalle ? 'underline dotted' : undefined,
        textUnderlineOffset: advertido || conDetalle ? 3 : undefined,
      }}
    >
      {v}
    </b>
  );
  const envuelto = advertido
    ? conAdvertencia(warn!, valor)
    : conDetalle
      ? (
        <Tooltip texto={detalle} ancho={320} fondo={TOOLTIP_DESGLOSE_BG} style={estiloTooltipDesglose}>
          {valor}
        </Tooltip>
      )
      : valor;
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {sep && <span style={{ color: 'var(--muted-3)', marginRight: 8 }}>·</span>}
      {k} {envuelto}
    </span>
  );
}

function HeadCell({ label, value, big, warn }: { label: string; value: string; big?: boolean; warn?: string[] }) {
  const advertido = (warn?.length ?? 0) > 0;
  const valor = (
    <div
      style={{
        fontSize: big ? 22 : 16,
        fontWeight: big ? 800 : 700,
        color: advertido ? 'var(--warn)' : big ? 'var(--navy)' : 'var(--ink-2)',
        letterSpacing: big ? '.3px' : undefined,
        cursor: advertido ? 'help' : undefined,
        textDecoration: advertido ? 'underline dotted' : undefined,
        textUnderlineOffset: advertido ? 3 : undefined,
      }}
    >
      {value}
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px', color: 'var(--muted-2)' }}>{label}</div>
      {advertido ? conAdvertencia(warn!, valor) : valor}
    </div>
  );
}

/**
 * Marca del ítem que no tiene respaldo de orden de compra. Va dentro de un
 * `conAdvertencia`, que le pone el tooltip con el motivo.
 */

/** Flecha circular de recargar. Sin texto: va en un botón de 30x30 del header. */
function IconoRecargar() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}


/** Envuelve un nodo en un tooltip ámbar con los mensajes de advertencia del campo. */
function conAdvertencia(warn: string[], node: ReactNode): ReactNode {
  const texto = warn.length === 1 ? warn[0] : warn.map((m) => `• ${m}`).join('\n');
  return (
    <Tooltip texto={texto} fondo={TOOLTIP_WARN_BG}>
      {node}
    </Tooltip>
  );
}
