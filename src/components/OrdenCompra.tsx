import type { ReactNode } from 'react';
import type { EstadoOrdenCompra } from '../hooks/useOrdenCompra';
import { Tooltip } from './Tooltip';
import { money, fmtCantidad } from '../utils/money';
import { round3, toNumero } from '../utils/numero';

/**
 * Indicadores del cruce contra la orden de compra del proveedor.
 *
 * El spinner es SVG con `<animateTransform>` y no una animación CSS a propósito:
 * el proyecto no tiene ni una `@keyframes` y los estilos son todos inline, así
 * que agregar una regla global sólo para esto rompería la convención.
 */

// --- Spinner -----------------------------------------------------------------

export function Spinner({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: 'none' }} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

// --- Badge del encabezado ----------------------------------------------------

/** Va a la derecha del ESTADO en el encabezado de la card. */
export function BadgeOrdenCompra({ estado }: { estado: EstadoOrdenCompra }) {
  const esFallo = estado === 'fallida';

  return (
    <div
      title={
        esFallo
          ? 'No se pudo consultar la orden de compra del proveedor. Los indicadores de cada artículo pueden estar desactualizados.'
          : 'Se está consultando la orden de compra del proveedor para verificar cantidades y precios.'
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 30,
        padding: '0 12px',
        borderRadius: 99,
        border: `1px solid ${esFallo ? '#f0c6c6' : '#f3dca6'}`,
        background: esFallo ? 'var(--err-weak)' : '#fdf8ec',
        color: esFallo ? 'var(--err)' : 'var(--warn)',
        fontSize: 12.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: 'default',
      }}
    >
      {esFallo ? <IconoAlerta /> : <Spinner />}
      {esFallo ? 'Orden de compra no disponible' : 'Procesando orden de compra'}
    </div>
  );
}

// --- Aviso de artículos que no figuran en el sistema --------------------------

/**
 * Va en el encabezado de la card, al lado del badge de orden de compra.
 *
 * Separado de los semáforos de OC a propósito: son dos preguntas distintas. Los
 * semáforos comparan contra la orden de compra; esto dice si el artículo existe
 * en el catálogo del sistema, que es independiente de cualquier orden.
 *
 * Es INFORMATIVO: reporta el hecho y nada más. Qué pasa después con la carga no
 * se decide acá.
 */
export function BadgeSinErp({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <div
      title={
        `${cantidad} artículo(s) de este remito tienen un código que no existe en el sistema ` +
        'para este proveedor. NO se van a cargar automáticamente: hay que cargarlos a mano.'
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 30,
        padding: '0 12px',
        borderRadius: 99,
        // ÁMBAR y no rojo, igual que la fila y el ícono por artículo.
        //
        // Era rojo cuando esto era el único indicador del problema. Ahora la lista
        // marca lo mismo en tres lugares (badge, resumen, fila) y tenerlos en
        // colores distintos hacía parecer que eran problemas distintos. El rojo
        // quedó reservado para el popup de confirmación, que es donde se enuncia la
        // consecuencia: "esto NO se va a cargar".
        border: '1px solid #f3dca6',
        background: '#fdf8ec',
        color: 'var(--warn)',
        fontSize: 12.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: 'default',
      }}
    >
      <IconoAlerta />
      {cantidad === 1
        ? '1 artículo sin código en el sistema'
        : `${cantidad} artículos sin código en el sistema`}
    </div>
  );
}

/**
 * Marca por fila. `null` (sin verificar) no muestra nada: avisar sobre algo que no
 * se verificó entrena al operador a ignorar el aviso.
 */
export function MarcaSinErp({ existeEnErp }: { existeEnErp: boolean | null | undefined }) {
  if (existeEnErp !== false) return null;
  return (
    <Tooltip
      texto={
        'Este código no figura en el catálogo del sistema. Verificarlo con el proveedor o darlo ' +
        'de alta si corresponde.'
      }
      ancho={240}
      wrapperStyle={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        flex: 'none',
        borderRadius: 6,
        border: '1px solid #f0c6c6',
        background: 'var(--err-weak)',
        color: 'var(--err)',
        cursor: 'help',
      }}
      fondo="#d4412d"
    >
      <IconoAlerta />
    </Tooltip>
  );
}

function IconoAlerta() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" style={{ flex: 'none' }} aria-hidden>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}


// --- Celda de veredicto para las columnas de match --------------------------

