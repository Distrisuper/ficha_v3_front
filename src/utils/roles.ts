import type { AuthPayload } from '../types/api';

// Roles del sistema: admin = rol 1 y 2 · operador = rol 3.
// `rol` puede llegar como number o string desde el token, así que normalizamos.
function rolStr(auth: AuthPayload | null): string {
  return String(auth?.rol ?? '').trim();
}

export function isAdmin(auth: AuthPayload | null): boolean {
  const r = rolStr(auth);
  return r === '1' || r === '2';
}

export function isOperador(auth: AuthPayload | null): boolean {
  return rolStr(auth) === '3';
}

// Permisos concretos sobre catálogos. Regla:
//   - Operador: puede AGREGAR proveedores, pero no editarlos ni borrarlos, y no
//     puede tocar sucursales en absoluto.
//   - Admin: todo.
// Cualquier rol desconocido se trata como operador (criterio restrictivo).
export interface Perms {
  proveedorAdd: boolean;
  proveedorEdit: boolean;
  proveedorDelete: boolean;
  sucursalAdd: boolean;
  sucursalEdit: boolean;
  sucursalDelete: boolean;
}

export function permsFor(auth: AuthPayload | null): Perms {
  const admin = isAdmin(auth);
  return {
    proveedorAdd: true, // admin y operador
    proveedorEdit: admin,
    proveedorDelete: admin,
    sucursalAdd: admin,
    sucursalEdit: admin,
    sucursalDelete: admin,
  };
}
