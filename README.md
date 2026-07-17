# Ficha v3 · Distrisuper (front)

Frontend en React + Vite + TypeScript para `ficha_v3_api`, basado en el diseño `Distrisuper.dc.html`
(pestañas Nuevo / Pendientes / Historial / Configuración).

## Setup

```bash
npm install
cp .env.example .env   # ajustar VITE_API_BASE_URL si la API no corre en localhost:3000
npm run dev
```

Requiere `ficha_v3_api` corriendo (`npm run dev` en ese repo) y con `JWT_SECRET` / `AUTH_URL`
configurados en su `.env` (ver aviso más abajo), porque sin eso el login (`POST /users`) falla.

## Login

No hay `/auth/login`: el login real es `POST /users` con `{ email, password }`, que devuelve
`{ token }`. Ese token se guarda en `localStorage` y se manda como `Authorization: Bearer <token>`
en el resto de los pedidos.

## Sucursal persistida

Al elegir sucursal en "Nuevo", queda guardada en `localStorage` (`ficha_sucursal_id` /
`ficha_sucursal_nombre`) y se recupera sola en la próxima visita, tal como se pidió.

## Limitaciones conocidas del backend (a la fecha de este build)

Estos puntos están wireados en el front (la llamada se hace igual) pero **no persisten** del lado
del servidor porque los endpoints correspondientes son stubs hoy en `ficha_v3_api`:

- **Editar ítems de un remito** (doble clic en la tabla de "Nuevo", o botón "Editar" en
  "Pendientes"): `PATCH /remitos/:id/items` no guarda cambios (el service tiene la asignación
  comentada). El cambio se ve reflejado en pantalla pero se pierde al recargar.
- **"Cargar Stock"** en Pendientes: `POST /remitos/submit-mercaderia/:id` es un `async` vacío
  (no-op). El botón llama al endpoint real y además aprueba el remito (`PATCH /remitos/:id/approve`,
  que sí funciona) para que el flujo avance visualmente.
- **`GET /remitos`** filtra por sucursal mandando `?sucursalId=` como query param, aunque el
  controller hoy lee `@Body('sucursalId')` en un GET (que el navegador no permite enviar). El
  front además filtra client-side por las dudas de que el backend ignore el parámetro.

Cuando se implementen esos endpoints del lado de la API, no hace falta tocar nada en el front:
las llamadas ya están hechas, solo hay que sacar los avisos de "backend stub" en el código
(`src/api/remitos.ts`, `NuevoPage.tsx`, `PendientesPage.tsx`).

## Estructura

```
src/
  api/          cliente fetch + funciones por recurso (auth, facturas, remitos, proveedores, sucursales)
  context/      AuthContext (login/token) y DataContext (catálogos + remitos + sucursal seleccionada)
  components/   Sidebar, Header, Login
  pages/        NuevoPage, PendientesPage, HistorialPage, ConfiguracionPage
  types/api.ts  tipos que reflejan el contrato real de ficha_v3_api
  utils/        money.ts (formato $ ARS), colors.ts (paleta para diferenciar remitos)
```
