import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { proveedoresApi } from '../api/proveedores';
import { sucursalesApi } from '../api/sucursales';
import { listRemitos } from '../api/remitos';
import type { Proveedor, Remito, Sucursal, UUID } from '../types/api';
import type { RemitoListoPayload } from '../types/events';
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

  // reloadRemitos cambia de identidad con cada filtro; en un ref la suscripción
  // no se rearma en cada tipeo del usuario.
  const reloadRef = useRef(reloadRemitos);
  reloadRef.current = reloadRemitos;
  const sucursalRef = useRef(sucursalId);
  sucursalRef.current = sucursalId;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const desuscribir = subscribe('remito.listo_para_stock', (evento) => {
      const payload = evento.payload as RemitoListoPayload | undefined;

      // Filtrado por sucursal del lado del cliente, a propósito: hoy no existe
      // relación usuario↔sucursal en el back, así que la sucursal no es una
      // frontera de permisos sino la vista que este usuario eligió. Sin sucursal
      // seleccionada se ven todas.
      const seleccionada = sucursalRef.current;
      if (seleccionada && payload?.sucursalId && payload.sucursalId !== seleccionada) {
        return;
      }

      // Un PDF puede generar N remitos y handleProcesar los aprueba en paralelo,
      // así que llegan N eventos casi simultáneos. Sin agrupar, cada cliente
      // conectado dispararía N veces GET /remitos para terminar en el mismo
      // estado.
      //
      // Agrupar es gratis justamente porque el evento no transporta datos: es una
      // señal de invalidación, y descartar las intermedias no pierde información.
      // Si el evento trajera el remito, no se podría.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void reloadRef.current(), REFETCH_DEBOUNCE_MS);
    });

    return () => {
      desuscribir();
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
      removeRemitoLocal,
      patchRemitoLocal,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
