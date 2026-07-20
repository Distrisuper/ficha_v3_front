import { api } from './client';
import type { Remito, UUID } from '../types/api';

// NOTA sobre GET /remitos: el controller actual del backend lee `sucursalId` desde
// @Body en una request GET, lo cual el fetch nativo del navegador no permite (no se
// puede enviar body en GET). Mandamos el filtro como query param a la espera de que
// el backend lo adopte, y además filtramos client-side por las dudas de que el
// backend ignore el parámetro y devuelva todos los remitos.
export async function listRemitos(sucursalId?: UUID): Promise<Remito[]> {
  const qs = sucursalId ? `?sucursalId=${encodeURIComponent(sucursalId)}` : '';
  const data = await api.get<Remito[]>(`/remitos${qs}`);
  const arr = Array.isArray(data) ? data : [];
  if (!sucursalId) return arr;
  return arr.filter((r) => r.sucursalId === sucursalId);
}

export const remitosApi = {
  list: listRemitos,
  getByJobId: (jobId: string) => api.get<Remito[]>(`/remitos/by-job/${jobId}`),
  get: (id: UUID) => api.get<Remito | null>(`/remitos/${id}`),
  approve: (id: UUID) => api.patch<Remito>(`/remitos/${id}/approve`),
  updateTotal: (id: UUID, total: number) => api.patch<Remito>(`/remitos/${id}/total`, { total }),
  // Backend stub: PATCH /remitos/:id/items no persiste hoy (ver aviso en UI).
  updateItems: (id: UUID, items: unknown[]) => api.patch<Remito>(`/remitos/${id}/items`, items),
  // Envía los UUID de los artículos marcados para que el back procese la carga a stock.
  submitMercaderia: (id: UUID, articulos: string[]) =>
    api.post<void>(`/remitos/submit-mercaderia/${id}`, { articulos }),
  // Descarta un remito procesado (no aprobado). El back decide marcar/eliminar.
  discard: (id: UUID) => api.patch<void>(`/remitos/${id}/discard`),
  remove: (id: UUID) => api.delete<void>(`/remitos/${id}`),
};
