#!/bin/sh
set -eu
# A durable fence also prevents a future `compose up` from starting the former writer.
if [ -e /run/aura-db-state/fenced-primary ]; then
  if [ -e /run/aura-db-state/rejoin-primary ]; then
    # Keep the original database intact. The new copy has a separate data directory.
    export PGDATA=/var/lib/postgresql/data/rejoined
    export AURA_UPSTREAM_SERVICE=db-standby
    if [ -s "$PGDATA/PG_VERSION" ] && [ ! -e "$PGDATA/standby.signal" ]; then
      echo 'Rejoined database is missing its standby fence.' >&2
      exit 1
    fi
    exec /bin/sh /opt/aura-postgres/standby.sh "$@"
  fi
  echo 'Primary is fenced after promotion; follow the recovery runbook.' >&2
  exit 1
fi
/bin/sh /opt/aura-postgres/install-tls.sh
exec /usr/local/bin/docker-entrypoint.sh "$@"