/** Ancho de cada columna de veredicto. Fijo para que alineen entre filas. */
export const ANCHO_COL_VEREDICTO = 46;

/**
 * Una celda de las tres columnas de verificación (ART. / $ / STOCK).
 *
 * ── Por qué columnas y no iconos sueltos ────────────────────────────────────
 * Antes eran dos iconos ($ y caja) apretados a la derecha de la fila, más un
 * tercer indicador —el del código— del otro lado del renglón. Tres veredictos en
 * dos lugares y con tres formas distintas: para saber si un artículo estaba bien
 * había que leer la fila entera. Con una columna por pregunta y un ancho fijo, el
 * ojo baja por la columna y encuentra las cruces sin leer nada.
 *
 * ── Los cinco estados ───────────────────────────────────────────────────────
 *   cargando  → spinner. La verificación está en vuelo; todavía no hay veredicto.
 *   ok        → tilde VERDE. Hay orden y el valor da.
 *   ok-aviso  → tilde AMARILLO. Hay orden, el valor no da. Ver `EstadoMatch`.
 *   mal       → cruz roja. NO hay orden contra la que comparar.
 *   sin-dato  → raya gris. NO es un veredicto: nadie lo verificó todavía.
 *
 * ── Por qué un tilde amarillo y no una cruz ─────────────────────────────────
 * El tilde responde "¿hay orden de compra detrás de este renglón?" y el color,
 * "¿los valores dan?". Son dos preguntas y antes compartían un solo canal: un
 * precio distinto y un artículo sin ninguna orden se veían igual (cruz roja), y
 * son problemas de dueños distintos — uno lo arregla compras, el otro es
 * mercadería que entra sin respaldo.
 *
 * La raya y la cruz también tienen que verse distinto por lo mismo: la cruz es un
 * veredicto, la raya es la ausencia de uno.
 */
export type EstadoVeredicto = 'cargando' | 'ok' | 'ok-aviso' | 'mal' | 'sin-dato';

export function CeldaVeredicto({
  estado,
  texto,
}: {
  estado: EstadoVeredicto;
  texto: string;
}) {
  const contenido =
    estado === 'cargando' ? (
      <span style={{ color: 'var(--muted-2)', display: 'inline-flex' }}>
        <Spinner size={12} />
      </span>
    ) : estado === 'ok' ? (
      <IconoTilde color="var(--ok)" />
    ) : estado === 'ok-aviso' ? (
      // MISMO tilde, otro color: la forma afirma que hay orden de compra detrás
      // del renglón —que es cierto— y el color dice que el valor no cerró.
      // Dibujar otro símbolo rompería esa lectura.
      <IconoTilde color="var(--warn)" />
    ) : estado === 'mal' ? (
      <IconoCruz />
    ) : (
      // Raya y no un icono: cualquier símbolo compite con el tilde y la cruz, y
      // esto justamente no es un veredicto.
      <span style={{ color: 'var(--muted-3)', fontWeight: 700, fontSize: 13 }}>—</span>
    );

  return (
    <Tooltip
      texto={texto}
      ancho={250}
      wrapperStyle={{
        width: ANCHO_COL_VEREDICTO,
        flex: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'help',
      }}
      fondo={
        estado === 'mal'
          ? '#d4412d'
          : estado === 'ok'
            ? '#25a54f'
            : estado === 'ok-aviso'
              ? '#c99c3d'
              : '#4a5568'
      }
    >
      {contenido}
    </Tooltip>
  );
}

function IconoTilde({ color }: { color: string }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconoCruz() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--err)" strokeWidth={3} strokeLinecap="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Encabezado de las tres columnas. Se usa en la fila de títulos de la lista para
 * que las etiquetas caigan exactamente sobre las celdas.
 */
export function EncabezadoVeredictos() {
  const cel = {
    width: ANCHO_COL_VEREDICTO,
    flex: 'none' as const,
    textAlign: 'center' as const,
  };
  return (
    <>
      <span style={cel} title="¿El código existe en el catálogo del sistema?">ART.</span>
      <span style={cel} title="¿Hay orden de compra imputada? Verde: el precio coincide exacto. Amarillo: difiere.">$</span>
      <span style={cel} title="¿Hay orden de compra imputada? Verde: la cantidad entra en el saldo pendiente. Amarillo: se pasa.">STOCK</span>
    </>
  );
}

// --- Iconos por artículo -----------------------------------------------------


