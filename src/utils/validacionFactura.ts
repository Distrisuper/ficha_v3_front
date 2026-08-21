/**
 * Verificaciones previas a la carga de una factura.
 *
 * ## Por qué acá y no en cada pantalla
 *
 * Las mismas reglas se aplican en dos momentos distintos del flujo: al aprobar lo
 * extraído del PDF (Nuevo) y al mandar la factura al ERP (Pendientes). Si cada
 * pantalla armara su propio criterio, un comprobante podría pasar en una y quedar
 * bloqueado en la otra, que es peor que no validar: el operador no sabría cuál de las
 * dos tiene razón.
 *
 * ## Errores vs avisos
 *
 * - `error`: **bloquea** la carga. Son los casos en los que el comprobante no puede
 *   entrar al ERP: falta el Nº de factura o de remito, falta el código de un artículo,
 *   o hay un importe base en cero (cantidad, precio, total de línea, subtotal o total).
 * - `aviso`: NO bloquea. El dato es sospechoso pero cargable: formato de número raro,
 *   falta la descripción, la cantidad no es entera, los totales no cierran (descalce
 *   matemático) o IVA/percepciones/bonificaciones en cero. Se marcan en amarillo sobre
 *   el propio campo y se repiten en el modal, pero el operador puede cargar igual.
 *
 * ## Advertencia dirigida a un campo
 *
 * Cada advertencia apunta a un campo concreto (`campo`, y `articuloId` cuando es de un
 * artículo). Así la UI puede pintar de amarillo exactamente ese input/celda y mostrar
 * el motivo en un tooltip, en vez de un cartel genérico arriba de todo. `mensaje` sigue
 * siendo el texto humano completo, que además se lista en el modal.
 *
 * ## Tolerancias
 *
 * Los importes se redondean a 2 decimales por línea, así que la suma de líneas puede
 * diferir del subtotal impreso por centavos sin que haya ningún error real. Comparar
 * por igualdad exacta convertiría ese redondeo en un aviso. La tolerancia de la línea
 * es más ajustada que la del total porque el error del total es acumulado.
 */
import type { Remito } from '../types/api';
import { money } from './money';
import { round2, toNumero } from './numero';
import { FORMATO_ESPERADO, validarNroComprobante } from './comprobante';

/** Diferencia admitida en `cantidad × precio unitario = total`. */
export const TOLERANCIA_LINEA = 0.01;
/** Diferencia admitida en las sumas de cabecera (subtotal y total). */
export const TOLERANCIA_TOTAL = 0.05;

export type NivelAdvertencia = 'error' | 'aviso';

/**
 * Campo al que apunta una advertencia. Sirve para pintar el input/celda correcto.
 * `sin-items` e `importes-cero` no mapean a un input concreto (van sólo al modal).
 */
export type CampoAdvertencia =
  | 'facturaNro'
  | 'remitoNro'
  | 'sin-items'
  | 'nombre'
  | 'codigo'
  | 'cantidad'
  | 'precio_unitario'
  | 'total_unitario'
  | 'subtotal'
  | 'iva'
  | 'percepciones'
  | 'descuentos'
  | 'total'
  | 'importes-cero';

/** Campos que NO tienen un input propio y sólo se muestran en el modal. */
const CAMPOS_SIN_INPUT: CampoAdvertencia[] = ['sin-items', 'importes-cero'];

export interface Advertencia {
  /** Estable por remito+campo: sirve de `key` de React y evita duplicados. */
  id: string;
  /** `error` bloquea la carga; `aviso` no. */
  nivel: NivelAdvertencia;
  mensaje: string;
  /** Remito al que pertenece (para ubicar el campo en pantalla). */
  remitoId: string;
  /** Presente sólo en advertencias de un artículo. */
  articuloId?: string;
  /** Campo concreto al que apunta. */
  campo: CampoAdvertencia;
}

/**
 * Corre todas las reglas sobre un comprobante.
 *
 * `etiqueta` se antepone a cada mensaje cuando hay más de un remito en pantalla; sin
 * ella el operador ve "falta el código" tres veces y no sabe en cuál de los tres.
 */
