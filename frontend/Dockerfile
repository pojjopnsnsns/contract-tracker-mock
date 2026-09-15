# --- Build stage ---
FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

# Baked in at build time. Defaults to the port docker-compose publishes
# the backend on (localhost:4000), since the browser on the Windows host
# calls this URL directly - not the backend's container name.
ARG VITE_API_BASE=http://localhost:4000
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

# --- Serve stage ---
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
