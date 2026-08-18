import { api } from './client';
import type { CreateFacturaResponse, UUID } from '../types/api';

export async function createFactura(
  file: File,
  sucursalId: UUID,
  proveedorId: UUID,
): Promise<CreateFacturaResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('sucursalId', sucursalId);
  form.append('proveedorId', proveedorId);
  return api.postForm<CreateFacturaResponse>('/facturas', form);
}

export async function approveFactura(id: UUID): Promise<void> {
  await api.post<void>(`/facturas/submit/${id}`);
}

/**
 * Carga la factura ENTERA (todos sus remitos) de forma atómica.
 *
 * El back marca todos los remitos como cargados en una transacción, o ninguno. Si un
 * remito choca con una factura ya cargada (mismo proveedor + Nº factura + Nº remito),
 * responde 409 `FACTURA_ALREADY_LOADED` y no notifica al cliente externo. La carga de
 * una factura no puede ser parcial.
 */
export async function submitFacturaBatch(remitoIds: UUID[]): Promise<void> {
  await api.post<void>('/facturas/submit-batch', { remitoIds });
}

