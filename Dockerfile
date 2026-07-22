# Choreganized — single-container deploy (Coolify).
# SQLite is embedded; no separate DB image. Persist /data as a volume.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/choreganized.db \
    UPLOADS_DIR=/data/uploads

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Migrations are read at runtime by the server init hook (runMigrations).
COPY --from=build /app/src/lib/server/db/migrations ./src/lib/server/db/migrations

VOLUME /data
EXPOSE 3000
CMD ["node", "build/index.js"]
