import { api } from './client';
import type { CreateProveedorInput, Proveedor, UUID } from '../types/api';
import { soloDigitos } from '../utils/cuit';

export const proveedoresApi = {
  list: () => api.get<Proveedor[]>('/proveedores'),
  get: (id: UUID) => api.get<Proveedor>(`/proveedores/${id}`),
  // El alta pide los tres campos. El cuit se manda sin máscara: el backend
  // igual normaliza, pero mandarlo limpio evita depender de eso.
  create: (input: CreateProveedorInput) =>
    api.post<Proveedor>('/proveedores', {
      nombre: input.nombre.trim(),
      razonSocial: input.razonSocial.trim(),
      cuit: soloDigitos(input.cuit),
    }),
  // El PATCH sólo acepta nombre: razonSocial y cuit son datos legales ya
  // impresos en remitos históricos, el backend rechaza el resto con 400.
  update: (id: UUID, nombre: string) => api.patch<Proveedor>(`/proveedores/${id}`, { nombre }),
  remove: (id: UUID) => api.delete<void>(`/proveedores/${id}`),
};