export type EstadoMatch =
  | 'procesando'
  | 'match'
  | 'aviso'
  | 'sin-match'
  | 'sin-verificar'
  | 'sin-oc';

/**
 * Semáforo de las columnas $ y STOCK.
 *
 * ── La FORMA dice si hay orden; el COLOR, si los valores dan ────────────────
 * Son dos preguntas distintas y antes se mezclaban en una sola escala de color.
 * Ahora cada una tiene su canal:
 *
 *   FORMA  tilde → el artículo quedó imputado a una línea de orden de compra.
 *          cruz  → no quedó imputado a ninguna, o el proveedor no tiene ninguna
 *                  orden pendiente. La mercadería entra sin respaldo de una orden.
 *
 *   COLOR  verde    → el valor da (precio exacto, o cantidad dentro del saldo).
 *          amarillo → el valor NO da, pero la orden existe y está imputada.
 *
 * Por qué separarlas: "no hay orden" y "hay orden y el precio difiere" piden
 * acciones distintas y antes se veían iguales (los dos rojos). Con la forma fija,
 * el operador barre la columna buscando cruces —lo único que entra sin respaldo—
 * y usa el color para priorizar entre los que sí tienen orden.
 *
 *   amarillo también → todavía no hay veredicto (`procesando`, `sin-verificar`)
 *
 * Comparten el amarillo con `aviso` y no se confunden porque la forma los separa:
 * un spinner y una raya no son un tilde. Y lo que el amarillo comunica es lo mismo
 * en los tres casos: "esto no está confirmado".
 */
const PALETA: Record<EstadoMatch, { color: string; fondo: string; fondoTooltip: string; borde: string }> = {
  procesando: { color: 'var(--warn)', fondo: '#fdf8ec', fondoTooltip: '#c99c3d', borde: '#f3dca6' },
  'sin-verificar': { color: 'var(--warn)', fondo: '#fdf8ec', fondoTooltip: '#c99c3d', borde: '#f3dca6' },
  match: { color: 'var(--ok)', fondo: '#eefaf2', fondoTooltip: '#25a54f', borde: '#bfe6ce' },
  aviso: { color: 'var(--warn)', fondo: '#fdf8ec', fondoTooltip: '#c99c3d', borde: '#f3dca6' },
  'sin-match': { color: 'var(--err)', fondo: 'var(--err-weak)', fondoTooltip: '#d4412d', borde: '#f0c6c6' },
  'sin-oc': { color: 'var(--err)', fondo: 'var(--err-weak)', fondoTooltip: '#d4412d', borde: '#f0c6c6' },
};

/**
 * Textos base. La cantidad se compara contra el SALDO PENDIENTE de la línea de OC
 * (lo que falta recibir), no contra la cantidad pedida original: con una recepción
 * parcial, comparar contra lo pedido nunca daba match y el operador veía rojos que
 * no significaban nada.
 */
const TOOLTIPS: Record<'precio' | 'stock', Record<EstadoMatch, string>> = {
  precio: {
    procesando: 'Precio: verificando contra la orden de compra…',
    match: 'Precio: coincide EXACTO con el de la orden de compra.',
    // Amarillo y no rojo: la orden existe y el artículo está imputado, así que el
    // dato es revisable contra algo concreto. No se dice para qué lado cae la
    // diferencia porque los dos números van abajo y se ven solos.
    aviso: 'Precio: DISTINTO al de la orden de compra.',
    // Ya NO dice "no coincide". Con la forma separada del color, la cruz
    // significa una sola cosa: no hay línea de orden contra la que comparar.
    'sin-match':
      'Precio: NO se pudo comparar. El artículo no quedó imputado a ninguna orden de compra.',
    'sin-verificar': 'Precio: pendiente de verificar. Se controla al cargar la factura.',
    'sin-oc': 'NO HAY orden de compra pendiente de este proveedor. No hay precio contra el que comparar: la mercadería entra sin respaldo de una orden.',
  },
  stock: {
    procesando: 'Cantidad: verificando contra la orden de compra…',
    // Cubre el IGUAL y el MENOR, que es el criterio: lo que entra no puede
    // pasarse de lo que la orden todavía espera. Una entrega parcial es correcta
    // y el saldo restante sigue vivo en la orden.
    match: 'Cantidad: entra en el saldo pendiente de la orden de compra.',
    aviso:
      'Cantidad: MAYOR al saldo pendiente de la orden de compra. Llegó más de lo que la orden esperaba.',
    'sin-match':
      'Cantidad: NO se pudo comparar. El artículo no quedó imputado a ninguna orden de compra.',
    'sin-verificar': 'Cantidad: pendiente de verificar. Se controla al cargar la factura.',
    'sin-oc': 'NO HAY orden de compra pendiente de este proveedor. No hay cantidad contra la que comparar: la mercadería entra sin respaldo de una orden.',
  },
};

