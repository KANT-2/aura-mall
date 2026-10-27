#!/bin/sh
set -eu
install -d -m 700 -o postgres -g postgres /var/lib/postgresql/tls
install -m 600 -o postgres -g postgres /run/aura-server-tls/current/server.key /var/lib/postgresql/tls/server.key.new
install -m 644 -o postgres -g postgres /run/aura-server-tls/current/server.crt /var/lib/postgresql/tls/server.crt.new
mv /var/lib/postgresql/tls/server.key.new /var/lib/postgresql/tls/server.key
mv /var/lib/postgresql/tls/server.crt.new /var/lib/postgresql/tls/server.crt
