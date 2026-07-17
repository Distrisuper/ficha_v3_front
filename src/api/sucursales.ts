import { api } from './client';
import type { Sucursal, UUID } from '../types/api';

export const sucursalesApi = {
  list: () => api.get<Sucursal[]>('/sucursales'),
  get: (id: UUID) => api.get<Sucursal>(`/sucursales/${id}`),
  create: (nombre: string) => api.post<Sucursal>('/sucursales', { nombre }),
  update: (id: UUID, nombre: string) => api.patch<Sucursal>(`/sucursales/${id}`, { nombre }),
  remove: (id: UUID) => api.delete<void>(`/sucursales/${id}`),
};