/**
 * Datos de la línea de OC contra la que se comparó el artículo, tal como estaban
 * al momento de comparar.
 */
export interface LineaOcComparada {
  numero: string | null;
  linea: string | null;
  /** Saldo pendiente de la línea. `null` = no se comparó contra ninguna. */
  cantidad: number | null;
  precioUnitario: number | null;
  /** Cuándo se contrastó (ISO). La orden cambia con el tiempo. */
  verificadaEn: string | null;
  /** Órdenes que se MIRARON, imputadas o no. Explica un "no se imputó". */
  numerosContrastados: string[] | null;
}

/** Valores del renglón del remito, para poder ponerlos al lado de los de la OC. */
export interface ValoresRemito {
  cantidad: number | string;
  precioUnitario: number;
}

/**
 * Fecha corta para el pie del tooltip. Sin hora: el operador no la necesita y
 * ocupa media línea.
 *
 * `slice` sobre el ISO y no `new Date(...)`: construir un Date con un ISO en UTC
 * y leerlo en local corre la fecha un día para atrás en Argentina. Es el mismo
 * off-by-one que ya se arregló en `fmtDate`, y el motivo por el que esa función
 * dejó de aceptar `Date`.
 */
function fechaCortaIso(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : null;
}

/**
 * Diferencia por debajo de la cual dos cantidades se consideran la misma.
 *
 * `round3` y no `round2`: hay unidades que se facturan con tres decimales (kg,
 * litros), y redondear a dos convertía un saldo de 0,125 en 0,13.
 */
const TOLERANCIA_CANTIDAD = 0.001;

/**
 * ¿La cantidad del remito ENTRA en el saldo pendiente de la orden de compra?
 *
 * Menor o IGUAL. Es el criterio del color de la columna STOCK: lo que entra no
 * puede pasarse de lo que la orden todavía espera.
 *
 * ── Por qué no alcanza el flag del back ─────────────────────────────────────
 * `stockMatch` compara por igualdad exacta, así que la entrega parcial —el caso
 * NORMAL, no la excepción— llega como `false`, igual que un exceso de mercadería.
 * Los dos hechos piden cosas distintas:
 *
 *   remito ≤ saldo OC  → entrega completa o parcial. Correcto: el resto sigue
 *                        pendiente en la orden. VERDE.
 *   remito > saldo OC  → llegó más de lo que la orden esperaba. AMARILLO.
 *
 * Se decide en el front a propósito: el flag del back es el hecho crudo
 * ("coincide o no") y se sigue persistiendo igual; esto es cómo se LEE ese hecho.
 *
 * `stockMatch === true` corta antes de mirar los números: si el back ya dijo que
 * coincide, el saldo persistido puede faltar y el veredicto no cambia.
 *
 * Sin `ocCantidad` devuelve `false`: no se puede afirmar que entra en un saldo
 * que no se conoce, y el amarillo es justamente "no confirmado".
 */
export function cantidadDentroDelSaldoOc(it: {
  stockMatch?: boolean | null;
  ocCantidad?: number | null;
  cantidad?: number | string | null;
}): boolean {
  if (it.stockMatch === true) return true;
  if (it.ocCantidad == null) return false;
  const oc = round3(toNumero(it.ocCantidad));
  const remito = round3(toNumero(it.cantidad));
  if (oc <= 0 || remito <= 0) return false;
  return remito - oc <= TOLERANCIA_CANTIDAD;
}

/** Lo que las dos columnas de OC necesitan saber de un artículo. */
export interface ArticuloOc {
  precioMatch?: boolean | null;
  stockMatch?: boolean | null;
  OCNumero?: string | null;
  OCLinea?: string | null;
  ocCantidad?: number | null;
  ocPrecioUnitario?: number | null;
  cantidad: number | string;
  precio_unitario: number;
}

/** Lo que necesitan saber del remito. */
export interface RemitoOc {
  ocLineasProveedor?: number | null;
  ocNumeros?: string[] | null;
  ocVerificadaEn?: string | null;
}

