// Barra superior de la pantalla "Nuevo". El selector segmentado de tipo de
// comprobante (Factura/Remito) está deshabilitado por ahora; se puede restaurar
// desde el historial de git. Se mantiene el contenedor para conservar el layout.
export function TipoCompBar() {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} />;
}
