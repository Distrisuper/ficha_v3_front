import type { ReactNode } from 'react';
import type { EstadoOrdenCompra } from '../hooks/useOrdenCompra';
import { Tooltip } from './Tooltip';
import { money, fmtCantidad } from '../utils/money';

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

// --- Iconos por artículo -----------------------------------------------------

export type EstadoMatch = 'procesando' | 'match' | 'sin-match' | 'sin-verificar' | 'sin-oc';

/**
 * Semáforo. Tres colores, cuatro significados:
 *
 *   amarillo → todavía no hay veredicto (sin verificar, o verificándose ahora)
 *   verde    → coincide con la orden de compra
 *   rojo     → NO coincide, o NO HAY orden de compra contra la que comparar
 *
 * `procesando` y `sin-verificar` comparten el amarillo a propósito: para el
 * operador son el mismo hecho ("todavía no sé"). Lo que los distingue no es el
 * color sino el spinner, que responde a otra pregunta — "¿tengo que esperar o
 * tengo que hacer algo?".
 *
 * ── `sin-oc` va en ROJO y no en amarillo ────────────────────────────────────
 * "El proveedor no tiene ninguna orden de compra pendiente" es un VEREDICTO, no
 * una falta de veredicto: la consulta se hizo y la respuesta es que no hay nada
 * contra lo que comparar. La mercadería entra sin respaldo de una orden, que es
 * exactamente lo que el rojo tiene que comunicar.
 *
 * El amarillo queda reservado para "todavía no sé", que es la única cosa sobre la
 * que el operador no puede decidir nada. Un rojo que no significa nada hace que
 * desconfíe de los rojos que sí importan — y al revés, un amarillo para algo ya
 * resuelto lo entrena a esperar algo que no va a pasar.
 */
const PALETA: Record<EstadoMatch, { color: string; fondo: string; fondoTooltip: string; borde: string }> = {
  procesando: { color: 'var(--warn)', fondo: '#fdf8ec', fondoTooltip: '#c99c3d', borde: '#f3dca6' },
  'sin-verificar': { color: 'var(--warn)', fondo: '#fdf8ec', fondoTooltip: '#c99c3d', borde: '#f3dca6' },
  match: { color: 'var(--ok)', fondo: '#eefaf2', fondoTooltip: '#25a54f', borde: '#bfe6ce' },
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
    match: 'Precio: coincide con la orden de compra',
    // Ya NO dice "(o el artículo no figura en ella)". Los dos casos se
    // distinguen abajo con el detalle de la línea: si no se imputó a ninguna, el
    // texto lo dice explícitamente. Meter las dos hipótesis en una sola frase
    // obligaba al operador a adivinar cuál de las dos era la suya.
    'sin-match': 'Precio: NO coincide con la orden de compra',
    'sin-verificar': 'Precio: pendiente de verificar. Se controla al cargar la factura.',
    'sin-oc': 'NO HAY orden de compra pendiente de este proveedor. No hay precio contra el que comparar: la mercadería entra sin respaldo de una orden.',
  },
  stock: {
    procesando: 'Cantidad: verificando contra la orden de compra…',
    match: 'Cantidad: coincide con el saldo pendiente de la orden de compra',
    'sin-match': 'Cantidad: NO coincide con el saldo pendiente de la orden de compra',
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
function conEvidencia(
  texto: string,
  estado: EstadoMatch,
  campo: 'precio' | 'stock',
  oc: LineaOcComparada,
  remito: ValoresRemito,
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

    // El par de valores, sólo cuando NO coincide: si coincide, repetir dos veces
    // el mismo número es ruido.
    if (estado === 'sin-match') {
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

/** `null`/`undefined` = sin verificar. Ver la nota de `Articulo` en types/api.ts. */
function estadoDeFlag(flag: boolean | null | undefined): EstadoMatch {
  if (flag === true) return 'match';
  if (flag === false) return 'sin-match';
  return 'sin-verificar';
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
  // `=== 0` y no `!ocLineasProveedor`: `null`/`undefined` es "no se verificó" y
  // tiene que seguir cayendo en el amarillo de `estadoDeFlag`. Sólo el 0 explícito
  // es el veredicto "este proveedor no tiene órdenes".
  const sinOc = ocLineasProveedor === 0;
  const estadoPrecio: EstadoMatch =
    estado === 'procesando' ? 'procesando' : sinOc ? 'sin-oc' : estadoDeFlag(precioMatch);
  const estadoStock: EstadoMatch =
    estado === 'procesando' ? 'procesando' : sinOc ? 'sin-oc' : estadoDeFlag(stockMatch);
  const oc: LineaOcComparada = {
    numero: ocNumero,
    linea: ocLinea,
    cantidad: ocCantidad,
    precioUnitario: ocPrecioUnitario,
    verificadaEn: ocVerificadaEn,
    numerosContrastados: ocNumeros,
  };
  const propio: ValoresRemito = { cantidad, precioUnitario };

  return (
    <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
      <IconoConTooltip
        estado={estadoPrecio}
        texto={conEvidencia(TOOLTIPS.precio[estadoPrecio], estadoPrecio, 'precio', oc, propio)}
      >
        <IconoPrecio />
      </IconoConTooltip>
      <IconoConTooltip
        estado={estadoStock}
        texto={conEvidencia(TOOLTIPS.stock[estadoStock], estadoStock, 'stock', oc, propio)}
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
 */
export function BadgeOcContrastada({
  ocNumeros,
  ocVerificadaEn,
}: {
  ocNumeros?: string[] | null;
  ocVerificadaEn?: string | null;
}) {
  if (ocNumeros == null) return null;

  const fecha = fechaCortaIso(ocVerificadaEn ?? null);
  const hay = ocNumeros.length > 0;

  return (
    <Tooltip
      texto={
        (hay
          ? `Los semáforos de precio y cantidad de este remito se compararon contra la orden ` +
            `de compra ${ocNumeros.join(', ')} del proveedor.`
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
      {hay ? `OC ${ocNumeros.join(', ')}` : 'Sin OC del proveedor'}
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