export function validarRemito(r: Remito, etiqueta?: string): Advertencia[] {
  const out: Advertencia[] = [];
  const prefijo = etiqueta ? `${etiqueta} · ` : '';
  const push = (
    nivel: NivelAdvertencia,
    campo: CampoAdvertencia,
    mensaje: string,
    articuloId?: string,
  ) =>
    out.push({
      id: `${r.id}:${articuloId ? `${articuloId}:` : ''}${campo}`,
      nivel,
      mensaje: prefijo + mensaje,
      remitoId: r.id,
      articuloId,
      campo,
    });

  // ── 1. Números de comprobante ──────────────────────────────────────────────
  // Vacío bloquea; formato raro pero presente es sólo un aviso (se puede cargar).
  const facturaRaw = String(r.facturaNro ?? '').trim();
  if (!facturaRaw) {
    push('error', 'facturaNro', 'Falta el Nº de factura.');
  } else {
    const factura = validarNroComprobante(facturaRaw);
    if (!factura.ok) {
      push('aviso', 'facturaNro', `Nº de factura: ${factura.error}. Se espera ${FORMATO_ESPERADO}.`);
    }
  }
  const remitoRaw = String(r.remitoNro ?? '').trim();
  if (!remitoRaw) {
    push('error', 'remitoNro', 'Falta el Nº de remito.');
  } else {
    const remito = validarNroComprobante(remitoRaw);
    if (!remito.ok) {
      push('aviso', 'remitoNro', `Nº de remito: ${remito.error}. Se espera ${FORMATO_ESPERADO}.`);
    }
  }

  // ── 2. Datos de los productos ──────────────────────────────────────────────
  const items = r.articulos ?? [];
  if (items.length === 0) {
    push('error', 'sin-items', 'El comprobante no tiene artículos cargados.');
  }

  items.forEach((it) => {
    // Referencia legible del ítem: el nombre si lo hay, sino el código, sino la
    // posición. Un mensaje que dice "Artículo sin nombre: falta el nombre" no ayuda.
    // const ref = String(it.codigo ?? '').trim() || String(it.codigo ?? '').trim() || `Artículo ${i + 1}`;
    const item = (nivel: NivelAdvertencia, campo: CampoAdvertencia, mensaje: string) =>
      push(nivel, campo, `${mensaje}`, it.id);

    // Falta la descripción: sospechoso pero no impide cargar (aviso).
    if (!String(it.nombre ?? '').trim()) item('aviso', 'nombre', 'falta la descripción.');
    // Falta el código: bloquea (el ERP lo necesita para identificar el artículo).
    if (!String(it.codigo ?? '').trim()) item('error', 'codigo', 'falta el código.');

    const cantidadVacia = it.cantidad == null || String(it.cantidad).trim() === '';
    const cantidad = toNumero(it.cantidad);
    if (cantidadVacia || cantidad <= 0) {
      item('error', 'cantidad', 'falta la cantidad (o es cero).');
    } else if (!Number.isInteger(cantidad)) {
      // El ERP descarga stock en unidades enteras: una cantidad fraccionada casi
      // siempre es un decimal mal leído del PDF (1.5 por 15, 1,000 por 1000).
      item('aviso', 'cantidad', `la cantidad (${cantidad}) no es un número entero.`);
    }

    const precio = toNumero(it.precio_unitario);
    if (precio <= 0) item('error', 'precio_unitario', 'falta el precio unitario (o es cero).');

    const total = toNumero(it.total_unitario);
    if (total <= 0) {
      item('error', 'total_unitario', 'falta el total de la línea (o es cero).');
    } else if (cantidad > 0 && precio > 0) {
      // ── 3. Verificación matemática por línea (aviso: puede editarse a mano) ──
      const esperado = round2(cantidad * precio);
      if (Math.abs(esperado - round2(total)) > TOLERANCIA_LINEA) {
        item(
          'aviso',
          'total_unitario',
          `${cantidad} × ${money(precio)} = ${money(esperado)}, pero el total de la línea dice ${money(total)}.`,
        );
      }
    }
  });

  // ── 4. Σ totales de línea = subtotal ───────────────────────────────────────
  const sumaLineas = round2(items.reduce((acc, it) => acc + toNumero(it.total_unitario), 0));
  const subtotal = round2(toNumero(r.subtotal));
  if (subtotal <= 0 && sumaLineas > 0) {
    push('error', 'subtotal', 'Falta el subtotal del comprobante (está en $ 0,00).');
  } else if (subtotal > 0 && Math.abs(sumaLineas - subtotal) > TOLERANCIA_TOTAL) {
    push(
      'aviso',
      'subtotal',
      `La suma de los totales de línea (${money(sumaLineas)}) no coincide con el subtotal (${money(subtotal)}).`,
    );
  }

  // ── 5. Subtotal − bonificaciones + percepciones + IVA = total ──────────────
  const iva = round2(toNumero(r.iva));
  const percepciones = round2(toNumero(r.percepciones));
  const descuentos = round2(toNumero(r.descuentos));
  const total = round2(toNumero(r.total));
  const totalEsperado = round2(subtotal - descuentos + percepciones + iva);

  if (total <= 0 && totalEsperado > 0) {
    push('error', 'total', 'Falta el total del comprobante (está en $ 0,00).');
  } else if (total > 0 && Math.abs(totalEsperado - total) > TOLERANCIA_TOTAL) {
    push(
      'aviso',
      'total',
      `Subtotal ${money(subtotal)} − bonificaciones ${money(descuentos)} + percepciones ${money(percepciones)} + IVA ${money(iva)} = ${money(totalEsperado)}, pero el total dice ${money(total)}.`,
    );
  }

  // ── 6. Avisos: importes en cero (posibles, pero infrecuentes) ──────────────
  const enCero = [
    iva === 0 && 'IVA',
    percepciones === 0 && 'percepciones',
    descuentos === 0 && 'bonificaciones',
  ].filter(Boolean) as string[];
  if (enCero.length > 0) {
    push('aviso', 'importes-cero', `${listar(enCero)} en $ 0,00. Verificá que sea correcto.`);
  }

  return out;
}

