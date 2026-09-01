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
   * El código no existe en el catálogo del sistema para este proveedor, así que el
   * integrador NO lo puede cargar y lo tiene que cargar el operador a mano.
   *
   * Junto con `stockCargado` son tres estados:
   *   stockCargado          → lo cargó el integrador
   *   cargaManual           → lo carga la persona, por afuera
   *   ninguno de los dos    → todavía pendiente
   *
   * Se escribe al aprobar la carga, derivado de `existeEnErp === false`.
   */
  cargaManual: boolean;
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
   * ── STRING, no number ───────────────────────────────────────────────────────
   * Estaba tipado `number | null` y era falso: la columna es `varchar` y el
   * processor le asigna `item.numerocomprobante`, que el schema declara
   * `z.string()`. El comentario que justificaba el `number` ("como texto, un
   * '01907' no matcheaba el 1907") describía un problema del CRUCE, que se
   * resuelve del lado del back al normalizar el código — no un cambio de tipo en
   * el transporte.
   *
   * Sólo se renderizaba, así que nunca explotó. Habría explotado en el primer
   * `OCNumero - 1` o `.toFixed()`, con un tipo que decía que era seguro.
   */
  OCNumero: string | null;
  OCLinea: string | null;
  /**
   * Valores de la línea de OC AL MOMENTO DE COMPARAR: saldo pendiente y precio
   * unitario.
   *
   * Es la evidencia del veredicto. Un `stockMatch: false` sin esto es una
   * afirmación sin respaldo: el operador ve el rojo y no sabe si el remito trae
   * 2 de más o 200. Con esto el tooltip dice "OC: 10 un. — remito: 12 un.".
   *
   * NO se re-consultan a la orden: la orden se sigue moviendo (otras recepciones
   * bajan el saldo, compras renegocia el precio), así que el valor de hoy no
   * explica el flag de ayer.
   *
   * `null` = no se comparó contra ninguna línea. Distinto de `0`, que es un saldo
   * pendiente legítimo de una línea ya cubierta.
   */
  ocCantidad: number | null;
  ocPrecioUnitario: number | null;
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
  /**
   * Líneas de orden de compra que tenía el proveedor cuando se verificó el remito.
   *
   *   `null`      → todavía no se verificó
   *   `0`         → el proveedor NO tiene ninguna OC pendiente
   *   `> 0`       → hay OC contra las que comparar
   *   `undefined` → remito anterior a este campo
   *
   * Con `0` NO se muestran advertencias de OC: comprar sin orden de compra es
   * normal, y avisarlo en cada renglón hace que el operador deje de mirar el
   * amarillo. Ver `advertenciasOrdenCompra`.
   */
  ocLineasProveedor?: number | null;
  /**
   * Órdenes de compra contra las que se contrastó este remito. Para auditoría.
   *
   * `null`/`undefined` → nunca se verificó
   * `[]`               → se verificó y el proveedor no tenía ninguna orden con
   *                      líneas comparables (mismo hecho que `ocLineasProveedor: 0`)
   *
   * No es lo mismo que juntar los `OCNumero` de los artículos: ahí sólo están las
   * órdenes que terminaron imputadas, y lo que hay que poder explicar es por qué
   * un artículo NO se imputó — "se miraron 1907 y 1912 y su código no estaba".
   */
  ocNumeros?: string[] | null;
  /** Cuándo se contrastó. La orden cambia con el tiempo: la fecha es parte del dato. */
  ocVerificadaEn?: string | null;
  /**
   * Estado de la etapa 2 (orden de compra) del job de este remito.
   *
   * `'corriendo' | 'ok' | 'error' | null`. Viene del job, PERSISTIDO.
   *
   * Es lo que hace que el cartel "Orden de compra no disponible" aparezca sin
   * recargar la página: antes ese dato sólo vivía en el tracker en memoria del
   * stream SSE, que no sobrevive a un refresh y encima lo apagaba el `completado`
   * de la etapa 3 (compartían `stage`).
   */
  estadoOc?: 'corriendo' | 'ok' | 'error' | null;
  /** Estado de la etapa 3 (verificación de códigos). Mismos valores. */
  estadoCodigos?: 'corriendo' | 'ok' | 'error' | null;
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
  /** Plazo de pago en días. `null` = no cargado; el integrador usa 30 avisando. */
  diasVencimiento: number | null;
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
  /**
   * Plazo de pago en DÍAS, para calcular el vencimiento de la factura.
   *
   * OPCIONAL y se OMITE si está vacío: el back distingue `null` ("no se cargó",
   * cae al default de 30 avisando en el log) de `0` ("vence el mismo día").
   * Mandar 0 por "no sé" metería un vencimiento falso en la contabilidad.
   */
  diasVencimiento?: number;
}

export interface Sucursal {
  id: UUID;
  nombre: string;
  /**
   * Código del depósito en el ERP (`CODIGODEPOSITO` de Flexxus: '001', '003', …).
   *
   * Es el dato con el que el integrador escribe el comprobante y con el que se
   * filtran las órdenes de compra pendientes. Antes salía de una tabla
   * hardcodeada en el conector, así que agregar un depósito era un deploy.
   *
   * `null` en las sucursales creadas antes de que el campo fuera obligatorio.
   * Esas NO pueden participar del flujo de carga: hay que completarlas.
   */
  codigoERP: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body de POST /sucursales. Los dos campos son obligatorios en el alta. */
export interface CreateSucursalInput {
  nombre: string;
  /** Código del depósito en el ERP. Obligatorio: sin él la sucursal no ficha. */
  codigoERP: string;
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
