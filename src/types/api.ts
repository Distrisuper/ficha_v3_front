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
  /**
   * ¿Existe en el catálogo del ERP, con equivalencia para este proveedor?
   *
   * Es una pregunta DISTINTA de `stockMatch`/`precioMatch`, que comparan cantidad
   * y precio contra la orden de compra. Esto dice si el artículo existe, y es
   * independiente de cualquier orden: puede existir y no estar en ninguna OC, o
   * estar en una OC y no tener equivalencia registrada para ese proveedor.
   *
   * Hoy es informativo — se muestra al operador y no condiciona la carga.
   *
   * `null` = todavía no se verificó (remitos anteriores a la migración, o la
   * consulta al ERP falló). No es lo mismo que `false`.
   */
  existeEnErp: boolean | null;
  /** Código interno del ERP, cuando existe. Es el que reconoce el operador. */
  codigoErp: string | null;
  precio_unitario: number;
  total_unitario: number;
  remitoId: UUID;
  createdAt: string;
  updatedAt: string;
}

/**
 * Una percepción del comprobante, tal como la extrajo la IA.
 *
 * `nombre` es la categoría canónica (`PERC. IIBB BSAS`, `PERC. IVA`, ...) y es lo
 * que el integrador traduce al código de percepción del ERP. `descripcion` es el
 * texto crudo del PDF, y es lo que el operador reconoce cuando compara con el
 * papel que tiene al lado — por eso el tooltip muestra los dos.
 */
export interface PercepcionDetalle {
  id: UUID;
  nombre: string;
  descripcion: string;
  monto: number;
  orden: number;
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
  /** TOTAL de percepciones. Es lo que se muestra; el desglose va en el tooltip. */
  percepciones: number;
  /**
   * Desglose por percepción.
   *
   * Opcional porque no todos los endpoints lo traen: sólo los que hacen el join
   * (`/remitos/own`, `/remitos/by-job/:id`, `/remitos` y el detalle). Ausente o
   * vacío = no hay desglose y el tooltip no se muestra; NO significa que no haya
   * percepciones, porque el total puede venir de un comprobante viejo.
   */
  percepcionesDetalle?: PercepcionDetalle[];
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
