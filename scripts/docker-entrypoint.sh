#!/bin/sh
# The container's start (→ docs/BACKUP.md, DECISIONS #158). The app command arrives as
# "$@" (the Dockerfile's CMD, `node build/index.js`).
#
# No LITESTREAM_* variable set: run the app exactly as before, with no Litestream. That
# covers local Docker runs and any instance without off-site replication.
#
# All of them set:
#   1. restore the database from the replica, but only if the volume has no database yet
#      and the replica has one: a new server, or an emptied volume;
#   2. hand over to `litestream replicate -exec`, which runs the app as its child, forwards
#      SIGTERM/SIGINT to it, waits for it to exit and then uploads what is left.
#
# Some set, some not: refuse to start. A half-configured production that started without
# replication would only be noticed on the day it was needed.
#
# Before any of that, with or without Litestream: a database staged at
# "$DATABASE_PATH.restore" (a point-in-time restore, a nightly backup) replaces the
# current one, which moves to pre-restore-<time>/ beside it. The app holds the database
# open while it runs, so this is the one moment it can be swapped (→ docs/BACKUP.md).
set -eu

CONFIG=/etc/litestream.yml
REQUIRED='LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY LITESTREAM_S3_ENDPOINT LITESTREAM_S3_BUCKET LITESTREAM_S3_REGION LITESTREAM_REPLICA_PATH'

if [ -n "${DATABASE_PATH:-}" ] && [ -f "$DATABASE_PATH.restore" ] &&
	[ "$(head -c 15 "$DATABASE_PATH.restore")" != 'SQLite format 3' ]; then
	# An empty or foreign file would open as an empty database, and Litestream would make
	# that the newest state in the bucket. Keep the current database instead.
	mv "$DATABASE_PATH.restore" "$DATABASE_PATH.restore.rejected"
	echo "[start] $DATABASE_PATH.restore is not a SQLite database. Kept the current one, renamed it to .restore.rejected" >&2
fi

if [ -n "${DATABASE_PATH:-}" ] && [ -f "$DATABASE_PATH.restore" ]; then
	dir=$(dirname "$DATABASE_PATH")
	aside="$dir/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
	mkdir -p "$aside"
	# The database, its WAL (which holds committed pages of its own) and Litestream's
	# position in it. A position left behind would describe the old file.
	for file in "$DATABASE_PATH" "$DATABASE_PATH-wal" "$DATABASE_PATH-shm" "$dir/.$(basename "$DATABASE_PATH")-litestream"; do
		if [ -e "$file" ]; then mv "$file" "$aside/"; fi
	done
	mv "$DATABASE_PATH.restore" "$DATABASE_PATH"
	if [ -e "$DATABASE_PATH.restore-wal" ]; then mv "$DATABASE_PATH.restore-wal" "$DATABASE_PATH-wal"; fi
	rm -f "$DATABASE_PATH.restore-shm"
	echo "[start] Put the staged $DATABASE_PATH.restore in place. The previous database is in $aside"
fi

present=''
missing=''
for name in $REQUIRED; do
	eval "value=\${$name:-}"
	if [ -n "$value" ]; then
		present="$present $name"
	else
		missing="$missing $name"
	fi
done

if [ -z "$present" ]; then
	echo '[start] Litestream off (no LITESTREAM_* set): starting without off-site replication'
	exec "$@"
fi

if [ -n "$missing" ]; then
	echo "[start] Litestream is half-configured. Set these too, or unset all of them:$missing" >&2
	exit 1
fi

: "${DATABASE_PATH:?DATABASE_PATH must be set}"

# A restore that fails (the bucket can't be reached, the key is wrong) stops the start
# here. Starting anyway would create an empty database, and replicating that would make
# it the newest state in the bucket. Coolify restarts the container, which retries.
echo "[start] Litestream on: replica ${LITESTREAM_S3_BUCKET}/${LITESTREAM_REPLICA_PATH}"
had_database=$([ -e "$DATABASE_PATH" ] && echo yes || echo no)
# Litestream's position, left behind when only the database was deleted, describes a file
# that is gone. Litestream's docs say to clear it whenever the database is recreated.
position="$(dirname "$DATABASE_PATH")/.$(basename "$DATABASE_PATH")-litestream"
if [ "$had_database" = no ] && [ -e "$position" ]; then
	mv "$position" "$position.stale-$(date -u +%Y%m%dT%H%M%SZ)"
	echo "[start] No database, but a Litestream position: moved it aside before restoring"
fi
litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "$DATABASE_PATH"
if [ "$had_database" = no ] && [ -e "$DATABASE_PATH" ]; then
	echo "[start] Restored $DATABASE_PATH from the replica"
fi

# -exec takes one string, split on spaces again by Litestream, so the CMD's words must not
# contain spaces themselves. `node build/index.js` doesn't.
exec litestream replicate -config "$CONFIG" -exec "$*"
