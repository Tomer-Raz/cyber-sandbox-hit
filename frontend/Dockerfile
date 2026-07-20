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
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
