// Espejo del contrato de ficha_v3_api/src/events/domain-events.ts y
// stream.constants.ts. Si cambia allá, cambia acá.

import type { UUID } from './api';

export type ProcesoStage = 'ocr' | 'llm' | 'persistencia' | 'orden_compra';

export type DomainEventType =
  // Pipeline de extracción. Llegan SÓLO al usuario que subió el PDF: el back los
  // publica al canal `sse:user:{id}`, no hace falta filtrar por userId acá.
  | 'proceso.encolado'
  | 'proceso.etapa.iniciada'
  | 'proceso.etapa.progreso'
  | 'proceso.etapa.completada'
  | 'proceso.completado'
  | 'proceso.fallido'
  // Hechos del negocio, canal de empresa. Estos SÍ llegan a todos los usuarios
  // del tenant y el filtrado por sucursal es responsabilidad del cliente.
  | 'remito.listo_para_stock'
  | 'orden_compra.validada';

export type Audiencia = 'usuario' | 'empresa';

/**
 * Payload de `orden_compra.validada`.
 *
 * Trae contadores y no los artículos: el evento es una señal de invalidación de
 * cache. Los flags reales (stockMatch / precioMatch) se leen de la API.
 */
export interface OrdenCompraValidadaPayload {
  remitoId: UUID;
  sucursalId: UUID | null;
  autorizados: number;
  observados: number;
}

/** Payload de `remito.listo_para_stock`. */
export interface RemitoListoPayload {
  remitoId: UUID;
  sucursalId: UUID | null;
  proveedorId: UUID | null;
  remitoNro: string | null;
  facturaNro: string | null;
  total: number;
  aprobadoPor?: UUID;
}

/**
 * Evento de negocio. Es lo que llega al dispatcher y a las pantallas.
 *
 * `seq` es monotónico por `processId` y la entrega es at-least-once: el cliente
 * DEBE descartar todo evento con seq menor o igual al último aplicado para ese
 * proceso. Sin eso, un snapshot que llega tarde pisa estado más nuevo y la barra
 * de progreso retrocede.
 */
export interface DomainEvent<P = unknown> {
  eventId: string;
  type: DomainEventType;
  /** Quién debía verlo. El ruteo ya lo hizo el server; acá es informativo. */
  audiencia: Audiencia;
  companyId: UUID;
  userId?: UUID;
  processId: string;
  stage?: ProcesoStage;
  seq: number;
  ts: string;
  payload?: P;
}

// --- Frames de control del transporte ---------------------------------------
// No son eventos de negocio: los consume la capa de conexión y nunca llegan a
// una pantalla.

export type StreamEventType = 'stream.snapshot' | 'stream.heartbeat' | 'stream.expirado';

export type EstadoExtraccion = 'pendiente' | 'corriendo' | 'ok' | 'error';

/** `null` = la validación contra la orden de compra nunca se pidió. */
export type EstadoOrdenCompra = 'corriendo' | 'ok' | 'error' | null;

/**
 * Estado persistido de un proceso, tal como lo devuelve el snapshot del stream.
 *
 * Los dos estados van separados porque el pipeline tiene dos etapas independientes:
 * un fallo de la orden de compra NO invalida los remitos extraídos. Antes esto era un
 * `estado: string` con tres valores que sólo describía la primera etapa, y la segunda
 * no se persistía en absoluto — de ahí los parches en memoria de este front.
 */
export interface ProcesoSnapshot {
  processId: string;
  estadoExtraccion: EstadoExtraccion;
  estadoOc: EstadoOrdenCompra;
  errorCode: string | null;
  tipo: string;
  seq: number;
  createdAt: string;
}

export interface StreamFrame {
  type: StreamEventType;
  ts: string;
  procesos?: ProcesoSnapshot[];
}

export type SseFrame = DomainEvent | StreamFrame;

const TIPOS_DE_STREAM = new Set<string>([
  'stream.snapshot',
  'stream.heartbeat',
  'stream.expirado',
]);

export function esFrameDeStream(frame: SseFrame): frame is StreamFrame {
  return TIPOS_DE_STREAM.has(frame.type);
}