/**
 * ÚNICO lugar que decide el estado de las columnas $ y STOCK.
 *
 * El orden de las preguntas es el que hace que el semáforo no mienta:
 *
 *   1. ¿Se está verificando ahora? → spinner. Un veredicto de la corrida
 *      anterior mostrado como si fuera de esta es peor que no mostrar nada.
 *   2. ¿El proveedor tiene alguna orden pendiente? Si no, CRUZ: la consulta se
 *      hizo y la respuesta es que no hay nada contra lo que comparar.
 *   3. ¿Hay veredicto? Si el flag es `null` nadie comparó: raya, no cruz. Avisar
 *      de un problema que nadie comprobó entrena a ignorar el aviso.
 *   4. ¿Quedó imputado a una línea? Si no, CRUZ: hay órdenes pero este artículo
 *      no entró en ninguna.
 *   5. Recién acá el COLOR: el valor da (verde) o no da (amarillo).
 *
 * El paso 3 va ANTES del 4 a propósito: `OCNumero == null` en un artículo sin
 * verificar no significa "no se imputó", significa que todavía no se intentó.
 */
export function estadoMatchOc(
  campo: 'precio' | 'stock',
  it: ArticuloOc,
  r: RemitoOc,
  validando: boolean,
): EstadoMatch {
  if (validando) return 'procesando';
  if (r.ocLineasProveedor === 0) return 'sin-oc';

  const flag = campo === 'precio' ? it.precioMatch : it.stockMatch;
  if (flag == null) return 'sin-verificar';
  if (it.OCNumero == null) return 'sin-match';

  const da = campo === 'precio' ? it.precioMatch === true : cantidadDentroDelSaldoOc(it);
  return da ? 'match' : 'aviso';
}

/** Traduce el estado del semáforo a lo que dibuja `CeldaVeredicto`. */
export function veredictoOc(
  campo: 'precio' | 'stock',
  it: ArticuloOc,
  r: RemitoOc,
  validando: boolean,
): EstadoVeredicto {
  switch (estadoMatchOc(campo, it, r, validando)) {
    case 'procesando':
      return 'cargando';
    case 'match':
      return 'ok';
    case 'aviso':
      return 'ok-aviso';
    case 'sin-match':
    case 'sin-oc':
      return 'mal';
    default:
      return 'sin-dato';
  }
}

/**
 * Los números de OC que figuran en los artículos detectados, sin repetir y en el
 * orden en que aparecen.
 *
 * ── Por qué no `remito.ocNumeros` ───────────────────────────────────────────
 * Ese campo son las órdenes que se MIRARON para armar el cruce, que es la
 * pregunta de trazabilidad del proceso. Arriba de la card se responde otra: contra
 * qué órdenes quedó imputado ESTE remito. Mostrar las miradas listaba órdenes con
 * las que ningún renglón terminó relacionado, y el operador las buscaba en el ERP
 * para no encontrar nada.
 */
export function ocsPresentesEnArticulos(items: { OCNumero?: string | null }[]): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const n = it.OCNumero;
    if (n == null || vistas.has(n)) continue;
    vistas.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Arma el tooltip completo: veredicto + EVIDENCIA.
 *
 * ── Por qué la evidencia y no sólo el veredicto ─────────────────────────────
 * "El precio NO coincide con la orden de compra" no le sirve al operador: no le
 * dice si la diferencia son dos centavos de redondeo o si le facturaron el doble,
 * y para averiguarlo tiene que abrir el ERP y buscar la orden a mano. Con los dos
 * números al lado, la decisión —aceptar o llamar al proveedor— se toma acá.
 *
 * Y es lo que hace auditable un veredicto viejo. Los valores vienen PERSISTIDOS
 * del momento de la comparación, no de una consulta nueva: la orden se sigue
 * moviendo, así que re-consultarla mostraría un número que no es el que produjo
 * el flag que se está mirando.
 */
/**
 * Texto del tooltip de las columnas $ y STOCK.
 *
 * Reusa `conEvidencia`, que es donde vive el par de valores contrastados
 * (`OC: $1.234,56 · Remito: $1.300,00`) y la referencia a la línea imputada. La
 * presentación cambió a columnas; la información que hace auditable el veredicto
 * es la misma y no se duplica.
 */
