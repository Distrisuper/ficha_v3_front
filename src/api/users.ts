import { api } from './client';
import type { MeResponse, User } from '../types/api';

export interface RegisterUserInput {
  email: string;
  nombre: string;
  rol: string; // '2' = admin · '3' = operador
  password: string;
}

// POST /users/register: crea un usuario en la empresa del solicitante.
// El back exige que el solicitante sea admin (rol 1 o 2) y que el rol nuevo sea 2 o 3;
// el company_id lo toma del token, no del body.
export const usersApi = {
  register: (data: RegisterUserInput) => api.post<User>('/users/register', data),
  // GET /users/me: devuelve { user, empresa }. Es la única fuente del nombre y la
  // url de la empresa (no están en el token, ver types/api.ts#AuthPayload).
  me: () => api.get<MeResponse>('/users/me'),
};
