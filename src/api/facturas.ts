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

// El JWT viaja por query param (?token=) porque EventSource no puede mandar el
// header Authorization; sseUrl lo agrega. El back valida firma + tenant.
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
