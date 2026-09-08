# ---- Build stage ----
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# La URL de la API se HORNEA EN EL BUNDLE.
#
# Vite reemplaza `import.meta.env.VITE_*` en tiempo de build por el literal: no es
# una variable de entorno del contenedor, y ponerla en el `environment` del
# compose no hace absolutamente nada. Por eso va como ARG y no como ENV de
# runtime.
#
# Consecuencia práctica: una imagen sirve UN entorno. Para apuntar a otra API hay
# que rebuildear, no reiniciar.
#
#   docker build --build-arg VITE_API_BASE_URL=https://ficha-api.distrisuper.com .
#
# Sin el `--build-arg` el default de abajo es localhost, que es lo que corresponde
# en desarrollo y lo que hay que acordarse de pisar en el pipeline de deploy.
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# `npm run build` es `tsc -b && vite build`: el build FALLA si hay un error de
# tipos, que es lo que se quiere. (`tsc -b` construye los proyectos referenciados
# desde el tsconfig raíz; `tsc -p tsconfig.json` a secas no chequearía nada,
# porque la raíz tiene `files: []`.)
RUN npm run build

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# El healthcheck pega a un archivo estático real, no a `/`: con `try_files` la
# raíz devuelve el index.html aunque el build haya quedado vacío, así que un 200
# en `/` no prueba que haya assets.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/index.html > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
