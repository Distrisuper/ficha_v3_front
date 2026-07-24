// Tipos que reflejan el contrato real de ficha_v3_api (ver src/*.entity.ts, dto/*, controllers).
// Cualquier campo marcado "backend stub" corresponde a un endpoint que hoy no persiste datos.

export type UUID = string;

export interface AuthPayload {
  id: UUID;
  company_id: string;
  rol: string | null;
  nombre: string | null;
  nombreEmpresa: string | null;
}

export interface LoginResponse {
  token: string;
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
  companyId: number;
  jobId: string | null;
  approvedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  articulos?: Articulo[];
}

export interface Proveedor {
  id: UUID;
  nombre: string;
  createdAt: string;
  updatedAt: string;
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
  rol: string | null;
  company_id: string;
  user_id: string | null;
  url: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  inactiveAt: string | null;
}
