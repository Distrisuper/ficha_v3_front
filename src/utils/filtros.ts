import type { Remito } from '../types/api';

// Filtros compartidos por las pantallas de Pendientes e Historial.
// Cada campo tiene un valor "todos": tipo = 'todos', o cadena vacía en los
// selects/fecha. Ver FiltersBar (UI) y applyFilters (aplicación sobre la lista).
export type TipoFiltro = 'todos' | 'remito' | 'factura';

// La sucursal NO va acá: se filtra con la sucursal global (sucursalId de DataContext,
// persistida en localStorage), que ya se aplica en listRemitos. Ver FiltersBar.
export interface RemitoFilters {
  tipo: TipoFiltro;
  proveedorId: string; // '' = todos
  fechaDesde: string; // '' = sin límite inferior · formato yyyy-mm-dd (input date)
  fechaHasta: string; // '' = sin límite superior · formato yyyy-mm-dd (input date)
}

export const EMPTY_FILTERS: RemitoFilters = {
  tipo: 'todos',
  proveedorId: '',
  fechaDesde: '',
  fechaHasta: '',
};

export const hayFiltrosActivos = (f: RemitoFilters): boolean =>
  f.tipo !== 'todos' || f.proveedorId !== '' || f.fechaDesde !== '' || f.fechaHasta !== '';

// La fecha del remito suele venir como ISO ("2024-05-01T..."); tomamos el prefijo
// yyyy-mm-dd para comparar lexicográficamente contra los valores del input date.
const fechaISO = (r: Remito): string => String(r.fecha ?? '').slice(0, 10);

// Aplica los filtros sobre una lista ya acotada por estado (pendientes/historial).
// El TIPO no se filtra acá: el back tiene su propia lógica remito/factura (el campo
// `tipo` literal no la refleja), así que confiamos en el filtrado del back — `tipo` sólo
// viaja como query param y dispara el refetch. La sucursal ya viene filtrada en listRemitos.
export function applyFilters(remitos: Remito[], f: RemitoFilters): Remito[] {
  return remitos.filter((r) => {
    if (f.proveedorId && r.proveedorId !== f.proveedorId) return false;
    if (f.fechaDesde || f.fechaHasta) {
      const fecha = fechaISO(r);
      if (!fecha) return false;
      if (f.fechaDesde && fecha < f.fechaDesde) return false;
      if (f.fechaHasta && fecha > f.fechaHasta) return false;
    }
    return true;
  });
}
