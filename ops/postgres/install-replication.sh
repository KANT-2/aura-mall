#!/bin/sh
set -eu
install -m 600 -o postgres -g postgres /run/aura-replication/pgpass /var/lib/postgresql/replication.pgpass.new
mv /var/lib/postgresql/replication.pgpass.new /var/lib/postgresql/replication.pgpass
