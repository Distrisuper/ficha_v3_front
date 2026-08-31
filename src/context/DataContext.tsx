import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { proveedoresApi } from '../api/proveedores';
import { sucursalesApi } from '../api/sucursales';
import { listRemitos, remitosApi } from '../api/remitos';
import { ApiError } from '../api/client';
import type { Proveedor, Remito, Sucursal, UUID } from '../types/api';
import type {
  DomainEvent,
  OrdenCompraValidadaPayload,
  RemitoListoPayload,
} from '../types/events';
import { EMPTY_FILTERS, type RemitoFilters } from '../utils/filtros';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { DataContext, type DataContextValue } from './data-context';
import { useSse } from './sse-context';

/**
 * Ventana para agrupar una ráfaga de eventos en un solo refetch.
 * Imperceptible para el usuario y suficiente para colapsar las N aprobaciones
 * de un mismo comprobante.
 */
const REFETCH_DEBOUNCE_MS = 300;

export function DataProvider({ children }: { children: ReactNode }) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [catalogosLoading, setCatalogosLoading] = useState(true);
  const [sucursalId, setSucursalId] = useLocalStorage('ficha_sucursal_id');
  const [sucursalNombre, setSucursalNombre] = useLocalStorage('ficha_sucursal_nombre');
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [filters, setFilters] = useState<RemitoFilters>(EMPTY_FILTERS);
  // const [remitosHistory, setRemitosHistory] = useState<Remito[]>([]);
  const [remitosLoading, setRemitosLoading] = useState(false);
  const [remitosError, setRemitosError] = useState<string | null>(null);

  const reloadCatalogos = useCallback(async () => {
    setCatalogosLoading(true);
    try {
      const [provs, sucs] = await Promise.all([proveedoresApi.list(), sucursalesApi.list()]);
      setProveedores(provs ?? []);
      setSucursales(sucs ?? []);
    } finally {
      // El error se sigue propagando (ConfiguracionPage lo muestra al crear/editar).
      setCatalogosLoading(false);
    }
  }, []);

  const reloadRemitos = useCallback(async () => {
    setRemitosLoading(true);
    setRemitosError(null);
    try {
      const data = await listRemitos(sucursalId || undefined, {
        tipo: filters.tipo !== 'todos' ? filters.tipo : undefined,
        proveedorId: filters.proveedorId || undefined,
        fechaDesde: filters.fechaDesde || undefined,
        fechaHasta: filters.fechaHasta || undefined,
      });
      setRemitos(data);
    } catch (e) {
      setRemitosError(e instanceof Error ? e.message : 'No se pudieron cargar los remitos');
    } finally {
      setRemitosLoading(false);
    }
  }, [sucursalId, filters.tipo, filters.proveedorId, filters.fechaDesde, filters.fechaHasta]);

  // Carga inicial al montar el provider: remitos (el badge de "Pendientes" del sidebar
  // los necesita siempre) y los catálogos de proveedores/sucursales. Los remitos además
  // se recargan solos al cambiar de sucursal (reloadRemitos depende de sucursalId).
  // El historial sigue refrescándose on-demand al abrir su pestaña.
  useEffect(() => {
    void reloadRemitos();
  }, [reloadRemitos]);
  useEffect(() => {
    void reloadCatalogos();
  }, [reloadCatalogos]);

  // --- Refresco en vivo de "pendientes de carga de stock" --------------------
  //
  // Cuando cualquier usuario de la empresa aprueba un comprobante, este pasa a
  // `cargado` y tiene que aparecer en la pantalla de Pendientes (y en el badge
  // del sidebar) del resto del equipo sin recargar la página.
  //
  // El evento NO trae el remito: dispara un refetch. Así la API sigue siendo la
  // única fuente de verdad y no hay dos caminos por los que el estado pueda
  // divergir — el SSE es una señal de invalidación de cache, no un canal de
  // datos.
  const { subscribe } = useSse();

  /**
   * Trae un solo remito y lo mergea en la lista, sin reemplazarla.
   *
   * Se declara ACÁ, arriba de los refs que lo capturan: como es un `const`, usarlo
   * antes de su declaración es TDZ — `ReferenceError` en el primer render, no un
   * warning.
   *
   * Sólo se parchean los campos que el evento pudo cambiar (`articulos`, `estado`,
   * `facturaCargada`) y no el remito completo: `GET /remitos/:id` no incluye las
   * relaciones `proveedor`/`sucursal` que sí trae el listado, así que un reemplazo
   * total borraría los nombres de la card.
   */
  const refreshRemito = useCallback(async (id: string) => {
    let fresco: Remito | null;
    try {
      fresco = await remitosApi.get(id as UUID);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Ya no existe (lo descartó otro usuario): sacarlo en vez de dejar una
        // card fantasma que va a fallar en cada acción.
        setRemitos((prev) => prev.filter((r) => r.id !== id));
        return;
      }
      // Best-effort: la card queda con los datos viejos hasta el próximo refresh.
      // No se toca remitosError para no pintar un error global por el refresco
      // puntual de una sola fila.
      return;
    }
    if (!fresco) return;
    const remito = fresco;

    // GET /remitos/:id devuelve TODOS los artículos; el listado de pendientes usa
    // un innerJoin con `stock_cargado = false`. Sin este filtro, un refresco haría
    // reaparecer artículos ya enviados a stock — deshaciendo lo que
    // handleCargarStock acababa de sacar de la card.
    //
    // Replicar acá un filtro del servidor es deuda: lo correcto sería que el
    // detalle tuviera la misma proyección que el listado.
    const articulosPendientes = (remito.articulos ?? []).filter((a) => a.stockCargado !== true);

    /**
     * Se copia el remito COMPLETO, no tres campos elegidos a mano.
     *
     * Antes era `{...r, articulos, estado, facturaCargada}`: cualquier otro campo
     * que cambiara del lado del servidor NO llegaba a la pantalla hasta un reload
     * completo. Es el bug de "la validación terminó pero no se ve": el evento
     * llegaba, el fetch traía el dato nuevo, y el merge lo descartaba.
     *
     * Concretamente se perdían `ocLineasProveedor` (si el proveedor tiene OC, que
     * es lo que decide si los semáforos van en rojo "sin OC"), `subtotal`, `iva`,
     * `percepciones`, `total` y `percepcionesDetalle`. Una lista blanca de campos
     * a copiar es una lista que alguien tiene que acordarse de actualizar, y nadie
     * se acuerda — el síntoma es siempre este.
     *
     * Lo único que NO viene del servidor es `articulos`, que se filtra abajo por la
     * diferencia de proyección entre el detalle y el listado.
     */
    setRemitos((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              ...remito,
              articulos: articulosPendientes,
              // `GET /remitos/:id` NO expande `proveedor` ni `sucursal` (el listado
              // sí). Sin esto, el spread los pone en undefined y la card pierde los
              // nombres — el mismo bug que el merge selectivo original evitaba a
              // costa de perder todo lo demás.
              //
              // El arreglo de fondo es que el detalle tenga la misma proyección que
              // el listado; mientras no la tenga, se conservan los del listado.
              proveedor: remito.proveedor ?? r.proveedor,
              sucursal: remito.sucursal ?? r.sucursal,
            }
          : r,
      ),
    );
  }, []);

  // reloadRemitos cambia de identidad con cada filtro; en un ref la suscripción
  // no se rearma en cada tipeo del usuario.
  const reloadRef = useRef(reloadRemitos);
  reloadRef.current = reloadRemitos;
  const refreshRef = useRef(refreshRemito);
  refreshRef.current = refreshRemito;
  // La lista, por ref: el efecto de suscripción depende sólo de `subscribe`, así
  // que leerla del closure la dejaría congelada en el primer render.
  const remitosRef = useRef(remitos);
  remitosRef.current = remitos;
  const sucursalRef = useRef(sucursalId);
  sucursalRef.current = sucursalId;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    /**
     * Filtrado por sucursal del lado del cliente, a propósito: hoy no existe
     * relación usuario↔sucursal en el back, así que la sucursal no es una frontera
     * de permisos sino la vista que este usuario eligió. Sin sucursal seleccionada
     * se ven todas.
     */
    const esDeMiVista = (payload?: { sucursalId?: string | null }) => {
      const seleccionada = sucursalRef.current;
      return !seleccionada || !payload?.sucursalId || payload.sucursalId === seleccionada;
    };

    // --- Remito NUEVO en la lista: no hay nada que parchear, hay que traerlo ---
    //
    // Un PDF puede generar N remitos y handleProcesar los aprueba en paralelo, así
    // que llegan N eventos casi simultáneos. Sin agrupar, cada cliente conectado
    // dispararía N veces GET /remitos para terminar en el mismo estado.
    const alta = (evento: DomainEvent) => {
      if (!esDeMiVista(evento.payload as RemitoListoPayload | undefined)) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void reloadRef.current(), REFETCH_DEBOUNCE_MS);
    };

    // --- Remito YA en la lista: se refresca sólo esa card ---
    //
    // `reloadRemitos()` acá era el bug: reemplaza el array entero, re-renderiza
    // todas las cards y, mientras dura el fetch, PendientesPage desmontaba la
    // lista — el navegador perdía el scroll y saltaba arriba de todo.
    //
    // Cada evento trae su `remitoId`, así que se refresca uno por uno. No hace
    // falta debounce: son requests independientes a filas distintas.
    const cambio = (evento: DomainEvent) => {
      const payload = evento.payload as OrdenCompraValidadaPayload | undefined;
      if (!payload?.remitoId || !esDeMiVista(payload)) return;
      void refreshRef.current(payload.remitoId);
    };

    /**
     * --- Una etapa FALLÓ: también hay que refrescar la card ---
     *
     * `proceso.fallido` viaja con `processId = jobId` y sin `remitoId`, así que no
     * sirve para `cambio`. Se mapea jobId → remito con la lista que ya está en
     * memoria.
     *
     * Sin esto quedaba un agujero: al fallar la etapa de orden de compra el back
     * persiste `estado_oc = 'error'` pero NO publica ningún evento con `remitoId`
     * (el `orden_compra.validada` sale sólo en el camino feliz). El cartel "Orden
     * de compra no disponible" dependía entonces del tracker en memoria, que muere
     * en cada refresh — de ahí el "sólo aparece si recargo".
     *
     * Mismo caso para la etapa de códigos: al fallar hay que traer
     * `estado_codigos = 'error'` para que la card ofrezca "Reverificar" en vez de
     * quedarse esperando un veredicto que no va a llegar.
     */
    const fallo = (evento: DomainEvent) => {
      const jobId = evento.processId;
      if (!jobId) return;
      // Puede haber N remitos por job (un PDF con varios comprobantes).
      const afectados = remitosRef.current.filter((r) => r.jobId === jobId);
      for (const r of afectados) void refreshRef.current(r.id);
    };

    const desuscribir = [
      subscribe('remito.listo_para_stock', alta),
      subscribe('orden_compra.validada', cambio),
      subscribe('proceso.fallido', fallo),
    ];

    return () => {
      desuscribir.forEach((fn) => fn());
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [subscribe]);

  const removeRemitoLocal = useCallback((id: string) => {
    setRemitos((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const patchRemitoLocal = useCallback((id: string, partial: Partial<Remito>) => {
    setRemitos((prev) => prev.map((r) => (r.id === id ? { ...r, ...partial } : r)));
  }, []);

  const setSucursal = useCallback(
    (id: UUID, nombre: string) => {
      setSucursalId(id);
      setSucursalNombre(nombre);
    },
    [setSucursalId, setSucursalNombre],
  );

  // const handleSetHistory = useCallback((remitos: Remito[]) => {
  //   setRemitosHistory(remitos);
  // }, []);

  const clearSucursal = useCallback(() => {
    setSucursalId('');
    setSucursalNombre('');
  }, [setSucursalId, setSucursalNombre]);

  const value = useMemo<DataContextValue>(
    () => ({
      proveedores,
      sucursales,
      catalogosLoading,
      reloadCatalogos,
      sucursalId,
      sucursalNombre,
      setSucursal,
      clearSucursal,
      filters,
      setFilters,
      remitos,
      // remitosHistory,
      remitosLoading,
      remitosError,
      reloadRemitos,
      refreshRemito,
      removeRemitoLocal,
      patchRemitoLocal,
    }),
    [
      proveedores,
      sucursales,
      catalogosLoading,
      reloadCatalogos,
      sucursalId,
      sucursalNombre,
      setSucursal,
      clearSucursal,
      filters,
      // remitosHistory,
      remitos,
      remitosLoading,
      remitosError,
      reloadRemitos,
      refreshRemito,
      removeRemitoLocal,
      patchRemitoLocal,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
