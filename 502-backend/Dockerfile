# syntax=docker/dockerfile:1

# ---- build: compile TS and generate the Prisma client for this platform ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# ---- deps: production node_modules only (prisma CLI is a prod dependency for migrate deploy) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app
# openssl for the Prisma engines, tzdata so TZ=Asia/Ho_Chi_Minh resolves (business day 06:00 -> 06:00)
RUN apt-get update && apt-get install -y --no-install-recommends openssl tzdata \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=4000 \
    TZ=Asia/Ho_Chi_Minh

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma

USER node
EXPOSE 4000

# Apply pending migrations, then start. Seeding is a one-off:
#   docker compose exec backend node dist/prisma/seed.js
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/src/main.js"]
