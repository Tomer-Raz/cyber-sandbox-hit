# ── Build stage ──
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Vite bakes these at build time (import.meta.env.VITE_*)
ARG VITE_API_BASE_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_USE_MOCKS=true
ARG VITE_AUTH_MODE=mock
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_USE_MOCKS=$VITE_USE_MOCKS \
    VITE_AUTH_MODE=$VITE_AUTH_MODE
RUN npm run build

# ── Serve stage (Cloud Run listens on $PORT, default 8080) ──
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

# The CSP's connect-src has to name the API, and the bundle can only reach the
# origin it was compiled against — so both come from this one value instead of
# a domain written into the config. `cut -f1-3` keeps scheme://host:port and
# drops the path. The fallback matches api/client.ts's own default.
ARG VITE_API_BASE_URL
RUN api_origin=$(printf '%s' "${VITE_API_BASE_URL:-http://localhost:8000/api}" | cut -d/ -f1-3) \
 && sed -i "s|__API_ORIGIN__|${api_origin}|" /etc/nginx/snippets/security-headers.conf \
 && ! grep -q __API_ORIGIN__ /etc/nginx/snippets/security-headers.conf

COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
