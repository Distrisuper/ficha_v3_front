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

export type JobEventType = 'waiting' | 'active' | 'progress' | 'completed' | 'failed';

export interface JobEventDto {
  jobId: string;
  type: JobEventType;
  data?: unknown;
}

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