export function textoVeredictoOc(
  campo: 'precio' | 'stock',
  it: ArticuloOc,
  r: RemitoOc,
  validando: boolean,
): string {
  const estado = estadoMatchOc(campo, it, r, validando);
  return conEvidencia(
    TOOLTIPS[campo][estado],
    estado,
    campo,
    {
      numero: it.OCNumero ?? null,
      linea: it.OCLinea ?? null,
      cantidad: it.ocCantidad ?? null,
      precioUnitario: it.ocPrecioUnitario ?? null,
      verificadaEn: r.ocVerificadaEn ?? null,
      numerosContrastados: r.ocNumeros ?? null,
    },
    { cantidad: it.cantidad, precioUnitario: it.precio_unitario },
    // El par de valores en un VERDE de cantidad: una entrega parcial es correcta
    // y aun así los dos números difieren, y cuánto quedó pendiente es el dato que
    // el operador necesita. En el verde de precio los números son idénticos por
    // definición, así que repetirlos sería ruido.
    estado === 'match' && campo === 'stock' && it.stockMatch !== true,
  );
}

function conEvidencia(
  texto: string,
  estado: EstadoMatch,
  campo: 'precio' | 'stock',
  oc: LineaOcComparada,
  remito: ValoresRemito,
  /**
   * Fuerza el par de valores aunque el veredicto sea verde. Lo pide el llamador
   * para el verde de cantidad (entrega parcial): ahí los dos números NO son el
   * mismo, así que mostrarlos no es la repetición que la regla de abajo evita —
   * es la única forma de ver cuánto quedó pendiente sin abrir el ERP.
   */
  mostrarValores = false,
): string {
  // Sin veredicto no hay nada que evidenciar.
  if (estado === 'procesando' || estado === 'sin-verificar') return texto;
  // `sin-oc` es el único veredicto sin línea ni valores: la respuesta ES que no
  // hay órdenes, y el texto base ya lo dice completo.
  if (estado === 'sin-oc') return texto;

  const partes = [texto];

  if (oc.numero == null) {
    /**
     * No se imputó a ninguna línea. Acá el dato ÚTIL no es el valor de la OC —no
     * hay— sino QUÉ órdenes se revisaron: es la diferencia entre "el proveedor no
     * tenía órdenes" y "tenía dos y no quedó imputado en ninguna".
     *
     * ── Por qué NO dice "este código no figura en ninguna" ──────────────────
     * Porque `OCNumero = null` tiene DOS causas y el front no puede distinguirlas
     * con los datos que recibe:
     *
     *   1. el código no está en ninguna línea de esas órdenes;
     *   2. sí está, pero la línea ya la tomó otro artículo — el índice
     *      `articulos.OC_unique` del back es 1 línea → 1 artículo, así que dos
     *      remitos del mismo código compiten por la misma línea y el segundo se
     *      queda sin ninguna.
     *
     * Afirmar (1) cuando pasó (2) es dar por falso un dato verdadero, y en una
     * auditoría eso es peor que ser impreciso: manda a dar de alta un código que
     * ya existe. El texto enuncia las dos posibilidades hasta que el back
     * persista cuál fue.
     */
    const miradas = oc.numerosContrastados?.length
      ? `No quedó imputado a ninguna línea de la OC ${oc.numerosContrastados.join(', ')}: ` +
        'o el código no figura ahí, o la línea ya la tomó otro remito.'
      : 'No se imputó a ninguna línea de orden de compra.';
    partes.push(miradas);
  } else {
    const linea = oc.linea != null ? ` línea ${oc.linea}` : '';
    partes.push(`Imputado a la OC ${oc.numero}${linea}.`);

    // El par de valores, sólo cuando los dos números difieren: si coinciden,
    // repetir dos veces el mismo número es ruido.
    if (estado === 'aviso' || mostrarValores) {
      if (campo === 'precio' && oc.precioUnitario != null) {
        partes.push(
          `OC: ${money(oc.precioUnitario)} · Remito: ${money(remito.precioUnitario)}`,
        );
      }
      if (campo === 'stock' && oc.cantidad != null) {
        // "pendiente" y no "cantidad": lo que se compara es el SALDO de la línea
        // (lo que falta recibir), no lo que se pidió originalmente. Sin la
        // palabra, un operador que mira la OC en el ERP ve otro número y cree que
        // el sistema se equivocó.
        partes.push(
          `OC (pendiente): ${fmtCantidad(oc.cantidad)} · Remito: ${fmtCantidad(remito.cantidad)}`,
        );
      }
    }
  }

  const fecha = fechaCortaIso(oc.verificadaEn);
  if (fecha) partes.push(`Verificado el ${fecha}.`);

  return partes.join('\n');
}

