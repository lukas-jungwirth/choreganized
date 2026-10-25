# Choreganized — single-container deploy (Coolify).
# SQLite is embedded; no separate DB image. Persist /data as a volume.

# Litestream copies the database to S3-compatible storage while the app runs and restores
# it into an empty volume on start (→ docs/BACKUP.md, DECISIONS #158). Only its static
# binary is used. Pinned to the release and to the digest of its multi-arch index, so a
# rebuild can't pick up a different binary. 0.5's config format is not 0.3's: bump the
# version and litestream.yml together.
FROM litestream/litestream:0.5.17@sha256:4b02b9859a6b6b4087d8b8944e15f7e984bd7957cba322bbeee38b0e27b9656a AS litestream

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
#
# SHUTDOWN_TIMEOUT: on SIGTERM adapter-node waits this long for open connections, and the
# live list's event stream never closes on its own. Its default of 30 s is more than
# Docker's 10 s before SIGKILL. The 10 s are shared: 3 s for connections, up to 2 s for a
# running cron job (→ hooks.server.ts), up to 4 s for Litestream's last upload
# (→ litestream.yml, DECISIONS #158).
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/choreganized.db \
    UPLOADS_DIR=/data/uploads \
    BODY_SIZE_LIMIT=20M \
    SHUTDOWN_TIMEOUT=3 \
    APP_VERSION=${APP_VERSION:-0.0.1} \
    APP_COMMIT=${SOURCE_COMMIT}

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Migrations are read at runtime by the server init hook (runMigrations).
COPY --from=build /app/src/lib/server/db/migrations ./src/lib/server/db/migrations

# Off-site replication (→ docs/BACKUP.md). The start script decides whether Litestream
# runs, from the LITESTREAM_* variables. With none set the app starts as it always did.
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY litestream.yml /etc/litestream.yml
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

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
# Run through `sh`, not the file's own exec bit, which a checkout or a COPY can lose. The
# script `exec`s, so PID 1 ends up being Litestream or node, never a shell that would
# swallow SIGTERM.
ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]
CMD ["node", "build/index.js"]
