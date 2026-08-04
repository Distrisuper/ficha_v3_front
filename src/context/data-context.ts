import { createContext, useContext } from 'react';
import type { Proveedor, Remito, Sucursal, UUID } from '../types/api';
import type { RemitoFilters } from '../utils/filtros';

export interface DataContextValue {
  proveedores: Proveedor[];
  sucursales: Sucursal[];
  // true hasta que termina el primer fetch de catálogos: sirve para no avisar
  // "no hay proveedores/sucursales" mientras todavía se están trayendo.
  catalogosLoading: boolean;
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
  remitosLoading: boolean;
  remitosError: string | null;
  reloadRemitos: () => Promise<void>;
  /**
   * Refresca UN remito y lo parchea en la lista, sin reemplazarla.
   *
   * Es lo que hay que usar cuando un evento del bus afecta a un remito puntual:
   * `reloadRemitos()` reemplaza el array entero, lo que re-renderiza todas las
   * cards y —mientras dura el fetch— desmonta la lista, con lo cual el navegador
   * pierde la posición de scroll y salta arriba.
   */
  refreshRemito: (id: string) => Promise<void>;
  // Updates locales (sin refetch) para reflejar cambios ya confirmados por el back.
  removeRemitoLocal: (id: string) => void;
  patchRemitoLocal: (id: string, partial: Partial<Remito>) => void;
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de DataProvider');
  return ctx;
}
