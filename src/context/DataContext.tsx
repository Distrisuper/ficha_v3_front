import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { proveedoresApi } from '../api/proveedores';
import { sucursalesApi } from '../api/sucursales';
import { listRemitos } from '../api/remitos';
import type { Proveedor, Remito, Sucursal, UUID } from '../types/api';
import { EMPTY_FILTERS, type RemitoFilters } from '../utils/filtros';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface DataContextValue {
  proveedores: Proveedor[];
  sucursales: Sucursal[];
  reloadCatalogos: () => Promise<void>;

  sucursalId: string;
  sucursalNombre: string;
  setSucursal: (id: UUID, nombre: string) => void;
  clearSucursal: () => void;

  // Filtros compartidos por Pendientes/Historial. El rango de fechas además viaja
  // en la request de remitos (ver reloadRemitos), por eso el estado vive acá.
  filters: RemitoFilters;
  setFilters: (f: RemitoFilters) => void;

  remitos: Remito[];
  // remitosHistory: Remito[];
  remitosLoading: boolean;
  remitosError: string | null;
  reloadRemitos: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useLocalStorage('ficha_sucursal_id');
  const [sucursalNombre, setSucursalNombre] = useLocalStorage('ficha_sucursal_nombre');
  const [remitos, setRemitos] = useState<Remito[]>([]);
  const [filters, setFilters] = useState<RemitoFilters>(EMPTY_FILTERS);
  // const [remitosHistory, setRemitosHistory] = useState<Remito[]>([]);
  const [remitosLoading, setRemitosLoading] = useState(false);
  const [remitosError, setRemitosError] = useState<string | null>(null);

  const reloadCatalogos = useCallback(async () => {
    const [provs, sucs] = await Promise.all([proveedoresApi.list(), sucursalesApi.list()]);
    setProveedores(provs ?? []);
    setSucursales(sucs ?? []);
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
    }),
    [
      proveedores,
      sucursales,
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
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de DataProvider');
  return ctx;
}
