import { api } from './client';
import type { Remito, UUID } from '../types/api';

/** Espejo de `UpdateRemitoSchema` del back (`src/remitos/schemas/remito.schema.ts`). */
export interface UpdateRemitoInput {
  remitoNro?: string | null;
  facturaNro?: string | null;
  fecha?: string | null;
}

export interface ListRemitosParams {
  tipo?: string; // 'remito' | 'factura' (omitir = todos)
  proveedorId?: UUID;
  fechaDesde?: string; // yyyy-mm-dd
  fechaHasta?: string; // yyyy-mm-dd
}

// NOTA sobre GET /remitos: el controller actual del backend lee `sucursalId` desde
// @Body en una request GET, lo cual el fetch nativo del navegador no permite (no se
// puede enviar body en GET). Mandamos el filtro como query param a la espera de que
// el backend lo adopte, y además filtramos client-side por las dudas de que el
// backend ignore el parámetro y devuelva todos los remitos.
// Todos los filtros (tipo, proveedorId, fechaDesde, fechaHasta) viajan como query
// param; el filtrado visual definitivo lo hace applyFilters en cada pantalla.
export async function listRemitos(sucursalId?: UUID, params?: ListRemitosParams): Promise<Remito[]> {
  const qs = new URLSearchParams();
  if (sucursalId) qs.set('sucursalId', sucursalId);
  if (params?.tipo) qs.set('tipo', params.tipo);
  if (params?.proveedorId) qs.set('proveedorId', params.proveedorId);
  if (params?.fechaDesde) qs.set('fechaDesde', params.fechaDesde);
  if (params?.fechaHasta) qs.set('fechaHasta', params.fechaHasta);
  const query = qs.toString();
  const data = await api.get<Remito[]>(`/remitos${query ? `?${query}` : ''}`);
  const arr = Array.isArray(data) ? data : [];
  if (!sucursalId) return arr;
  // Filtro tolerante: sólo descartamos filas con una sucursal EXPLÍCITAMENTE distinta.
  // Si el back no incluye sucursalId en la respuesta (o lo manda anidado en `sucursal`),
  // confiamos en que ya filtró por el query param y no las tiramos.
  return arr.filter((r) => {
    const sid = r.sucursalId ?? r.sucursal?.id;
    return !sid || sid === sucursalId;
  });
}

// Historial (estados terminales: aprobado / anulado). El back filtra por estado y
// scopea por company_id; sucursalId es opcional (sin él trae todas las sucursales).
export async function listHistorial(sucursalId?: UUID): Promise<Remito[]> {
  const qs = sucursalId ? `?sucursalId=${encodeURIComponent(sucursalId)}` : '';
  const data = await api.get<Remito[]>(`/remitos/history${qs}`);
  return Array.isArray(data) ? data : [];
}

export const remitosApi = {
  list: listRemitos,
  history: listHistorial,
  // Último grupo de remitos PROCESADOS del usuario (para aprobar/rechazar al iniciar).
  own: () => api.get<Remito[]>('/remitos/own'),
  getByJobId: (jobId: string) => api.get<Remito[]>(`/remitos/by-job/${jobId}`),
  get: (id: UUID) => api.get<Remito | null>(`/remitos/${id}`),
  approve: (id: UUID) => api.patch<Remito>(`/remitos/${id}/approve`),
  updateTotal: (id: UUID, total: number) => api.patch<Remito>(`/remitos/${id}/total`, { total }),
  /**
   * Edita la cabecera del remito.
   *
   * El back valida con una allowlist `.strict()`: cualquier campo fuera de estos
   * tres devuelve 400. El tipo lo refleja para que no se pueda mandar de más — antes
   * era `Partial<Remito>` y se mandaba el objeto completo, incluidos `id`, `estado`
   * y los montos, que el back aceptaba y escribía.
   */
  update: (id: UUID, data: UpdateRemitoInput) => api.patch<Remito>(`/remitos/${id}`, data),
  // Backend stub: PATCH /remitos/:id/items no persiste hoy (ver aviso en UI).
  updateItems: (id: UUID, items: unknown[]) => api.patch<Remito>(`/remitos/${id}/items`, items),
  // Envía los UUID de los artículos marcados para que el back procese la carga a stock.
  submitMercaderia: (id: UUID, articulos: string[]) =>
    api.post<void>(`/remitos/submit-mercaderia/${id}`, { articulos }),
  // Envía los UUID de los artículos marcados para que el back procese la carga de la factura.
  submitFactura: (id: UUID) => api.post<void>(`/factura/submit/${id}`),
  // Descarta un remito procesado (no aprobado). El back decide marcar/eliminar.
  discard: (id: UUID) => api.patch<void>(`/remitos/${id}/discard`),
  remove: (id: UUID) => api.delete<void>(`/remitos/${id}`),
};
