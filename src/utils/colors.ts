// Paleta cíclica para diferenciar remitos dentro de una misma factura (la API no
// devuelve un color; el diseño original lo hardcodeaba por mock).
const PALETTE: { color: string; light: string }[] = [
  { color: '#2563eb', light: '#eff4ff' },
  { color: '#16a34a', light: '#eefaf2' },
  { color: '#d97706', light: '#fff6e9' },
  { color: '#7c3aed', light: '#f4eeff' },
  { color: '#0891b2', light: '#e9f8fb' },
  { color: '#db2777', light: '#fdeef5' },
];

export function colorFor(index: number): { color: string; light: string } {
  return PALETTE[index % PALETTE.length];
}
