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

// El progreso ya no se sigue desde acá. Hay una única conexión SSE por sesión
// (SseProvider) y las pantallas se enganchan con useProceso(processId).
