# Backup and restore

How the household's database is kept safe, and how to get it back. The pieces:
`litestream.yml`, `scripts/docker-entrypoint.sh`, the `Dockerfile`, and the nightly backup in
`lib/server/backup.ts` (→ DECISIONS #91, #157).

| Layer                      | Where                                      | History                                      | Covers       |
| -------------------------- | ------------------------------------------ | -------------------------------------------- | ------------ |
| **Litestream**, continuous | Backblaze B2 `lj-dev-backup`, per prefix   | 14 days, to the 15 minutes (10 s for ~5 min) | the database |
| B2 lifecycle rule          | the same bucket                            | deleted files kept 30 more days              | the database |
| Nightly snapshot, in-app   | `/data/backups/YYYY-MM-DD.db`, same volume | 14 days, one a day                           | the database |

**Recipe photos are in none of them.** They are files under `UPLOADS_DIR` (`/data/uploads`),
not rows, and Litestream copies only SQLite. When moving servers, copy `/data/uploads` by hand
(see "Moving to a new server"). A restored database without them shows every recipe without
its photo.

## How replication works

The container starts through `scripts/docker-entrypoint.sh`:

1. **No `LITESTREAM_*` variable set** → `node build/index.js`, exactly as before Litestream.
   Local dev, `npm test` and the Playwright suites never see Litestream.
2. **Some set, not all** → the container refuses to start and names what's missing. A
   production that quietly ran without replication would only be found out on the day it
   was needed.
3. **All six set** → `litestream restore -if-db-not-exists -if-replica-exists`: restore only
   into an empty volume, and only from a replica that has data. Then
   `litestream replicate -exec "node build/index.js"`: Litestream is PID 1 and runs the app as
   its child.

While it runs, Litestream reads the WAL and uploads new pages every **10 s** as an LTX file
(level 0). Every **15 min** it merges those into level 1, every **6 h** into level 2. Once a
day it uploads a full **snapshot**. Snapshots are kept **14 days**, and retention prunes every
level back to the oldest snapshot it keeps. Level-0 files go 5 minutes after level 1 has them.
So a point-in-time restore can go back 14 days, to the 15 minutes, and to the 10 s for the
last few minutes.

**Checkpoints are Litestream's.** It holds a read transaction so nobody else can reset the
WAL, and runs the checkpoints itself. The app runs none by hand and leaves
`wal_autocheckpoint` at SQLite's default, which is what Litestream's docs ask for. It already
sets `journal_mode=WAL` and `busy_timeout=5000` (`lib/server/db/index.ts`). The nightly
`.backup()` only reads, so it doesn't interfere.

**Stopping.** Docker sends SIGTERM, then SIGKILL 10 s later (Docker Engine's default). Litestream
passes the SIGTERM to the app. The app closes HTTP (`SHUTDOWN_TIMEOUT=3`, for the live list's
open stream), stops the cron tick (a running job gets 2 s), closes the database and exits
(`hooks.server.ts`). Then Litestream uploads what is left, for up to 4 s
(`shutdown-sync-timeout`), and exits. Measured: under 1 s normally, about 5 s with the bucket
unreachable. If anything is killed anyway, at most the last 10 s of writes are lost and the
replica stays consistent.

## Environment variables (Coolify)

Set these under the app's **Environment Variables**, with **"Build Variable" unticked**. They
are read at start, and a build variable would hand the secret to `docker build` for nothing.
`DATABASE_PATH` is already set by the Dockerfile.

| Variable                       | Staging                                     | Production                                  |
| ------------------------------ | ------------------------------------------- | ------------------------------------------- |
| `LITESTREAM_ACCESS_KEY_ID`     | the B2 key's _keyID_                        | the same key                                |
| `LITESTREAM_SECRET_ACCESS_KEY` | the B2 key's _applicationKey_ (secret)      | the same key                                |
| `LITESTREAM_S3_ENDPOINT`       | `https://s3.eu-central-003.backblazeb2.com` | `https://s3.eu-central-003.backblazeb2.com` |
| `LITESTREAM_S3_BUCKET`         | `lj-dev-backup`                             | `lj-dev-backup`                             |
| `LITESTREAM_S3_REGION`         | `eu-central-003`                            | `eu-central-003`                            |
| `LITESTREAM_REPLICA_PATH`      | `choreganized/staging`                      | `choreganized/production`                   |

The endpoint is the one on the bucket's page in B2 ("Endpoint"), with `https://` in front. The
region is its middle part. **Each instance gets its own prefix.** Two instances replicating to
the same prefix make it unrestorable. This applies to a cloned Coolify app and to the old and
new server during a move as well.

The B2 application key: bucket `lj-dev-backup` only, file name prefix `choreganized/`,
**Read and Write**. "Allow List All Bucket Names" is not needed. Litestream lists, reads,
writes and deletes. Its deletes are B2 "hides", which the bucket's lifecycle rule keeps 30
more days.

## Request budget (B2 free tier)

Without a card on file, B2 allows about 2,500 Class B (GET, HEAD) and 2,500 Class C (LIST)
requests a day. Uploads and deletes are Class A, which is free. Litestream lists a whole level
on every pass and filters what it gets back itself, so the cost is in how often it lists.

| What                                        | When                              | LIST (C)      | GET (B)         |
| ------------------------------------------- | --------------------------------- | ------------- | --------------- |
| Sync (upload new pages)                     | every 10 s, only after a write    | 0             | 0               |
| Level-1 merge + level-0 cleanup             | per 15 min with a write, ≤ 96/day | 3–4 each      | 0               |
| Level-0 cleanup pass                        | hourly, 24/day                    | 2–3 each      | 0               |
| Level-2 merge                               | per 6 h with a write, ≤ 4/day     | 1–2 each      | one per L1 file |
| Snapshot + retention                        | daily                             | about 4       | 0               |
| Container start                             | each deploy or restart            | about 40      | 1–2             |
| Restore into an empty volume                | rarely                            | about 25      | ~30 or fewer    |
| **Worst case:** writes every 15 min all day |                                   | **≈ 470/day** | **≈ 100/day**   |
| **Idle day** (nothing written)              |                                   | **≈ 75/day**  | **0**           |

Starts add up: ten deploys in a day add about 400 LIST. All of it stays far under the 2,500
a day. The value that mattered: Litestream's default `l0-retention-check-interval` of 15 s
would LIST about 11,500 times a day with nothing written at all. `litestream.yml` sets it to
1 h, and `tests/conventions/container.test.ts` keeps it there.

## Restoring

Every command below runs in the app container: Coolify → the app → **Terminal**, while it
runs. `-timestamp` is UTC (`…Z`), and a file counts only if it was written _before_ it.

### A new server, or an emptied volume

Nothing to do. Deploy with the same variables and an empty `/data`. The log shows
`[start] Restored /data/choreganized.db from the replica`, then the app starts. If the bucket
can't be reached, the start fails and Coolify retries. It never starts on an empty database
that would then be replicated over the real one.

### A point in time

```bash
# 1. Which restore points exist (level 0: every 10 s, level 1: every 15 min, 9: snapshots)
litestream ltx -config /etc/litestream.yml -level all /data/choreganized.db
# 2. What a restore to that time would fetch, without writing anything
litestream restore -config /etc/litestream.yml -dry-run -timestamp 2026-10-20T18:00:00Z /data/choreganized.db
# 3. Restore it next to the live database, as the staged file the start script looks for
litestream restore -config /etc/litestream.yml -timestamp 2026-10-20T18:00:00Z \
  -integrity-check quick -o /data/choreganized.db.restore /data/choreganized.db
```

4. **Restart** the app in Coolify. The start script puts the staged file in place before
   anything opens the database, and moves the old one to `/data/pre-restore-<time>/` together
   with its WAL and Litestream's position. Log: `[start] Put the staged … in place`.
   Litestream then reports `detected database behind replica` and carries on from the restored
   state. That is expected.
5. Check the app. Delete `/data/pre-restore-<time>/` once you're sure.

To only look at an old state, restore to `-o /tmp/look.db` and leave it there. A file under
`/tmp` is gone with the container.

### From a nightly snapshot

This works with or without Litestream, from any day in `/data/backups`:

```bash
cp /data/backups/2026-10-20.db /data/choreganized.db.restore
```

Then restart, as in step 4. Litestream replicates the snapshot onwards like any restored state.

### Moving to a new server

1. Stop the app on the old server. Its last changes are uploaded on the way out. Leave it
   stopped: two running copies on one prefix break the replica.
2. Copy the photos: `/data/uploads` from the old volume to the new one.
3. Deploy on the new server with the same variables and an empty volume for the database
   (or one that holds only `uploads/`). The database restores itself.
4. Check the log for `Restored …` and look at the app. Then delete the old app.

## A restore test on your machine

This uses a throwaway S3 server in Docker (SeaweedFS; MinIO no longer publishes images) and
never touches B2. Run it from the repo root:

```bash
docker network create cg-restore-test
printf '{"identities":[{"name":"t","credentials":[{"accessKey":"local","secretKey":"local-secret"}],"actions":["Admin","Read","Write","List"]}]}' > /tmp/s3.json
docker run -d --name cg-s3 --network cg-restore-test -v /tmp/s3.json:/etc/s3.json:ro \
  chrislusf/seaweedfs server -s3 -s3.config=/etc/s3.json -volume.max=100
sleep 10   # until its S3 port answers
docker run --rm --network cg-restore-test -e AWS_ACCESS_KEY_ID=local -e AWS_SECRET_ACCESS_KEY=local-secret \
  amazon/aws-cli --region us-east-1 --endpoint-url http://cg-s3:8333 s3 mb s3://restore-test
docker build -t choreganized:restore-test .
cat > /tmp/restore-test.env <<'EOF'
ORIGIN=http://localhost:3300
BETTER_AUTH_URL=http://localhost:3300
BETTER_AUTH_SECRET=local-restore-test-secret-not-for-use
GOOGLE_CLIENT_ID=local
GOOGLE_CLIENT_SECRET=local
LITESTREAM_ACCESS_KEY_ID=local
LITESTREAM_SECRET_ACCESS_KEY=local-secret
LITESTREAM_S3_ENDPOINT=http://cg-s3:8333
LITESTREAM_S3_BUCKET=restore-test
LITESTREAM_S3_REGION=us-east-1
LITESTREAM_REPLICA_PATH=choreganized/local-test
EOF
start() { docker run -d --name cg-app --network cg-restore-test -p 3300:3000 --env-file /tmp/restore-test.env -v cg-restore-data:/data choreganized:restore-test; }
rows() { docker exec -w /app cg-app node -e "const db = require('better-sqlite3')('/data/choreganized.db'); $1"; }

start; sleep 8
rows "const ins = db.prepare(\"insert into user (id, name, email, created_at, updated_at) values (?, 'Restore test', ?, 0, 0)\"); for (let i = 1; i <= 25; i++) ins.run('restore-' + i, 'restore-' + i + '@example.test')"
sleep 12; docker stop cg-app; docker rm cg-app
docker volume rm cg-restore-data          # the database is gone
start; sleep 8; docker logs cg-app | head -3
rows "console.log(db.prepare(\"select count(*) n from user where id like 'restore-%'\").get())"   # { n: 25 }

docker rm -f cg-app cg-s3; docker volume rm cg-restore-data; docker network rm cg-restore-test
```

Without the six `LITESTREAM_*` lines in the env file, the same container starts with
`Litestream off` and no restore.
