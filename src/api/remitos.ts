import { api } from './client';
import type { Articulo, Remito, UUID } from '../types/api';

/** Espejo de `UpdateRemitoSchema` del back (`src/remitos/schemas/remito.schema.ts`). */
export interface UpdateRemitoInput {
  remitoNro?: string | null;
  facturaNro?: string | null;
  fecha?: string | null;
}

/**
 * Payload de `PATCH /remitos/:id/items`.
 *
 * El back persiste cada artículo (`codigo`, `nombre`, `cantidad`, `precioUnitario`,
 * `total`) y los montos de cabecera del remito tal como los calculó el front (modelo
 * con IVA/percepciones/bonificaciones a nivel remito). Los nombres van en la forma que
 * espera el back (`precioUnitario`, `total`), no en la del front (`precio_unitario`,
 * `total_unitario`).
 *
 * `codigo` y `nombre` viajan porque son editables en la grilla de Nuevo y antes no se
 * mandaban: el operador corregía la descripción o el código de un artículo mal leído
 * del PDF, la celda mostraba el valor nuevo, y al aprobar se guardaba el viejo. El back
 * los aplica sólo si vienen definidos (son columnas NOT NULL), así que el contrato
 * anterior sigue siendo válido.
 *
 * Van `optional` justamente para poder OMITIRLOS: ver `LARGO_CODIGO`/`LARGO_NOMBRE` y
 * `textoArticulo` para el porqué.
 */
export interface UpdateItemsInput {
  items: {
    id: UUID;
    codigo?: string;
    nombre?: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }[];
  subtotal: number;
  iva: number;
  percepciones: number;
  descuentos: number;
  total: number;
}

/** `articulos.codigo` es `varchar(64)` en el back. */
export const LARGO_CODIGO = 64;
/** `articulos.nombre` es `varchar(255)` en el back. */
export const LARGO_NOMBRE = 255;

/**
 * Normaliza un texto editable de artículo (`codigo` / `nombre`) para el payload.
 *
 * Dos cosas que sólo importan desde que estos campos viajan al back:
 *
 *   - **Vacío devuelve `undefined`, no `''`.** `JSON.stringify` descarta las claves
 *     `undefined`, así que el campo no llega y el back conserva el valor que ya tenía
 *     (aplica sólo lo que viene definido). Son columnas NOT NULL: MySQL acepta la cadena
 *     vacía, de modo que sin esto una celda borrada por accidente dejaba el artículo sin
 *     código — y el código es lo que el ERP usa para identificarlo. Vaciar el campo nunca
 *     es una operación válida, así que conservar el anterior es la respuesta correcta.
 *   - **Se corta al largo de la columna.** Las celdas de la grilla no tienen `maxLength`;
 *     con MySQL en modo estricto un pegado más largo que la columna es un error 1406 y el
 *     PATCH devuelve 500 en medio de la aprobación.
 */
export function textoArticulo(valor: unknown, largoMax: number): string | undefined {
  const limpio = String(valor ?? '').trim();
  return limpio ? limpio.slice(0, largoMax) : undefined;
}

/**
 * Normaliza un artículo del back al contrato del front.
 *
 * La entity `Articulo` del back serializa por NOMBRE DE PROPIEDAD (`precioUnitario`,
 * `totalUnitario`), no por el nombre de columna (`precio_unitario`, `total_unitario`).
 * El front modela todo en snake_case, así que sin este mapeo `precio_unitario` y
 * `total_unitario` llegaban `undefined` y se mostraban como $ 0,00. Se conservan ambas
 * formas por robustez ante cualquiera de los dos contratos.
 */
function normalizeArticulo(a: Record<string, unknown>): Articulo {
  const precio = a.precio_unitario ?? a.precioUnitario ?? 0;
  const total = a.total_unitario ?? a.totalUnitario ?? 0;
  return { ...a, precio_unitario: precio, total_unitario: total } as unknown as Articulo;
}

/** Normaliza los artículos de un remito (ver `normalizeArticulo`). */
function normalizeRemito<T extends Remito | null | undefined>(r: T): T {
  if (!r || typeof r !== 'object') return r;
  const articulos = Array.isArray((r as Remito).articulos)
    ? (r as Remito).articulos!.map((a) => normalizeArticulo(a as unknown as Record<string, unknown>))
    : (r as Remito).articulos;
  return { ...(r as Remito), articulos } as T;
}

/** Normaliza una lista de remitos. */
function normalizeRemitos(rs: Remito[]): Remito[] {
  return Array.isArray(rs) ? rs.map((r) => normalizeRemito(r)) : rs;
}

export interface ListRemitosParams {
  tipo?: string; // 'remito' | 'factura' (omitir = todos)
  proveedorId?: UUID;
  fechaDesde?: string; // yyyy-mm-dd
  fechaHasta?: string; // yyyy-mm-dd
}

