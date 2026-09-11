# Choreganized — single-container deploy (Coolify).
# SQLite is embedded; no separate DB image. Persist /data as a volume.

FROM node:22-bookworm-slim AS build
# Which build this is, for feedback reports (→ src/lib/server/version.ts,
# DECISIONS #137). Coolify supplies SOURCE_COMMIT on a git deployment; APP_VERSION
# comes from a Build Variable in its UI — a plain env var is runtime-only and never
# reaches --build-arg. An ARG does not cross a FROM, so both stages declare them.
ARG APP_VERSION
ARG SOURCE_COMMIT
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ARG APP_VERSION
ARG SOURCE_COMMIT
WORKDIR /app
# BODY_SIZE_LIMIT: adapter-node rejects a request body over 512K by default, and
# a recipe photo straight off a phone is several MB — without this every photo
# upload 413s before the form action runs (the dev server has no such limit, so
# it only breaks in production). Sits above the app's own 15 MB gate, so an
# oversized photo still gets our sentence rather than an error page.
#
# APP_VERSION / APP_COMMIT: baked into the image because there is nothing else to
# read them from — .dockerignore excludes .git, and the built server loads no .env.
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/choreganized.db \
    UPLOADS_DIR=/data/uploads \
    BODY_SIZE_LIMIT=20M \
    APP_VERSION=${APP_VERSION:-0.0.1} \
    APP_COMMIT=${SOURCE_COMMIT}

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Migrations are read at runtime by the server init hook (runMigrations).
COPY --from=build /app/src/lib/server/db/migrations ./src/lib/server/db/migrations

# Own the /data mountpoint before declaring the volume, so a fresh named volume is
# seeded writable by the built-in non-root `node` user (Docker initialises an empty
# volume with the ownership of the image directory at that path). /app stays
# root-owned and world-readable — the app only ever writes to /data — so `node` can
# still read build/, node_modules/ and the migrations.
RUN mkdir -p /data && chown node:node /data

VOLUME /data
EXPOSE 3000
# Drop root: an app/dependency compromise then can't write outside /data or escalate.
# NOTE: assumes a fresh volume. An existing /data from a prior root-run deploy would
# be root-owned — chown it to uid 1000 (node) once before switching.
USER node
CMD ["node", "build/index.js"]
