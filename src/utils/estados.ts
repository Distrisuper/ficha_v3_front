import type { RemitoEstado } from '../types/api';

// Ciclo de vida real de un remito en el backend (ver ficha_v3_api RemitoEstado + remitos.service):
//   pendiente → procesado (LLM listo) → cargado (tras approveRemito)
// GET /remitos (findAll) hoy devuelve SÓLO los remitos en estado 'cargado', que son
// justamente los "pendientes de cargar a stock". Por eso 'cargado' entra en este grupo.
export const PENDIENTES_ESTADOS = new Set<RemitoEstado>(['cargado', 'pendiente', 'procesado']);

// Estados terminales del historial. El back (GET /remitos/history) ya filtra por
// estos estados server-side; este set queda como guarda defensiva client-side.
//   aprobado → stock cargado OK (submitMercaderia)
//   anulado  → descartado (discardRemito, soft-delete)
export const HISTORIAL_ESTADOS = new Set<RemitoEstado>(['aprobado', 'anulado']);

export const esPendiente = (estado: RemitoEstado): boolean => PENDIENTES_ESTADOS.has(estado);
export const esHistorial = (estado: RemitoEstado): boolean => HISTORIAL_ESTADOS.has(estado);