// NOTA sobre GET /remitos: el controller actual del backend lee `sucursalId` desde
// @Body en una request GET, lo cual el fetch nativo del navegador no permite (no se
// puede enviar body en GET). Mandamos el filtro como query param a la espera de que
// el backend lo adopte, y además filtramos client-side por las dudas de que el
// backend ignore el parámetro y devuelva todos los remitos.
// Todos los filtros (tipo, proveedorId, fechaDesde, fechaHasta) viajan como query
// param; el filtrado visual definitivo lo hace applyFilters en cada pantalla.
export async function listRemitos(sucursalId?: UUID, params?: ListRemitosParams): Promise<Remito[]> {
  const qs = new URLSearchParams();
  if (sucursalId) qs.set('sucursalId', sucursalId);
  if (params?.tipo) qs.set('tipo', params.tipo);
  if (params?.proveedorId) qs.set('proveedorId', params.proveedorId);
  if (params?.fechaDesde) qs.set('fechaDesde', params.fechaDesde);
  if (params?.fechaHasta) qs.set('fechaHasta', params.fechaHasta);
  const query = qs.toString();
  const data = await api.get<Remito[]>(`/remitos${query ? `?${query}` : ''}`);
  const arr = normalizeRemitos(Array.isArray(data) ? data : []);
  if (!sucursalId) return arr;
  // Filtro tolerante: sólo descartamos filas con una sucursal EXPLÍCITAMENTE distinta.
  // Si el back no incluye sucursalId en la respuesta (o lo manda anidado en `sucursal`),
  // confiamos en que ya filtró por el query param y no las tiramos.
  return arr.filter((r) => {
    const sid = r.sucursalId ?? r.sucursal?.id;
    return !sid || sid === sucursalId;
  });
}

export interface HistorialPage {
  items: Remito[];
  total: number;
  limite: number;
  offset: number;
}

/**
 * Historial (estados terminales: aprobado / anulado). El back filtra por estado y
 * scopea por company_id; sucursalId es opcional.
 *
 * **Ahora viene paginado**: antes devolvía el historial completo con tres joins y el
 * front lo paginaba en memoria. La firma acepta `limite`/`offset` y devuelve el
 * total para poder mostrar la cantidad real.
 */
export async function listHistorial(
  sucursalId?: UUID,
  limite?: number,
  offset?: number,
): Promise<HistorialPage> {
  const qs = new URLSearchParams();
  if (sucursalId) qs.set('sucursalId', sucursalId);
  if (limite != null) qs.set('limite', String(limite));
  if (offset != null) qs.set('offset', String(offset));
  const query = qs.toString();

  const data = await api.get<HistorialPage>(`/remitos/history${query ? `?${query}` : ''}`);
  return data && Array.isArray(data.items)
    ? { ...data, items: normalizeRemitos(data.items) }
    : { items: [], total: 0, limite: limite ?? 0, offset: offset ?? 0 };
}

export const remitosApi = {
  list: listRemitos,
  history: listHistorial,
  // Último grupo de remitos PROCESADOS del usuario (para aprobar/rechazar al iniciar).
  own: () => api.get<Remito[]>('/remitos/own').then(normalizeRemitos),
  getByJobId: (jobId: string) => api.get<Remito[]>(`/remitos/by-job/${jobId}`).then(normalizeRemitos),
  get: (id: UUID) => api.get<Remito | null>(`/remitos/${id}`).then(normalizeRemito),
  approve: (id: UUID) => api.patch<Remito>(`/remitos/${id}/approve`),
  updateTotal: (id: UUID, total: number) => api.patch<Remito>(`/remitos/${id}/total`, { total }),
  /**
   * Edita la cabecera del remito.
   *
   * El back valida con una allowlist `.strict()`: cualquier campo fuera de estos
   * tres devuelve 400. El tipo lo refleja para que no se pueda mandar de más — antes
   * era `Partial<Remito>` y se mandaba el objeto completo, incluidos `id`, `estado`
   * y los montos, que el back aceptaba y escribía.
   */
  update: (id: UUID, data: UpdateRemitoInput) => api.patch<Remito>(`/remitos/${id}`, data),
  // Corrige los ítems y persiste los montos calculados por el front.
  // El back lee `precioUnitario`/`total` por ítem y los montos de cabecera del objeto.
  updateItems: (id: UUID, payload: UpdateItemsInput) => api.patch<Remito>(`/remitos/${id}/items`, payload),
  // Envía los UUID de los artículos marcados para que el back procese la carga a stock.
  submitMercaderia: (id: UUID, articulos: string[]) =>
    api.post<void>(`/remitos/submit-mercaderia/${id}`, { articulos }),
  /**
   * Reintenta la verificación de códigos contra el catálogo del sistema.
   *
   * Es la salida cuando esa etapa falla: sin ella el back rechaza la carga con 409
   * y el remito queda trabado. Reencola sólo esa etapa — NO reprocesa el PDF, que
   * costaría una llamada al modelo y recrearía los remitos perdiendo las
   * correcciones del operador.
   */
  reverificarCodigos: (id: UUID) =>
    api.post<{ jobId: string; encolado: boolean }>(`/remitos/reverificar-codigos/${id}`, {}),
  // Envía los UUID de los artículos marcados para que el back procese la carga de la factura.
  submitFactura: (id: UUID) => api.post<void>(`/facturas/submit/${id}`),
  // Descarta un remito procesado (no aprobado). El back decide marcar/eliminar.
  discard: (id: UUID) => api.patch<void>(`/remitos/${id}/discard`),
  remove: (id: UUID) => api.delete<void>(`/remitos/${id}`),
};
