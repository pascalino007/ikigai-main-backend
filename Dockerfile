# syntax=docker/dockerfile:1

# ─── Build stage ───────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Native deps (bcrypt) need build tools at install time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
# Drop dev dependencies (keeps the compiled bcrypt binary for the runtime stage).
RUN npm prune --omit=dev

# ─── Runtime stage ─────────────────────────────────────────────
FROM node:20-slim AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

EXPOSE 4040
CMD ["node", "dist/main"]
