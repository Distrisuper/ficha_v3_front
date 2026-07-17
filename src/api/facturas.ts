import { api, sseUrl } from './client';
import type { CreateFacturaResponse, JobEventDto, UUID } from '../types/api';

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

// El endpoint SSE es público (EventSource no puede mandar Authorization), no requiere token.
export function subscribeFacturaEvents(
  jobId: string,
  onEvent: (ev: JobEventDto) => void,
  onError?: () => void,
): () => void {
  const es = new EventSource(sseUrl(jobId));
  es.onmessage = (m) => {
    try {
      const parsed = JSON.parse(m.data) as JobEventDto;
      onEvent(parsed);
    } catch {
      // ignoramos frames no parseables
    }
  };
  es.onerror = () => {
    onError?.();
  };
  return () => es.close();
}
