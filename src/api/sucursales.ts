import { api } from './client';
import type { CreateSucursalInput, Sucursal, UUID } from '../types/api';

export const sucursalesApi = {
  list: () => api.get<Sucursal[]>('/sucursales'),
  get: (id: UUID) => api.get<Sucursal>(`/sucursales/${id}`),
  /**
   * El alta ahora pide el código de depósito del ERP además del nombre.
   *
   * El back lo exige: es el dato con el que el integrador escribe el comprobante
   * y con el que se filtran las órdenes de compra. Antes salía de una tabla
   * hardcodeada en el conector.
   */
  create: (input: CreateSucursalInput) => api.post<Sucursal>('/sucursales', input),
  /**
   * PATCH parcial: se manda sólo lo que cambió. El back rechaza un body vacío
   * con 400 en vez de devolver 200 sobre una operación que no ocurrió.
   */
  update: (id: UUID, cambios: Partial<CreateSucursalInput>) =>
    api.patch<Sucursal>(`/sucursales/${id}`, cambios),
  remove: (id: UUID) => api.delete<void>(`/sucursales/${id}`),
};
