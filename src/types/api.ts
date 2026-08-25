// Tipos que reflejan el contrato real de ficha_v3_api (ver src/*.entity.ts, dto/*, controllers).
// Cualquier campo marcado "backend stub" corresponde a un endpoint que hoy no persiste datos.

export type UUID = string;

// Claims del JWT. El nombre y la url de la empresa NO viajan acá a propósito:
// son mutables y el token vive días. Se piden por GET /users/me.
export interface AuthPayload {
  id: UUID;
  company_id: UUID;
  rol: string | null;
  nombre: string | null;
}

export interface LoginResponse {
  token: string;
}

export interface Empresa {
  id: UUID;
  nombre: string;
  url: string | null;
  active: boolean;
}

// GET /users/me
export interface MeResponse {
  user: User;
  empresa: Empresa;
}

export type RemitoTipo = 'remito' | 'factura';

export type RemitoEstado =
  | 'pendiente'
  | 'procesado'
  | 'cargado'
  | 'aprobado'
  | 'anulado'
  | 'error';

export interface Articulo {
  id: UUID;
  nombre: string;
  codigo: string;
  cantidad: number | string; // el backend persiste esta columna como char(36): puede llegar como string
  stockCargado: boolean; // true = ítem ya cargado a stock (define "items procesados" en el historial)
  /**
   * Resultado del cruce contra la orden de compra del proveedor (OrderProcessor).
   *
   * Tres estados, y el tercero importa:
   *   true  → coincide
   *   false → no coincide (o el artículo no figura en la orden)
   *   null  → todavía no se verificó
   *
   * Mientras las columnas sigan siendo `NOT NULL DEFAULT false`, `null` no llega
   * nunca y un artículo sin verificar se ve igual que uno que no coincidió. El
   * front ya distingue los tres casos, así que la migración es sólo de DB.
   */
  /**
   * La cantidad recibida coincide con el SALDO PENDIENTE de la línea de OC.
   *
   * Antes se comparaba contra la cantidad pedida original, así que una recepción
   * parcial nunca daba match: si la OC pedía 10 y ya se habían recibido 9, un
   * remito por la última unidad se marcaba en rojo. Ahora se compara contra lo
   * que falta recibir, que es la pregunta real.
   */
  stockMatch: boolean | null;
  precioMatch: boolean | null; // el precio unitario coincide con la orden de compra
  /**
   * Línea de OC contra la que se imputó este artículo. `null` = no se encontró
   * ninguna libre para su código.
   *
   * El modelo es 1 artículo → 1 línea de OC, garantizado por el índice único
   * `articulos.OC_unique` del back: una línea de OC la toma un artículo y nada
   * más que uno.
   *
   * Numéricos: como texto, un `"01907"` no matcheaba el `1907` que devuelve el
   * ERP y la imputación se perdía en silencio.
   */
  OCNumero: number | null;
  OCLinea: number | null;
  precio_unitario: number;
  total_unitario: number;
  remitoId: UUID;
  createdAt: string;
  updatedAt: string;
}

export interface Remito {
  id: UUID;
  proveedorId: UUID;
  sucursalId: UUID;
  proveedor?: Proveedor;
  sucursal?: Sucursal;
  tipo: RemitoTipo;
  remitoNro: string | null;
  facturaNro: string | null;
  fecha: string | null;
  facturaCargada: boolean;
  estado: RemitoEstado;
  subtotal: number;
  percepciones: number;
  descuentos: number;
  iva: number;
  total: number;
  companyId: UUID;
  jobId: string | null;
  approvedAt: string | null; // se llena recién al aprobar (submitMercaderia); null antes
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  articulos?: Articulo[];
}

export interface Proveedor {
  id: UUID;
  /** Alias operativo. Es lo único editable después del alta. */
  nombre: string;
  /** Denominación legal. null en los proveedores cargados antes del campo. */
  razonSocial: string | null;
  /** 11 dígitos sin guiones. El formato xx-xxxxxxxx-x es sólo presentación (ver utils/cuit.ts). */
  cuit: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body de POST /proveedores. Los tres campos son obligatorios en el alta. */
export interface CreateProveedorInput {
  nombre: string;
  razonSocial: string;
  /** Se manda en dígitos, sin la máscara. */
  cuit: string;
  codigoERP: string; // opcional, null en los proveedores cargados antes del campo
}

export interface Sucursal {
  id: UUID;
  nombre: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFacturaResponse {
  jobId: string;
  facturaId: UUID;
}

// JobEventDto / JobEventType se eliminaron: eran el contrato del stream por job.
// El progreso ahora llega como DomainEvent por el stream global (types/events.ts).

export interface User {
  id: UUID;
  email: string;
  nombre: string;
  rol: string | null;
  companyId: UUID;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  inactiveAt: string | null;
}
