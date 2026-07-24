import type { RemitoEstado } from '../types/api';

// Ciclo de vida real de un remito en el backend (ver ficha_v3_api RemitoEstado + remitos.service):
//   pendiente → procesado (LLM listo) → cargado (tras approveRemito)
// GET /remitos (findAll) hoy devuelve SÓLO los remitos en estado 'cargado', que son
// justamente los "pendientes de cargar a stock". Por eso 'cargado' entra en este grupo.
export const PENDIENTES_ESTADOS = new Set<RemitoEstado>(['cargado', 'pendiente', 'procesado']);

// Estados que muestra el historial. El back (GET /remitos/history) ya filtra por
// estos estados server-side; este set queda como guarda defensiva client-side.
export const HISTORIAL_ESTADOS = new Set<RemitoEstado>(['procesado', 'cargado', 'aprobado', 'anulado']);

// Etiqueta + color con que se muestra cada estado en el historial.
//   procesado → "procesado"        (gris)     · LLM terminó, sin cargar
//   cargado   → "stock pendiente"  (amarillo) · factura cargada, falta stock
//   aprobado  → "finalizado"       (verde)    · stock cargado OK
//   anulado   → "anulado"          (rojo)     · descartado (soft-delete)
export interface EstadoView {
  label: string;
  color: string;
}

export function historialEstadoView(estado: RemitoEstado): EstadoView {
  switch (estado) {
    case 'procesado':
      return { label: 'procesado', color: 'var(--muted-3)' };
    case 'cargado':
      return { label: 'stock pendiente', color: 'var(--warn)' };
    case 'aprobado':
      return { label: 'finalizado', color: 'var(--ok)' };
    case 'anulado':
      return { label: 'anulado', color: 'var(--err)' };
    default:
      return { label: estado, color: 'var(--ink-2)' };
  }
}

export const esPendiente = (estado: RemitoEstado): boolean => PENDIENTES_ESTADOS.has(estado);
export const esHistorial = (estado: RemitoEstado): boolean => HISTORIAL_ESTADOS.has(estado);
