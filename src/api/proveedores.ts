import { api } from './client';
import type { Proveedor, UUID } from '../types/api';

export const proveedoresApi = {
  list: () => api.get<Proveedor[]>('/proveedores'),
  get: (id: UUID) => api.get<Proveedor>(`/proveedores/${id}`),
  create: (nombre: string) => api.post<Proveedor>('/proveedores', { nombre }),
  update: (id: UUID, nombre: string) => api.patch<Proveedor>(`/proveedores/${id}`, { nombre }),
  remove: (id: UUID) => api.delete<void>(`/proveedores/${id}`),
};
