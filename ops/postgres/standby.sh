#!/bin/sh
set -eu
/bin/sh /opt/aura-postgres/install-tls.sh
/bin/sh /opt/aura-postgres/install-replication.sh
parent=$(dirname "$PGDATA")
install -d -m 700 -o postgres -g postgres "$parent"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  # Publish only a complete backup. Never start from a partially copied PG_VERSION.
  stage=$(mktemp -d "$parent/basebackup.XXXXXX")
  chown postgres:postgres "$stage"
  gosu postgres pg_basebackup \
    --dbname="host=${AURA_UPSTREAM_SERVICE:-db} port=5432 user=aura_replicator application_name=aura_standby sslmode=verify-full sslrootcert=/run/aura-ca.crt passfile=/var/lib/postgresql/replication.pgpass connect_timeout=10" \
    --pgdata="$stage" --write-recovery-conf --wal-method=stream --slot=aura_standby --checkpoint=fast
  mv "$stage" "$PGDATA"
fi
exec /usr/local/bin/docker-entrypoint.sh "$@"
