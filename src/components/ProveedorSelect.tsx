import { useMemo, type CSSProperties } from 'react';
import { formatCuit } from '../utils/cuit';
import type { Proveedor } from '../types/api';
import { SearchSelect, type OpcionBuscable } from './SearchSelect';

interface Props {
  value: string;
  onChange: (proveedorId: string) => void;
  proveedores: Proveedor[];
  /** Texto cuando no hay ninguno elegido. */
  placeholder: string;
  /** Si viene, se ofrece una opción para volver a "sin filtro". */
  emptyLabel?: string;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
}

/**
 * Elegir un proveedor, con buscador.
 *
 * Envuelve a `SearchSelect` para que la forma en que un proveedor se MUESTRA y
 * se BUSCA esté definida en un solo lugar: hoy se usa en los filtros de
 * Pendientes/Historial y en la carga de un comprobante nuevo, y las dos
 * pantallas tienen que encontrar lo mismo con lo mismo tipeado. Con el mapeo
 * duplicado en cada `useMemo`, agregar un campo buscable en una dejaba a la otra
 * sin él y el operador no sabría cuál de las dos está bien.
 *
 * La segunda línea (razón social · CUIT) no es decoración: `nombre` es un alias
 * interno y dos proveedores del mismo grupo pueden llamarse casi igual. La razón
 * social y el CUIT son lo que figura en el comprobante que se está cargando.
 */
export function ProveedorSelect({ proveedores, ...resto }: Props) {
  const options = useMemo<OpcionBuscable[]>(
    () =>
      proveedores.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        // `formatCuit` para que se vea como en el papel; la búsqueda igual
        // encuentra el CUIT tipeado sin guiones (ver `coincideBusqueda`).
        alias: [p.razonSocial, p.cuit ? formatCuit(p.cuit) : null].filter(Boolean).join(' · ') || null,
      })),
    [proveedores],
  );

  return <SearchSelect {...resto} options={options} placeholderBusqueda="Buscar por nombre, razón social o CUIT…" />;
}
