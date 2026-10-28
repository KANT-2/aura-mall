#!/bin/sh
set -eu
# One atomically replaced role record per physical node. No shell code is sourced.
case "$AURA_DB_NODE" in
  db) data_root=/var/lib/postgresql/data ;;
  db-standby) data_root=/var/lib/postgresql/standby/data ;;
  *) echo 'Invalid database node.' >&2; exit 1 ;;
esac
IFS='|' read -r role PGDATA AURA_UPSTREAM_SERVICE < "/run/aura-db-state/node-$AURA_DB_NODE"
case "$PGDATA" in
  "$data_root"|"$data_root"/rejoined|"$data_root"/ha-*) ;;
  *) echo 'Invalid managed data directory.' >&2; exit 1 ;;
esac
export PGDATA AURA_UPSTREAM_SERVICE AURA_MANAGED_NODE=1
# Every managed primary requires a durable acknowledgement from the other node.
set -- "$@" -c synchronous_commit=remote_apply -c 'synchronous_standby_names=FIRST 1 (aura_standby)'
case "$role" in
  primary)
    if [ -e "/run/aura-db-state/fence-$AURA_DB_NODE" ] || [ ! -s "$PGDATA/PG_VERSION" ]; then
      echo 'Writer is fenced or its existing data is missing.' >&2; exit 1
    fi
    /bin/sh /opt/aura-postgres/install-tls.sh
    exec /usr/local/bin/docker-entrypoint.sh "$@"
    ;;
  standby)
    case "$AURA_UPSTREAM_SERVICE" in db|db-standby) ;; *) exit 1 ;; esac
    if [ "$AURA_UPSTREAM_SERVICE" = "$AURA_DB_NODE" ]; then exit 1; fi
    if [ -s "$PGDATA/PG_VERSION" ] && [ ! -e "$PGDATA/standby.signal" ]; then
      echo 'Refusing to start a former writer as a standby without a fresh copy.' >&2; exit 1
    fi
    exec /bin/sh /opt/aura-postgres/standby.sh "$@"
    ;;
  *) echo 'Missing or invalid managed database role.' >&2; exit 1 ;;
esac
