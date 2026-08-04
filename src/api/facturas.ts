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