const ANCHO_TOOLTIP = 220;

/**
 * Icono del semáforo con su tooltip. La burbuja `fixed` la resuelve `Tooltip`
 * (compartido con las advertencias por campo); acá sólo se le da la caja de color
 * según la paleta del estado.
 */
function IconoConTooltip({
  estado,
  texto,
  children,
}: {
  estado: EstadoMatch;
  texto: string;
  children: ReactNode;
}) {
  const paleta = PALETA[estado];
  return (
    <Tooltip
      texto={texto}
      ancho={ANCHO_TOOLTIP}
      wrapperStyle={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        flex: 'none',
        borderRadius: 6,
        border: `1px solid ${paleta.borde}`,
        background: paleta.fondo,
        color: paleta.color,
        cursor: 'help',
      }}
      fondo={paleta.fondoTooltip}
    >
      {children}
    </Tooltip>
  );
}

function IconoPrecio() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v20" />
      <path d="M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2.2 3 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3" />
    </svg>
  );
}

function IconoStock() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 8v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8" />
      <path d="M2 4.5h20V8H2z" />
      <path d="M10 12h4" />
    </svg>
  );
}

/**
 * Par de indicadores ($ y caja) de un artículo.
 *
 * `estado` unifica los dos casos porque mientras se consulta la orden de compra
 * ninguno de los dos flags es confiable todavía.
 */
export function IconosMatch({
  estado,
  precioMatch,
  stockMatch,
  ocNumero = null,
  ocLinea = null,
  ocCantidad = null,
  ocPrecioUnitario = null,
  ocLineasProveedor,
  ocNumeros = null,
  ocVerificadaEn = null,
  cantidad,
  precioUnitario,
}: {
  estado: 'procesando' | 'resuelto';
  precioMatch: boolean | null | undefined;
  stockMatch: boolean | null | undefined;
  /** Línea de OC imputada. Va en el tooltip para poder auditar el veredicto. */
  ocNumero?: string | null;
  ocLinea?: string | null;
  /**
   * Valores de esa línea AL COMPARAR. Son la evidencia del flag: sin ellos, un
   * rojo dice que algo no coincide pero no en cuánto, y averiguarlo obliga a
   * abrir el ERP.
   */
  ocCantidad?: number | null;
  ocPrecioUnitario?: number | null;
  /**
   * Líneas de OC que tenía el proveedor al verificar. `0` = no tiene ninguna.
   *
   * Es lo que permite distinguir "no coincide" de "no había con qué comparar".
   * Sin este dato los dos casos llegaban como `stockMatch: null` y se pintaban
   * amarillos, o sea que un remito sin orden de compra parecía estar esperando
   * una verificación que ya había terminado.
   */
  ocLineasProveedor?: number | null;
  /**
   * Órdenes que se MIRARON. Es lo único informativo cuando el artículo no se
   * imputó a ninguna línea: distingue "el proveedor no tenía órdenes" de "tenía
   * dos y este código no estaba en ninguna", que son problemas distintos con
   * responsables distintos.
   */
  ocNumeros?: string[] | null;
  ocVerificadaEn?: string | null;
  /** Valores del renglón del remito, para mostrarlos al lado de los de la OC. */
  cantidad: number | string;
  precioUnitario: number;
}) {
  // Los props se reagrupan en la forma que espera `estadoMatchOc`, que es el único
  // lugar donde vive el criterio del semáforo. Antes esto tenía su propia cadena
  // de ternarios y podía divergir de la de las celdas sin que nada avisara.
  const articulo: ArticuloOc = {
    precioMatch,
    stockMatch,
    OCNumero: ocNumero,
    OCLinea: ocLinea,
    ocCantidad,
    ocPrecioUnitario,
    cantidad,
    precio_unitario: precioUnitario,
  };
  const remitoOc: RemitoOc = { ocLineasProveedor, ocNumeros, ocVerificadaEn };
  const validando = estado === 'procesando';
  const estadoPrecio = estadoMatchOc('precio', articulo, remitoOc, validando);
  const estadoStock = estadoMatchOc('stock', articulo, remitoOc, validando);

  return (
    <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
      <IconoConTooltip
        estado={estadoPrecio}
        texto={textoVeredictoOc('precio', articulo, remitoOc, validando)}
      >
        <IconoPrecio />
      </IconoConTooltip>
      <IconoConTooltip
        estado={estadoStock}
        texto={textoVeredictoOc('stock', articulo, remitoOc, validando)}
      >
        <IconoStock />
      </IconoConTooltip>
    </span>
  );
}