/** Valida un lote (Nuevo puede traer varios remitos de un mismo PDF). */
export function validarLote(remitos: Remito[]): Advertencia[] {
  const etiquetar = remitos.length > 1;
  return remitos.flatMap((r) =>
    validarRemito(r, etiquetar ? `Remito ${r.remitoNro || r.id.slice(0, 8)}` : undefined),
  );
}

export const soloErrores = (a: Advertencia[]) => a.filter((x) => x.nivel === 'error');
export const soloAvisos = (a: Advertencia[]) => a.filter((x) => x.nivel === 'aviso');
export const tieneErrores = (a: Advertencia[]) => a.some((x) => x.nivel === 'error');

/**
 * Indexa las advertencias por campo para que la UI resuelva en O(1) qué mensajes
 * van sobre cada input/celda. Las que no tienen input propio (`sin-items`,
 * `importes-cero`) se dejan afuera: sólo viven en el modal.
 *
 * Clave: `${remitoId}|${articuloId}|${campo}` para artículos, `${remitoId}|${campo}`
 * para la cabecera. Usá `claveCampo` para construirla desde la UI.
 */
export function indexarPorCampo(advertencias: Advertencia[]): Map<string, Advertencia[]> {
  const m = new Map<string, Advertencia[]>();
  for (const a of advertencias) {
    if (CAMPOS_SIN_INPUT.includes(a.campo)) continue;
    const k = claveCampo(a.remitoId, a.campo, a.articuloId);
    const arr = m.get(k);
    if (arr) arr.push(a);
    else m.set(k, [a]);
  }
  return m;
}

/** Construye la clave del índice de `indexarPorCampo`. */
export function claveCampo(remitoId: string, campo: CampoAdvertencia, articuloId?: string): string {
  return `${remitoId}|${articuloId ? `${articuloId}|` : ''}${campo}`;
}

/** "a, b y c" — para que los mensajes se lean como una frase y no como un array. */
function listar(xs: string[]): string {
  if (xs.length === 1) return `${xs[0]} está`;
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]} están`;
}
