# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
# npm's download cache lives in a BuildKit cache mount: reused between builds,
# never stored in an image layer.
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
# The browser calls the API on the same origin (/api); the Next server proxies it to
# API_PROXY_TARGET. Both are inlined/baked at build time.
ARG NEXT_PUBLIC_API_URL=/api
ARG API_PROXY_TARGET=http://backend:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    API_PROXY_TARGET=$API_PROXY_TARGET \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
