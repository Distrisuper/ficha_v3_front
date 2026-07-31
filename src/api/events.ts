import { api, API_BASE } from './client';

interface TicketResponse {
  ticket: string;
  expiresIn: number;
}

/**
 * Pide un ticket de un solo uso para abrir el stream.
 *
 * Va por el canal normal (Bearer en el header). El ticket existe justamente
 * porque `EventSource` no puede mandar headers y no queremos el JWT —que vive
 * días— en la query string y en los access logs del proxy.
 */
export async function requestTicket(): Promise<string> {
  const { ticket } = await api.post<TicketResponse>('/events/ticket');
  return ticket;
}

export function streamUrl(ticket: string): string {
  return `${API_BASE}/events/stream?ticket=${encodeURIComponent(ticket)}`;
}