/**
 * Contra qué orden(es) de compra se contrastó el remito. Va en el encabezado de
 * la card.
 *
 * ── Por qué al nivel del remito y no sólo por artículo ──────────────────────
 * El tooltip por renglón dice a qué línea se imputó ESE artículo. Esto responde
 * la pregunta de auditoría, que es sobre el remito completo: "¿contra qué se
 * validó este comprobante?". Sin esto, contestarla obliga a pasar el mouse por
 * cada renglón y juntar los números a mano — y los renglones que no se imputaron
 * a nada no aportan ninguno.
 *
 * No se muestra si nunca se verificó (`null`): un badge vacío afirma que se
 * contrastó contra nada, que es distinto de no haber contrastado.
 *
 * ── `ocNumeros` son las de los ARTÍCULOS, no las contrastadas ───────────────
 * Lista sólo las órdenes que figuran en algún renglón detectado (ver
 * `ocsPresentesEnArticulos`). Antes mostraba todas las que se habían mirado para
 * armar el cruce, así que aparecían órdenes con las que ningún artículo terminó
 * relacionado: el operador las buscaba en el ERP y no encontraba nada de este
 * remito ahí.
 *
 * `ocProveedor` es la lista completa de las miradas y se usa SÓLO para redactar
 * el caso vacío. Sin ese dato, "ningún artículo quedó imputado" y "el proveedor
 * no tenía ninguna orden" se dirían igual, y son cosas distintas: en el primero
 * hay órdenes para revisar a mano, en el segundo no hay nada que revisar.
 */
export function BadgeOcContrastada({
  ocNumeros,
  ocProveedor = null,
  ocVerificadaEn,
}: {
  /** Órdenes que figuran en los artículos detectados. */
  ocNumeros?: string[] | null;
  /** Órdenes que se MIRARON. Sólo para distinguir los dos casos vacíos. */
  ocProveedor?: string[] | null;
  ocVerificadaEn?: string | null;
}) {
  if (ocNumeros == null) return null;

  const fecha = fechaCortaIso(ocVerificadaEn ?? null);
  const hay = ocNumeros.length > 0;
  // Vacío con órdenes del proveedor = ninguna imputada. Vacío sin órdenes = el
  // proveedor no tenía ninguna.
  const sinImputar = !hay && !!ocProveedor?.length;

  return (
    <Tooltip
      texto={
        (hay
          ? `Los artículos de este remito quedaron imputados a la orden de compra ` +
            `${ocNumeros.join(', ')} del proveedor.`
          : sinImputar
            ? `Ningún artículo de este remito quedó imputado a una línea de orden de compra. ` +
              `Se miraron las órdenes ${ocProveedor.join(', ')}: o los códigos no figuran ahí, ` +
              'o las líneas ya las tomaron otros remitos.'
            : 'La consulta se hizo y el proveedor NO tenía ninguna orden de compra pendiente con ' +
              'líneas comparables. La mercadería entra sin respaldo de una orden.') +
        (fecha
          ? `\nVerificado el ${fecha}. Los valores del tooltip de cada renglón son los que ` +
            'tenía la orden en ese momento, no los de ahora.'
          : '')
      }
      ancho={280}
      wrapperStyle={{
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 12px',
        borderRadius: 99,
        border: '1px solid var(--border-2)',
        // Neutro a propósito: es un dato de trazabilidad, no una alerta. En ámbar
        // competiría con los avisos que sí piden una acción.
        //
        // `--bg` y no un `--bg-2` inventado: las variables definidas están en
        // index.css y esa lista es la paleta. Un fallback en `var(--x, #hex)`
        // esconde el hecho de que la variable no existe.
        background: 'var(--bg)',
        color: 'var(--muted)',
        fontSize: 12.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: 'help',
      }}
      fondo="#3c4655"
    >
      <IconoDocumento />
      {hay ? `OC ${ocNumeros.join(', ')}` : sinImputar ? 'Sin OC imputada' : 'Sin OC del proveedor'}
    </Tooltip>
  );
}

function IconoDocumento() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}
