import type { RemitoEstado } from '../types/api';

// Ciclo de vida real de un remito en el backend (ver ficha_v3_api RemitoEstado + remitos.service):
//   pendiente → procesado (LLM listo) → cargado (tras approveRemito)
// GET /remitos (findAll) hoy devuelve SÓLO los remitos en estado 'cargado', que son
// justamente los "pendientes de cargar a stock". Por eso 'cargado' entra en este grupo.
export const PENDIENTES_ESTADOS = new Set<RemitoEstado>(['cargado', 'pendiente', 'procesado']);

// Estados finales para el historial. Nota: hoy el backend no expone un endpoint que
// liste estos estados (approve deja 'cargado', no 'aprobado'), así que el historial
// puede venir vacío hasta que la API lo soporte.
export const HISTORIAL_ESTADOS = new Set<RemitoEstado>(['aprobado', 'anulado', 'error']);

export const esPendiente = (estado: RemitoEstado): boolean => PENDIENTES_ESTADOS.has(estado);
export const esHistorial = (estado: RemitoEstado): boolean => HISTORIAL_ESTADOS.has(estado);
